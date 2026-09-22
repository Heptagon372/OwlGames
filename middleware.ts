import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isDemo } from "@/lib/env";

// §4 라우트 접근 규칙: role · verified · 운영시간
const PLAYER_PREFIXES = ["/lobby", "/game", "/rank", "/ticket", "/me"];

export async function middleware(request: NextRequest) {
  if (isDemo) return NextResponse.next({ request });

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

  // 세션 갱신 겸 인증 확인 (getUser는 Auth 서버에서 토큰을 검증한다)
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  if (!user) {
    return needsLogin ? redirect(`/auth/login?next=${encodeURIComponent(path)}`) : response;
  }

  // 로그인 상태에서만 프로필 조회
  if (!needsLogin && !path.startsWith("/auth")) return response;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, verified")
    .eq("id", user.id)
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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)"],
};
