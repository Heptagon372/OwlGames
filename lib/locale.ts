/** 언어 (§13) — `/en/...` 같은 경로를 쓰지 않고 쿠키 하나로 고른다 */

export const LOCALES = ["ko", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ko";
export const LOCALE_COOKIE = "owl-lang";
/** 행사 기간(그리고 그 뒤)에도 그대로 남게 — 1년 */
export const LOCALE_MAX_AGE = 60 * 60 * 24 * 365;

export const LOCALE_LABEL: Record<Locale, string> = { ko: "한국어", en: "English" };

export function isLocale(v: string | undefined | null): v is Locale {
  return v === "ko" || v === "en";
}
