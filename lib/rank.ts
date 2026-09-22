// 레벨·랭크·티어 계산 (표시용).
// DB 함수 level_from_points / rank_from_level / tier_from_rank 와 동일한 로직이어야 한다. (§5)
// 실제 포인트·레벨·티켓 지급은 서버 RPC만 한다.

export const MAX_LEVEL = 100;

export type LevelCurve = { base: number; step: number };
export const DEFAULT_CURVE: LevelCurve = { base: 30, step: 5 };

/** 레벨 L 도달 누적 포인트: base(L−1) + step(L−1)L/2 */
export function cumPoints(level: number, curve: LevelCurve = DEFAULT_CURVE): number {
  const n = Math.max(0, Math.min(MAX_LEVEL, Math.floor(level)) - 1);
  return curve.base * n + (curve.step * n * (n + 1)) / 2;
}

/** 레벨 L → L+1 필요 포인트: base + step × L */
export function pointsToNext(level: number, curve: LevelCurve = DEFAULT_CURVE): number {
  return curve.base + curve.step * level;
}

export function levelFromPoints(points: number, curve: LevelCurve = DEFAULT_CURVE): number {
  let level = 1;
  while (level < MAX_LEVEL && cumPoints(level + 1, curve) <= points) level++;
  return level;
}

export type LevelProgress = {
  level: number;
  /** 현재 레벨 안에서 모은 포인트 */
  into: number;
  /** 다음 레벨까지 필요한 전체 포인트 (만렙이면 0) */
  need: number;
  /** 0~1 */
  ratio: number;
};

export function levelProgress(points: number, curve: LevelCurve = DEFAULT_CURVE): LevelProgress {
  const level = levelFromPoints(points, curve);
  if (level >= MAX_LEVEL) return { level, into: 0, need: 0, ratio: 1 };
  const floor = cumPoints(level, curve);
  const need = pointsToNext(level, curve);
  const into = points - floor;
  return { level, into, need, ratio: Math.min(1, into / need) };
}

export type Tier = 1 | 2 | 3 | 4 | 5 | 6;

export type RankInfo = {
  idx: number;
  name: string;
  /** 영문 약칭 (뱃지 안 글자) */
  short: string;
  minLevel: number;
  tier: Tier;
  /** 뱃지 그라데이션 [밝은색, 어두운색] */
  colors: [string, string];
  /** 특수 효과 */
  effect?: "glow" | "rainbow" | "challenger";
};

// §5.2 랭크 구간 / §13 뱃지 색
export const RANKS: readonly RankInfo[] = [
  { idx: 0, name: "나무", short: "WD", minLevel: 1, tier: 1, colors: ["#D39A5E", "#6E4323"] },
  { idx: 1, name: "돌", short: "ST", minLevel: 8, tier: 1, colors: ["#B8BEC8", "#555C68"] },
  { idx: 2, name: "아이언", short: "IR", minLevel: 15, tier: 1, colors: ["#E3E8EF", "#7A8594"] },
  { idx: 3, name: "브론즈", short: "BR", minLevel: 22, tier: 2, colors: ["#F0AE6E", "#8A4B1C"] },
  { idx: 4, name: "실버", short: "SV", minLevel: 28, tier: 2, colors: ["#FFFFFF", "#9BA6B6"] },
  { idx: 5, name: "골드", short: "GD", minLevel: 34, tier: 2, colors: ["#FFE680", "#C88A00"] },
  { idx: 6, name: "플래티넘", short: "PT", minLevel: 40, tier: 3, colors: ["#9CF5E6", "#1C8F84"] },
  { idx: 7, name: "에메랄드", short: "EM", minLevel: 46, tier: 3, colors: ["#6FF0B0", "#08784A"] },
  { idx: 8, name: "다이아몬드", short: "DI", minLevel: 52, tier: 3, colors: ["#D4F3FF", "#3A9FE0"] },
  { idx: 9, name: "루비", short: "RB", minLevel: 58, tier: 4, colors: ["#FF7FA3", "#9E0F45"] },
  { idx: 10, name: "사파이어", short: "SP", minLevel: 64, tier: 4, colors: ["#7FA6FF", "#1638A8"] },
  { idx: 11, name: "흑요석", short: "OB", minLevel: 70, tier: 4, colors: ["#8A63B8", "#1A1026"] },
  { idx: 12, name: "마스터", short: "MS", minLevel: 76, tier: 5, colors: ["#CDA8FF", "#6528C9"] },
  { idx: 13, name: "그랜드 마스터", short: "GM", minLevel: 82, tier: 5, colors: ["#F27DB8", "#86124F"] },
  { idx: 14, name: "초월자", short: "TR", minLevel: 88, tier: 5, colors: ["#FFFFFF", "#C9D2E6"], effect: "glow" },
  { idx: 15, name: "신화", short: "MY", minLevel: 94, tier: 5, colors: ["#FF6FD8", "#3DD9EB"], effect: "rainbow" },
  { idx: 16, name: "챌린저", short: "CH", minLevel: 100, tier: 6, colors: ["#FFE08A", "#FF8A00"], effect: "challenger" },
];

export const MAX_RANK = RANKS.length - 1;

export function rankFromLevel(level: number): number {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (level >= RANKS[i].minLevel) return i;
  }
  return 0;
}

export function tierFromRank(rankIdx: number): Tier {
  return RANKS[clampRank(rankIdx)].tier;
}

export function rankInfo(rankIdx: number): RankInfo {
  return RANKS[clampRank(rankIdx)];
}

/** 랭크 구간 표시용 "Lv 22~27" */
export function rankLevelRange(rankIdx: number): string {
  const r = rankInfo(rankIdx);
  const next = RANKS[r.idx + 1];
  const max = next ? next.minLevel - 1 : MAX_LEVEL;
  return r.minLevel === max ? `Lv ${max}` : `Lv ${r.minLevel}~${max}`;
}

function clampRank(i: number): number {
  return Math.max(0, Math.min(MAX_RANK, Math.floor(i)));
}
