/**
 * 화면·소리 설정 (§13) — 전부 이 기기에만 저장한다(localStorage).
 * 서버가 알 필요가 없는 값들이라 DB에 넣지 않는다. 언어만 서버 렌더에 필요해서 쿠키(`lib/locale.ts`).
 */

export const SCALE_KEY = "owl-scale";
export const SOUND_KEY = "owl-sound";

/** 화면 크기 — rem 기준이라 글자와 여백이 같이 커진다 */
export const SCALES = [0.9, 1, 1.12, 1.25] as const;
export type Scale = (typeof SCALES)[number];
export const DEFAULT_SCALE: Scale = 1;

export function isScale(v: unknown): v is Scale {
  return typeof v === "number" && (SCALES as readonly number[]).includes(v);
}

export function applyScale(scale: Scale): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--ui-scale", String(scale));
  try {
    localStorage.setItem(SCALE_KEY, String(scale));
  } catch {
    // 저장 못 해도 이번 세션은 적용된다
  }
}

export function currentScale(): Scale {
  if (typeof document === "undefined") return DEFAULT_SCALE;
  const v = Number(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale"));
  return isScale(v) ? v : DEFAULT_SCALE;
}

/** 소리 */
export type SoundPrefs = { on: boolean; volume: number };
export const DEFAULT_SOUND: SoundPrefs = { on: true, volume: 0.6 };

export function readSound(): SoundPrefs {
  if (typeof localStorage === "undefined") return DEFAULT_SOUND;
  try {
    const raw = localStorage.getItem(SOUND_KEY);
    if (!raw) return DEFAULT_SOUND;
    const v = JSON.parse(raw) as Partial<SoundPrefs>;
    return {
      on: typeof v.on === "boolean" ? v.on : DEFAULT_SOUND.on,
      volume: typeof v.volume === "number" ? Math.min(1, Math.max(0, v.volume)) : DEFAULT_SOUND.volume,
    };
  } catch {
    return DEFAULT_SOUND;
  }
}

export function writeSound(prefs: SoundPrefs): void {
  try {
    localStorage.setItem(SOUND_KEY, JSON.stringify(prefs));
  } catch {
    // 무시
  }
}

/**
 * 첫 페인트 전에 화면 크기를 적용하는 인라인 스크립트.
 * 테마와 같은 이유 — 나중에 적용하면 글자 크기가 한 번 튄다.
 */
export const SCALE_INIT_SCRIPT = `(function(){try{var s=parseFloat(localStorage.getItem('${SCALE_KEY}'));if([0.9,1,1.12,1.25].indexOf(s)>=0){document.documentElement.style.setProperty('--ui-scale',String(s));}}catch(e){}})();`;
