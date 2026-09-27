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

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

// 언어는 URL이 아니라 쿠키로 고른다 (§13) — 부스 행사용이라 SEO보다 "한 번 고르면 유지"가 중요하다
export default createNextIntlPlugin("./i18n/request.ts")(nextConfig);
