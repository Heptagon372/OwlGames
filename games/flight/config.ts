// 🦉 아울러닝 (OWL RUNNING) 튜닝 상수 — 기획서 §13
// 게임 안의 모든 수치는 여기에서만 온다. 엔진 코드에 매직넘버 금지.

export const CFG = {
  /** 논리 해상도 960×540 (16:9), CSS로 스케일 */
  view: { w: 960, h: 540 },
  physics: {
    gravity: 1800,
    flap: -2600, // 홀드 중 가산 → 합력 -800
    vyMaxDown: 900,
    vyMaxUp: -700,
    owlX: 220,
    pxPerMeter: 24,
    /** 고정 타임스텝 */
    dt: 1 / 60,
    /** 탭 복귀 시 순간이동 방지 */
    maxFrameSec: 0.25,
  },
  scroll: { v0: 288, vMax: 576, accelPer60s: 96 },
  energy: {
    maxBySize: { S: 80, M: 100, L: 130 },
    startRatio: 0.8,
    // 기획서 §5는 14/초지만, 봇 시뮬레이션(§16-6) 중앙값이 39초로 목표(60~90초)에 크게 못 미쳐 10으로 낮춤
    flapDrain: 10,
    colorCost: 2,
    passGain: 1,
    nearGain: 2,
    gateFail: 25,
    edgeHit: 10,
    lowRatio: 0.2,
    lowFlapMult: 0.7,
    fallGraceSec: 3,
    reviveTo: 30,
    /** 아이템 회복량 */
    feather: 20,
    bigFeather: 50,
    /** ⚡ 효율 버프 */
    efficiencySec: 8,
    efficiencyMult: 0.5,
  },
  size: {
    scale: { S: 0.7, M: 1.0, L: 1.35 },
    /** 히트박스는 스프라이트의 70% 타원 (러너 장르 관용) */
    hitboxRatio: 0.7,
    magnet: { S: 40, M: 60, L: 90 },
    changeIFrame: 0.3,
    changeTweenSec: 0.4,
    /** 기본(M) 스프라이트 반경 */
    baseRx: 26,
    baseRy: 22,
  },
  color: {
    cycleCooldown: 0.2,
    failSlow: 0.6,
    failSlowSec: 0.5,
    iFrame: 0.6,
    previewSec: 2,
    /** P4에서는 예고를 1초로 단축 */
    previewSecLate: 1,
  },
  score: {
    perMeter: 1,
    perPass: 10,
    nearMiss: 25,
    nearMissMarginPx: 12,
    comboStep: 10,
    comboStepMult: 0.25,
    comboMaxMult: 2.5,
    specialClear: 200,
    energyLeft: 2,
    breakWall: 100,
  },
  shield: { maxStack: 1 },
  rainbow: { sec: 5 },
  /** 페이즈 해금 (거리 m) — 기획서 §3 */
  phases: [
    { idx: 0, from: 0, hint: "꾹 눌러 상승", drainMult: 0.5, scroll: 288, gapW: 260 },
    { idx: 1, from: 200, hint: "색을 맞춰 통과", drainMult: 0.7, scroll: 312, gapW: 240 },
    { idx: 2, from: 500, hint: "작아지면 좁은 길로", drainMult: 1, scroll: 360, gapW: 220 },
    { idx: 3, from: 900, hint: "에너지를 아껴라", drainMult: 1, scroll: 432, gapW: 195 },
    { idx: 4, from: 1500, hint: "", drainMult: 1.1, scroll: 504, gapW: 180 },
  ],
  /** 2500m 이후 상한 */
  lateGame: { from: 2500, scroll: 576, gapW: 170, drainMult: 1.1 },
  special: {
    fromMeters: 1500,
    everyMeters: 400,
    chance: 0.35,
    lengthMeters: 300,
    turboMult: 1.4,
  },
  pause: { totalSec: 15 },
  death: { slowSec: 0.4 },
  platform: { K: 20, basePoints: 30, maxBonus: 270, maxSessionSec: 185 },
  /** 엔티티 크기 */
  entity: { pillarW: 56, wireH: 8, gateW: 18, wallW: 44, bugR: 16, itemR: 18, narrowBand: 70 },
} as const;

export type SizeKey = keyof typeof CFG.size.scale;
export const SIZE_ORDER: SizeKey[] = ["S", "M", "L"];

export type Color = "R" | "B" | "P";
export const COLOR_ORDER: Color[] = ["R", "B", "P"];

export const COLOR_INFO: Record<Color, { hex: string; shape: "circle" | "square" | "triangle"; label: string; key: string }> = {
  R: { hex: "#FF4D4D", shape: "circle", label: "레드", key: "1" },
  B: { hex: "#3DD9EB", shape: "square", label: "블루", key: "2" },
  P: { hex: "#A855F7", shape: "triangle", label: "퍼플", key: "3" },
};

export function nextColor(c: Color): Color {
  return COLOR_ORDER[(COLOR_ORDER.indexOf(c) + 1) % COLOR_ORDER.length];
}

/** 거리(m) → 페이즈 */
export function phaseFromMeters(m: number): number {
  let idx = 0;
  for (const p of CFG.phases) if (m >= p.from) idx = p.idx;
  return idx;
}

/** 거리(m) → 스크롤 속도 (§9) */
export function scrollFromMeters(m: number): number {
  if (m >= CFG.lateGame.from) return CFG.lateGame.scroll;
  const p = CFG.phases[phaseFromMeters(m)];
  const next = CFG.phases[p.idx + 1];
  if (!next) {
    // P4 구간은 2500m까지 선형 증가
    const t = Math.min(1, (m - p.from) / (CFG.lateGame.from - p.from));
    return p.scroll + (CFG.lateGame.scroll - p.scroll) * t;
  }
  const t = Math.min(1, (m - p.from) / (next.from - p.from));
  return p.scroll + (next.scroll - p.scroll) * t;
}

/** 거리(m) → 에너지 소비 배율 */
export function drainMultFromMeters(m: number): number {
  if (m >= CFG.lateGame.from) return CFG.lateGame.drainMult;
  return CFG.phases[phaseFromMeters(m)].drainMult;
}

export function comboMult(combo: number): number {
  return Math.min(CFG.score.comboMaxMult, 1 + Math.floor(combo / CFG.score.comboStep) * CFG.score.comboStepMult);
}
