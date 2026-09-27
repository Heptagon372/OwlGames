import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// 보안 헤더 (DECISIONS §5-27). 스크립트 CSP 는 테마 초기화 인라인 스크립트·Supabase 접속과 부딪히므로
// 깨질 일이 없는 지시어만 건다 — 다른 사이트가 iframe 으로 감싸기(클릭재킹) · 플러그인 · <base> 바꿔치기 ·
// 폼을 다른 곳으로 보내기를 막는다.
const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

// public/assets 는 20MB 가까이 되고(배경음악·홍보 영상·스프라이트 시트) Next 는 public 파일에
// 캐시 헤더를 달아 주지 않는다 — 부스 와이파이에서 폰마다 매번 다시 받으면 그게 트래픽의 대부분이다.
// 파일 이름이 곧 버전이므로 배포에서는 1년 immutable, 개발에서는 시트를 다시 자를 때 바로 보이게 캐시 없음.
const ASSET_CACHE =
  process.env.NODE_ENV === "production" ? "public, max-age=31536000, immutable" : "no-cache";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/assets/:path*", headers: [{ key: "Cache-Control", value: ASSET_CACHE }] },
    ];
  },
};

// 언어는 URL이 아니라 쿠키로 고른다 (§13) — 부스 행사용이라 SEO보다 "한 번 고르면 유지"가 중요하다
export default createNextIntlPlugin("./i18n/request.ts")(nextConfig);
