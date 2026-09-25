// 🚀 아울스페이스 — 테마 (기획서 §9)
//
// **내 탄과 적 탄은 절대 같은 색·같은 모양이면 안 된다.** 탄막 게임에서 이게 무너지면 게임이 성립하지 않는다.
// 적 탄은 항상 외곽선(2px)을 둘러 배경과 분리한다 — 다크든 라이트든.

export type ThemeId = "dark" | "light";

export type SpaceTheme = {
  id: ThemeId;
  bg: string;
  nebula: string;
  star: string;
  streak: string;
  surface: string;
  text: string;
  dim: string;
  player: string;
  /** 내 탄 — 가늘고 긴 형태 */
  myBullet: string;
  /** 적 탄 — 둥근 구체 + 외곽선 */
  enemyBullet: string;
  enemyBulletEdge: string;
  enemy: string;
  boss: string;
  chip: string;
  graze: string;
  warn: string;
  danger: string;
  life: string;
  /** 다크만 발광을 쓴다 (라이트는 외곽선) */
  glow: boolean;
};

export const THEMES: Record<ThemeId, SpaceTheme> = {
  dark: {
    id: "dark",
    bg: "#070B18",
    nebula: "#131C3A",
    star: "#2A3557",
    streak: "#3E4E82",
    surface: "#141B33",
    text: "#E8EDF7",
    dim: "#8A94AD",
    player: "#FFB020",
    myBullet: "#3DD9EB",
    enemyBullet: "#FF5C7A",
    enemyBulletEdge: "#FFD9E1",
    enemy: "#C084FC",
    boss: "#F472B6",
    chip: "#4ADE80",
    graze: "#3DD9EB",
    warn: "#FF3B5C",
    danger: "#FF3B5C",
    life: "#FFB020",
    glow: true,
  },
  light: {
    id: "light",
    bg: "#F4F6FB",
    nebula: "#E3E8F2",
    star: "#C3CCDF",
    streak: "#9AA7C4",
    surface: "#FFFFFF",
    text: "#141B33",
    dim: "#5A6479",
    player: "#B45309",
    myBullet: "#0E7490",
    // 기획서는 #DC2626 이지만 배경(#F4F6FB) 대비가 4.47:1 로 §14-11(4.5:1)에 미달한다 → 한 단계 진하게
    enemyBullet: "#B91C1C",
    enemyBulletEdge: "#450A0A",
    enemy: "#7C3AED",
    boss: "#BE185D",
    chip: "#16A34A",
    graze: "#0E7490",
    warn: "#DC2626",
    danger: "#DC2626",
    life: "#B45309",
    glow: false,
  },
};

/** 스테이지별 성운 색 (§6 구역 구분) */
const STAGE_TINT = [
  "#3DD9EB", "#8B7355", "#A78BFA", "#FB923C", "#F472B6",
  "#67E8F9", "#FBBF24", "#60A5FA", "#C4B5FD", "#475569",
  "#F87171", "#FACC15", "#2DD4BF", "#818CF8", "#FF5C7A",
];

export function stageTint(stage: number): string {
  return STAGE_TINT[(Math.max(1, stage) - 1) % STAGE_TINT.length];
}

export function neon(ctx: CanvasRenderingContext2D, t: SpaceTheme, color: string, blur = 12): void {
  if (!t.glow) return;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}

export function alpha(hex: string, a: number): string {
  const v = hex.replace("#", "");
  const n = parseInt(v.length === 3 ? v.replace(/(.)/g, "$1$1") : v, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
