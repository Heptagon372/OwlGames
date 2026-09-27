import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isConfigured } from "@/lib/env";

// §4 라우트 접근 규칙: role · verified · 운영시간
const PLAYER_PREFIXES = ["/lobby", "/game", "/rank", "/ticket", "/me"];

export async function middleware(request: NextRequest) {
  if (!isConfigured) {
    // Supabase 미설정: 볼 데이터가 없으니 로그인이 필요한 화면은 로그인(설정 안내 배너)으로 보낸다
    const path = request.nextUrl.pathname;
    const needsLogin =
      PLAYER_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`)) ||
      path === "/pending" ||
      path.startsWith("/booth") ||
      path.startsWith("/admin");
    if (!needsLogin) return NextResponse.next({ request });
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // 세션 갱신 겸 인증 확인. getClaims 는 만료된 토큰을 갱신하고 JWT 서명을 로컬에서 검증한다 —
  // 로비·랭킹이 30초마다 새로 고칠 때마다 Auth 서버를 왕복하지 않는다 (대칭 키 프로젝트면 getUser 로 돌아간다)
  const { data: auth } = await supabase.auth.getClaims();
  const uid = auth?.claims.sub;

  const path = request.nextUrl.pathname;
  const redirect = (to: string) => {
    const url = request.nextUrl.clone();
    const [pathname, query] = to.split("?");
    url.pathname = pathname;
    url.search = query ? `?${query}` : "";
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  const isPlayerRoute = PLAYER_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  const needsLogin = isPlayerRoute || path === "/pending" || path.startsWith("/booth") || path.startsWith("/admin");

  if (!uid) {
    return needsLogin ? redirect(`/auth/login?next=${encodeURIComponent(path)}`) : response;
  }

  // 로그인 상태에서만 프로필 조회
  if (!needsLogin && !path.startsWith("/auth")) return response;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, verified")
    .eq("id", uid)
    .maybeSingle();

  if (!profile) {
    // auth 계정은 있는데 프로필이 없다 (삭제 중 등) → 로그아웃 유도
    return path.startsWith("/auth") ? response : redirect("/auth/login?error=profile");
  }

  const isStaff = profile.role === "staff" || profile.role === "admin";

  if (path.startsWith("/auth")) return redirect(profile.verified ? "/lobby" : "/pending");
  if (path.startsWith("/admin") && profile.role !== "admin") return redirect(isStaff ? "/booth" : "/lobby");
  if (path.startsWith("/booth")) return isStaff ? response : redirect("/lobby");

  if (!profile.verified) return path === "/pending" ? response : redirect("/pending");
  if (path === "/pending") return redirect("/lobby");

  if (path.startsWith("/game/")) {
    const { data: open } = await supabase.rpc("is_open");
    if (open === false) return redirect("/lobby?closed=1");
  }

  return response;
}

// 미들웨어는 판단할 것이 있는 경로에서만 돈다. 예전 "전부 통과" 매처는 첫 화면·전광판·설정은 물론
// 배경음악(.mp3)·홍보 영상(.mp4)·폰트 요청마다 Supabase Auth 왕복을 한 번씩 끼워 넣고 있었다 —
// 부스 와이파이에서 첫 연결이 느리던 가장 큰 이유다. 최종 판단은 어차피 서버 RPC 가 한다.
export const config = {
  matcher: [
    "/lobby/:path*",
    "/game/:path*",
    "/rank/:path*",
    "/ticket/:path*",
    "/me/:path*",
    "/pending",
    "/booth/:path*",
    "/admin/:path*",
    "/auth/:path*",
  ],
};
