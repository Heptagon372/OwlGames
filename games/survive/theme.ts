// 🦉 아울 서바이버즈 — 테마 (기획서 §10.1)
//
// 다크는 **네온**(발광)으로, 라이트는 **외곽선 + 그림자**로 형태를 표현한다.
// 밝은 배경에서는 glow 가 그냥 안 보이기 때문에, 같은 코드로 두 테마를 그리면 라이트가 죽는다.
// 그래서 렌더는 `neon(ctx, theme, color)` / `outline(...)` 두 헬퍼만 보고 분기한다.
//
// 색의 역할은 절대 섞지 않는다 (DECISIONS §5-15):
//   내 공격 = 차가운 전기 파랑(부엉이와 같은 계열) · 가늘고 길다
//   적 공격 = 뜨거운 빨강~자홍 · 둥근 구체 + 외곽선
//   적 몸 = 사용자 제공 네온 도형 그림의 색 (도형마다 다르다 — `mobs`)
//   경험치 = 금색 보석 · 체력 = 초록
//   얼음 = 서리색 — 밝고 반투명하게 (경험치·내 공격과 헷갈리지 않게)

import type { MobKind } from "./data/stages";

export type ThemeId = "dark" | "light";

export type Theme = {
  id: ThemeId;
  bg: string;
  grid: string;
  surface: string;
  text: string;
  dim: string;
  /** 부엉이 스프라이트가 없을 때의 폴백 색 */
  player: string;
  enemy: string;
  boss: string;
  /** 경험치 보석 */
  xp: string;
  hp: string;
  obstacle: string;
  accent: string;
  danger: string;
  /** 내 공격 — 몸통 / 코어 */
  mine: string;
  mineCore: string;
  /** 내 공격 중 보조(위성·폭탄·장판) */
  mineAlt: string;
  /** ❄️ 얼음(둔화) — 반투명으로 쓴다 */
  ice: string;
  /** 적 공격 — 기본 / 감속탄 */
  foe: string;
  foeAlt: string;
  /** 도형별 네온 색 */
  mobs: Record<MobKind, string>;
  /** 발광을 쓸 수 있는 테마인가 (라이트는 외곽선으로 대체) */
  glow: boolean;
};

export const THEMES: Record<ThemeId, Theme> = {
  dark: {
    id: "dark",
    bg: "#070B18",
    grid: "#121A33",
    surface: "#101832",
    text: "#E8EDF7",
    dim: "#8A94AD",
    player: "#5B8CFF",
    enemy: "#FF4D6D",
    boss: "#C084FC",
    xp: "#FFC53D",
    hp: "#4ADE80",
    obstacle: "#2A3357",
    accent: "#A78BFA",
    danger: "#FF3B5C",
    mine: "#38BDF8",
    mineCore: "#E0F7FF",
    mineAlt: "#818CF8",
    ice: "#DDF4FF",
    foe: "#FF3D6E",
    foeAlt: "#FF4FD8",
    // 사용자 제공 몬스터 시트의 네온 색 (public/assets/survive-mobs)
    mobs: {
      tri: "#FFB81C",
      square: "#22C8F0",
      circle: "#FF4466",
      penta: "#5BF05B",
      hepta: "#3CC8FF",
      octa: "#FFB020",
      deca: "#B58CFF",
      hendeca: "#2EE6E6",
      dodeca: "#FF4FA3",
      tetradeca: "#58F06A",
    },
    glow: true,
  },
  light: {
    id: "light",
    bg: "#F4F6FB",
    grid: "#E3E8F2",
    surface: "#FFFFFF",
    text: "#101832",
    dim: "#5A6479",
    player: "#3B5BDB",
    enemy: "#D92B50",
    boss: "#7C3AED",
    xp: "#D97706",
    hp: "#16A34A",
    obstacle: "#B8C0D4",
    accent: "#B45309",
    danger: "#DC2626",
    mine: "#0369A1",
    mineCore: "#0EA5E9",
    mineAlt: "#4F46E5",
    ice: "#7DD3FC",
    foe: "#DC2626",
    foeAlt: "#A21CAF",
    mobs: {
      tri: "#D97706",
      square: "#0891B2",
      circle: "#E11D48",
      penta: "#16A34A",
      hepta: "#0284C7",
      octa: "#C2410C",
      deca: "#7C3AED",
      hendeca: "#0E7490",
      dodeca: "#DB2777",
      tetradeca: "#15803D",
    },
    glow: false,
  },
};

/** 단계별 바닥 액센트 (§10.3) — 15개를 돌려 쓰고 무한 구간도 같은 순환 */
const STAGE_ACCENT = [
  "#22D3EE", "#FFB020", "#7DD3FC", "#A78BFA", "#F472B6",
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
