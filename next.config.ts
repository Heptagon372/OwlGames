import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

// 언어는 URL이 아니라 쿠키로 고른다 (§13) — 부스 행사용이라 SEO보다 "한 번 고르면 유지"가 중요하다
export default createNextIntlPlugin("./i18n/request.ts")(nextConfig);
