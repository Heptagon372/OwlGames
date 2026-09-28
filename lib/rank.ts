// 레벨·랭크·티어 계산 (표시용).
// DB 함수 level_from_points / rank_from_points / tier_from_rank / challenger_bonus_count 와 같은 식이어야 한다
// (supabase/migrations/20261020000000_rank_v2.sql — tests/rank.test.ts 가 숫자 표를 대조한다).
// 실제 포인트·레벨·티켓 지급은 서버 RPC만 한다.

export const MAX_LEVEL = 100;

export type LevelCurve = { base: number; step: number };
/** Lv 100 = 49,500P = 챌린저 (rank_v2) */
export const DEFAULT_CURVE: LevelCurve = { base: 50, step: 9 };

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

/** 뽑기 티어 T1~T11 — 티어 경계는 확 멀어지는 랭크(마스터·영겁·태초·정점)와 챌린저 */
export type Tier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
export const MAX_TIER = 11;

export type RankInfo = {
  idx: number;
  name: string;
  /** 이 랭크가 되는 누적 포인트 */
  minPoints: number;
  tier: Tier;
  /** 글자색 [밝은색, 어두운색] — 뱃지 그림에서 뽑은 색 */
  colors: [string, string];
  /** 특수 효과 */
  effect?: "glow" | "rainbow" | "challenger";
};

// 랭크 30단계 (DECISIONS §5-47). 간격(P):
//   나무→미스릴 100 부터 +20 · 마스터 700(×2.1) → 불멸 +40 · 영겁 1,840(×2.0) → 신화 +80
//   태초 4,000(×1.9) → 극점 +100 · 정점 8,600(×2.0) · 챌린저 8,800  → 챌린저 = 49,500P = Lv 100
export const RANKS: readonly RankInfo[] = [
  { idx: 0, name: "나무", minPoints: 0, tier: 1, colors: ["#8CF07A", "#1E6B1A"] },
  { idx: 1, name: "돌", minPoints: 100, tier: 1, colors: ["#C9D2DE", "#4B5563"] },
  { idx: 2, name: "아이언", minPoints: 220, tier: 1, colors: ["#D8E2EE", "#5B6B80"] },
  { idx: 3, name: "브론즈", minPoints: 360, tier: 2, colors: ["#F0AE6E", "#8A4B1C"] },
  { idx: 4, name: "실버", minPoints: 520, tier: 2, colors: ["#EEF3FA", "#8C9AB0"] },
  { idx: 5, name: "골드", minPoints: 700, tier: 2, colors: ["#FFD75E", "#B07A00"] },
  { idx: 6, name: "플래티넘", minPoints: 900, tier: 3, colors: ["#7FF2E6", "#138C80"] },
  { idx: 7, name: "에메랄드", minPoints: 1120, tier: 3, colors: ["#5FF0A0", "#0A7A48"] },
  { idx: 8, name: "다이아몬드", minPoints: 1360, tier: 3, colors: ["#8FC2FF", "#1E4FD0"] },
  { idx: 9, name: "루비", minPoints: 1620, tier: 4, colors: ["#FF7A92", "#A0102E"] },
  { idx: 10, name: "사파이어", minPoints: 1900, tier: 4, colors: ["#7FB0FF", "#1638A8"] },
  { idx: 11, name: "흑요석", minPoints: 2200, tier: 4, colors: ["#BE8CFF", "#3A1466"] },
  { idx: 12, name: "아다만티움", minPoints: 2520, tier: 5, colors: ["#D6A8FF", "#6528C9"] },
  { idx: 13, name: "미스릴", minPoints: 2860, tier: 5, colors: ["#8AEFF7", "#137A8A"] },
  { idx: 14, name: "마스터", minPoints: 3560, tier: 6, colors: ["#F6C66B", "#7B3FC0"] },
  { idx: 15, name: "그랜드마스터", minPoints: 4300, tier: 6, colors: ["#FF9A5C", "#B3121E"] },
  { idx: 16, name: "엘리트", minPoints: 5080, tier: 6, colors: ["#C79BFF", "#4B2AC0"] },
  { idx: 17, name: "초월자", minPoints: 5900, tier: 7, colors: ["#8AF7E8", "#0E8C88"], effect: "glow" },
  { idx: 18, name: "불멸자", minPoints: 6760, tier: 7, colors: ["#FF8AB0", "#A0124A"] },
  { idx: 19, name: "불멸", minPoints: 7660, tier: 7, colors: ["#B4CFFF", "#2A55C8"] },
  { idx: 20, name: "영겁", minPoints: 9500, tier: 8, colors: ["#FFBE5C", "#C24A00"] },
  { idx: 21, name: "전설", minPoints: 11420, tier: 8, colors: ["#FF7A5C", "#B01010"] },
  { idx: 22, name: "신성", minPoints: 13420, tier: 8, colors: ["#FFF0C8", "#A08850"], effect: "glow" },
  { idx: 23, name: "신화", minPoints: 15500, tier: 8, colors: ["#FF6FD8", "#3DD9EB"], effect: "rainbow" },
  { idx: 24, name: "태초", minPoints: 19500, tier: 9, colors: ["#9DAEFF", "#2A2FA8"] },
  { idx: 25, name: "성좌", minPoints: 23600, tier: 9, colors: ["#8AE4FF", "#1478C8"] },
  { idx: 26, name: "전상", minPoints: 27800, tier: 9, colors: ["#F28CFF", "#8A1AB0"] },
  { idx: 27, name: "극점", minPoints: 32100, tier: 9, colors: ["#9CC2FF", "#2440B8"] },
  { idx: 28, name: "정점", minPoints: 40700, tier: 10, colors: ["#EBC985", "#6A3AA0"], effect: "glow" },
  { idx: 29, name: "챌린저", minPoints: 49500, tier: 11, colors: ["#FFE08A", "#FF8A00"], effect: "challenger" },
];

