/** 라이트/다크 (§13) — 값은 `app/globals.css`의 `:root[data-theme="light"]` 한 곳에만 있다 */

export type ThemeMode = "dark" | "light";

export const THEME_KEY = "owl-theme";

/** 지금 화면에 적용된 테마 (SSR에서는 다크) */
export function currentTheme(): ThemeMode {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** 적용 + 저장. 주소창·상태바 색도 같이 맞춘다 */
export function applyTheme(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = mode;
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    // 사파리 프라이빗 모드 등 — 저장 실패해도 이번 세션은 그대로 쓴다
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", mode === "light" ? "#eaeefb" : "#070b18");
}

/**
 * 첫 페인트 전에 실행되는 인라인 스크립트 (§13).
 * 저장값 → 없으면 OS 설정. 이게 없으면 라이트 사용자에게 어두운 화면이 한 번 번쩍인다.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem('${THEME_KEY}');if(m!=='light'&&m!=='dark'){m=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.dataset.theme=m;}catch(e){document.documentElement.dataset.theme='dark';}})();`;
