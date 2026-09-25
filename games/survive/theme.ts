// 🦉 아울 서바이버즈 v2 — 테마 (기획서 §10.1)
//
// 다크는 **네온**(발광)으로, 라이트는 **외곽선 + 그림자**로 형태를 표현한다.
// 밝은 배경에서는 glow 가 그냥 안 보이기 때문에, 같은 코드로 두 테마를 그리면 라이트가 죽는다.
// 그래서 렌더는 `neon(ctx, theme, color)` / `outline(...)` 두 헬퍼만 보고 분기한다.

export type ThemeId = "dark" | "light";

export type Theme = {
  id: ThemeId;
  bg: string;
  grid: string;
  surface: string;
  text: string;
  dim: string;
  player: string;
  enemy: string;
  boss: string;
  xp: string;
  hp: string;
  obstacle: string;
  accent: string;
  danger: string;
  /** 발광을 쓸 수 있는 테마인가 (라이트는 외곽선으로 대체) */
  glow: boolean;
};

export const THEMES: Record<ThemeId, Theme> = {
  dark: {
    id: "dark",
    bg: "#0B1020",
    grid: "#151C30",
    surface: "#141B33",
    text: "#E8EDF7",
    dim: "#8A94AD",
    player: "#FFB020",
    enemy: "#FF5C7A",
    boss: "#C084FC",
    xp: "#3DD9EB",
    hp: "#4ADE80",
    obstacle: "#3A4463",
    accent: "#FFB020",
    danger: "#FF3B5C",
    glow: true,
  },
  light: {
    id: "light",
    bg: "#F4F6FB",
    grid: "#E3E8F2",
    surface: "#FFFFFF",
    text: "#141B33",
    dim: "#5A6479",
    player: "#B45309",
    enemy: "#D92B50",
    boss: "#7C3AED",
    xp: "#0891B2",
    hp: "#16A34A",
    obstacle: "#B8C0D4",
    accent: "#B45309",
    danger: "#DC2626",
    glow: false,
  },
};

/** 스테이지별 바닥 액센트 (§10.3) — 15개를 돌려 쓰고 무한 구간도 같은 순환 */
const STAGE_ACCENT = [
  "#3DD9EB", "#FFB020", "#7DD3FC", "#A78BFA", "#F472B6",
  "#4ADE80", "#FB923C", "#60A5FA", "#F87171", "#C084FC",
  "#FACC15", "#2DD4BF", "#818CF8", "#FB7185", "#F59E0B",
];

export function stageAccent(stage: number): string {
  return STAGE_ACCENT[(Math.max(1, stage) - 1) % STAGE_ACCENT.length];
}

/**
 * 발광(네온) 켜기. 라이트 테마에서는 아무것도 하지 않는다 — 대신 호출부가 외곽선을 그린다.
 * 반드시 `ctx.save()` 안에서 쓰고, 끝나면 `ctx.restore()` 로 되돌린다.
 */
export function neon(ctx: CanvasRenderingContext2D, theme: Theme, color: string, blur = 12): void {
  if (!theme.glow) return;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}

/** 라이트 테마에서만 외곽선을 입힌다 (형태 대비 4.5:1 확보, §10.1) */
export function outline(ctx: CanvasRenderingContext2D, theme: Theme, width = 2): boolean {
  if (theme.glow) return false;
  ctx.lineWidth = width;
  ctx.strokeStyle = "rgba(20,27,51,0.55)";
  return true;
}

/** #RRGGBB + 알파 → rgba() */
export function alpha(hex: string, a: number): string {
  const v = hex.replace("#", "");
  const n = parseInt(v.length === 3 ? v.replace(/(.)/g, "$1$1") : v, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