export const MAX_RANK = RANKS.length - 1;
export const CHALLENGER_POINTS = RANKS[MAX_RANK].minPoints;

export function rankFromPoints(points: number): number {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (points >= RANKS[i].minPoints) return i;
  }
  return 0;
}

/** 티켓의 earned_rank_idx(보너스 티켓은 30, 31, … — 챌린저와 같은 T11) → 티어 */
export function tierFromRank(rankIdx: number): Tier {
  return RANKS[clampRank(rankIdx)].tier;
}

export function rankInfo(rankIdx: number): RankInfo {
  return RANKS[clampRank(rankIdx)];
}

/** 랭크 구간 표시용 "3,560P~4,299P" (챌린저는 "49,500P~") */
export function rankPointRange(rankIdx: number): string {
  const r = rankInfo(rankIdx);
  const next = RANKS[r.idx + 1];
  const f = (n: number) => n.toLocaleString("en-US");
  return next ? `${f(r.minPoints)}P~${f(next.minPoints - 1)}P` : `${f(r.minPoints)}P~`;
}

/** 다음 랭크까지 (챌린저면 null) */
export function nextRankAt(points: number): { idx: number; at: number } | null {
  const next = RANKS[rankFromPoints(points) + 1];
  return next ? { idx: next.idx, at: next.minPoints } : null;
}

// ---- 챌린저 이후 보너스 티켓 (SQL challenger_bonus_count 와 같은 정수 계산) ----
//   n번째 간격 = 앞 간격 × 1.25 를 100P 단위로 올림, 첫 앞 간격 = 정점 → 챌린저 (8,800)
//   → 60,500 · 74,300 · 91,600 · 113,300 · …
const BONUS_FIRST_GAP = CHALLENGER_POINTS - RANKS[MAX_RANK - 1].minPoints;

function nextGap(gap: number): number {
  return Math.floor((Math.floor((gap * 5) / 4) + 99) / 100) * 100;
}

/** 누적 포인트로 받을 수 있는 챌린저 보너스 티켓 수 */
export function challengerBonusCount(points: number): number {
  let gap = BONUS_FIRST_GAP;
  let at = CHALLENGER_POINTS;
  let n = 0;
  for (;;) {
    gap = nextGap(gap);
    at += gap;
    if (points < at) return n;
    n++;
  }
}

/** n번째(1부터) 챌린저 보너스 티켓이 나오는 누적 포인트 */
export function challengerBonusAt(n: number): number {
  let gap = BONUS_FIRST_GAP;
  let at = CHALLENGER_POINTS;
  for (let i = 0; i < n; i++) {
    gap = nextGap(gap);
    at += gap;
  }
  return at;
}

/** 보너스 티켓 이름 — 챌린저 +1, +2 … (earned_rank_idx 30 = +1) */
export function bonusIndex(earnedRankIdx: number): number {
  return Math.max(0, earnedRankIdx - MAX_RANK);
}

function clampRank(i: number): number {
  return Math.max(0, Math.min(MAX_RANK, Math.floor(i)));
}
