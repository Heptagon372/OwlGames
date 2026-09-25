import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from "@/lib/locale";

/**
 * 요청마다 언어를 정한다 (next-intl, 경로 없는 구성).
 * 쿠키에 고른 언어가 없으면 한국어 — 행사장 기본은 한국어다.
 */
export default getRequestConfig(async () => {
  const raw = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
