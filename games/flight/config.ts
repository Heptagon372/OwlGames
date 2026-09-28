// 🦉 아울러닝 (OWL RUNNING) 튜닝 상수 — 기획서 §13 + 2.0 (§17~)
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
    // 체력(에너지 최대치) — 2.0 에서 늘렸고(예전 S 80 · M 100 · L 130 → 110 · 140 · 180), 밸런스 v4 에서 한 번 더 (§5-37).
    // 서버 flight_raw 의 energy_left 상한(240)과 짝
    maxBySize: { S: 150, M: 190, L: 240 },
    // 초반이 너무 어렵다는 피드백 — 가득 찬 상태로 시작 (예전 80%)
    startRatio: 1,
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
    /** 2.0: NEAR MISS 는 +50 (죽을 뻔할수록 보상) */
    nearMiss: 50,
    nearMissMarginPx: 12,
    comboStep: 10,
    comboStepMult: 0.25,
    comboMaxMult: 2.5,
    specialClear: 200,
    energyLeft: 2,
    breakWall: 100,
  },
  /** 🛡️ 보호 깃털은 최대 2겹 (선택형 보상 "SHIELD ×2") */
  shield: { maxStack: 2 },
  /**
   * 🦉 아울 에너지 드롭 — 높은 스테이지에서 가끔 등장 (실제 지급은 서버가 판정).
   * 서버 조건(app_config.owl_energy: drop_min_phase 3 · drop_min_distance 900)과 같은 값이어야 한다.
   */
  owlEnergy: { minPhase: 3, minMeters: 900, chance: 0.16, score: 100 },
  rainbow: { sec: 5 },

  /**
   * 🦉 아울러닝 2.0 — 플레이어가 보는 15단계 (거리 m 기준).
   * P0~P4(`phase`)는 청크 풀·통로 폭을 고르는 내부 난이도로 그대로 쓴다.
   * `key`는 그 단계에서 새로 등장하는 요소 (배너 문구 `hud.flight.stage.<key>`).
   * 한 단계는 평균 8~9초 — 숙련자가 약 130초에 ∞ 에 들어가게 맞췄다 (한 판 상한 540초 — 서버 max_sec 600).
   */
  // `cap`: 이 단계에서 고를 청크 난이도 상한 (없으면 페이즈 기본값) — 초반을 쉽게
  stages: [
    { from: 0, scroll: 264, phase: 0, drain: 0.3, cap: 1, key: "flight" },
    { from: 100, scroll: 276, phase: 1, drain: 0.4, cap: 2, key: "color" },
    { from: 205, scroll: 292, phase: 1, drain: 0.5, cap: 2, key: "energy" },
    { from: 315, scroll: 312, phase: 2, drain: 0.6, cap: 3, key: "size" },
    { from: 430, scroll: 336, phase: 2, drain: 0.7, cap: 3, key: "laser" },
    { from: 555, scroll: 372, phase: 3, drain: 0.9, key: "moving" },
    { from: 690, scroll: 396, phase: 3, drain: 0.9, key: "wave" },
    { from: 835, scroll: 420, phase: 3, drain: 1, key: "power" },
    { from: 990, scroll: 444, phase: 4, drain: 1, key: "storm" },
    { from: 1155, scroll: 468, phase: 4, drain: 1.05, key: "missile" },
    { from: 1330, scroll: 492, phase: 4, drain: 1.05, key: "turbo" },
    { from: 1515, scroll: 516, phase: 4, drain: 1.1, key: "glitch" },
    { from: 1710, scroll: 540, phase: 4, drain: 1.1, key: "barrage" },
    { from: 1910, scroll: 558, phase: 4, drain: 1.1, key: "chaos" },
    { from: 2110, scroll: 576, phase: 4, drain: 1.1, key: "final" },
  ],
  /**
   * 페이즈별 청크 검증 기준 (통로 최소 폭 · 검증 스크롤 속도) — `chunks/verify.ts`.
   * 검증 속도는 그 페이즈가 쓰이는 단계들의 기본 속도 근처로 잡는다.
   * 터보·오버드라이브·∞ 처럼 이보다 빠른 구간에서는 스포너가 난이도 3 이하 청크만 고른다.
   */
  phaseRef: [
    { gapW: 260, scroll: 300 },
    { gapW: 240, scroll: 330 },
    { gapW: 220, scroll: 372 },
    { gapW: 195, scroll: 444 },
    { gapW: 180, scroll: 504 },
  ],
  /**
   * 🐣 초보 보호 — `untilStage` 단계까지는 실수가 덜 아프다.
   * 색 틀림 -25 → -10 (감속 없음) · 천장/바닥 -10 → -4 · 보호막 1겹을 들고 시작하고 단계마다 1겹으로 다시 채운다.
   */
  beginner: { untilStage: 4, gateFail: 10, edgeHit: 4, shield: 1 },
  /** 15단계 완주 뒤 ∞ INFINITE — `every` m 마다 무한 레벨 +1 */
  infinite: {
    from: 2440,
    every: 400,
    /** 무한 레벨당 속도 +2.5%, 최대 +20% */
    scrollStep: 0.025,
    scrollMaxMult: 1.2,
    /** 레이저 경고 시간 배율 (레벨당 -5%, 하한 65%) */
    warnStep: 0.05,
    warnMin: 0.65,
    enterBonus: 1000,
  },
  /** 15단계 마지막 300m — OVERDRIVE (속도·점수·아이템 ×, 에너지가 저절로 줄어든다) */
  overdrive: { lastMeters: 300, scrollMult: 1.3, scoreMult: 2, drainPerSec: 3 },
  /** 단계 완주 보너스 = 단계 × perStage */
  stageClear: { perStage: 50 },

  /** 세트피스(코드로 만드는 특수 청크) — 새 요소는 단계 첫 청크에서 반드시 한 번 나오고, 이후 확률로 섞인다 */
  setPiece: { baseChance: 0.28, perStage: 0.02, maxChance: 0.55, infiniteChance: 0.55 },
  /** ⚠️ 레이저 — 경고선 → 발사. 경고 없는 즉사기 금지 (레이저는 즉사가 아니라 에너지 피해) */
  laser: { warn: 1.5, fire: 0.5, thick: 30, damage: 28, eventWarn: 2.4, barrageGap: 0.6, barrageThick: 70 },
  /** 🚀 추적 미사일 — LOCK ON 경고 후 발사 */
  missile: {
    fromStage: 10,
    lockSec: 1.2,
    /** 락온 뒤 이 시간 동안은 조준점이 고정된다 (피할 틈) */
    freezeSec: 0.35,
    speed: 520,
    homing: 110,
    r: 12,
    damage: 28,
    interval: 7,
    intervalJitter: 2.5,
    breakScore: 80,
  },
  /** 🌊 파동 · 중력 반전 · 폭풍 (px/s²) */
  wave: { accel: 900, period: 1.4 },
  flip: { warnSec: 1.0 },
  gravityChaos: { every: 1.6, warnSec: 0.5 },
  wind: { accel: 560, every: 1.2, sec: 5 },
  /** 🔥 COLOR POWER — PERFECT 를 끊기지 않고 `need`번 이으면 충전 (8단계부터) */
  power: {
    fromStage: 8,
    need: 10,
    breakerSec: 5,
    freezeSec: 4,
    freezeScale: 0.35,
    phantomSec: 3,
    /** 브레이커 발동 순간 앞쪽 이 거리 안의 장애물을 전부 부순다 */
    breakerReach: 560,
    breakScore: 60,
  },
  /** 색 PERFECT 연속 — 3연속 ×1.5, 5연속 ×2 (8단계부터 점수 배율) */
  colorChain: { x15: 3, x2: 5 },
  /** PERFECT 1회 기본 점수 · 색 체인 세트피스 보너스 (+100 → +150 → +200 → +300) */
  perfect: { score: 40, chainBonus: [100, 150, 200, 300], burstSec: 4, burstBonus: 200 },
  /** NEAR MISS 연속 — 3회 DANGER ×1.5 · 5회 FEVER 게이지 폭발. `window`초 안에 이어야 한다 */
  nearChain: { window: 3.2, danger: 3, dangerMult: 1.5, fever: 5 },
  /** 🔥 OWL FEVER */
  fever: {
    sec: 8,
    scoreMult: 3,
    drainMult: 0.5,
    magnet: 170,
    gain: { perfect: 7, near: 9, item: 3, pass: 1.5, chain: 20, nearChain5: 35 },
  },
  /** 아이템 버프 */
  buff: { magnetSec: 10, magnetR: 170, doubleSec: 10, rageSec: 5, phantomSec: 3 },
  /** 모든 점수 배율의 곱 상한 (서버 bonus 상한과 짝) */
  multCap: 5,
  /** 선택형 보상 — 이 단계에 들어설 때 CHOOSE 1 (∞ 에서는 `infiniteEvery` 레벨마다) */
  choice: { atStages: [5, 9, 13, 16], infiniteEvery: 3, autoSec: 7, resumeIFrame: 0.8 },
  /** 랜덤 이벤트 — `from`단계부터 `everyMeters`마다 `chance` */
  events: {
    fromStage: 5,
    everyMeters: 300,
    infiniteEveryMeters: 230,
    chance: 0.55,
    featherRainSec: 4,
    featherRainScore: [10, 20, 30, 50],
    phantomWorldSec: 5,
    phantomWorldItemMult: 3,
    goldenScore: 500,
    goldenGap: 100,
    turboSec: 6,
    turboMult: [1.25, 1.5],
    turboItemMult: 2,
    colorChaosSec: 6,
    colorChaosEvery: 1.5,
    glitchSec: 5,
  },
  /** 글리치 게이트 (12단계~) — 예고와 실제 색이 다르다. 도착 `revealSec` 초 전에 진짜 색이 드러난다 */
  glitch: { fromStage: 12, chance: 0.3, flickerSec: 1.0, revealSec: 0.62 },
  /** 아이템 등급 올리기 (JSON 청크의 ⭐·🪶 일부를 희귀·전설로) */
  upgrade: { fromStage: 5, rare: 0.14, legendaryFromStage: 9, legendary: 0.08 },

  death: { slowSec: 0.4 },
  platform: { K: 100, basePoints: 30, maxBonus: 270, maxSessionSec: 540 },
  /** 서버 검증 — 순간 최고 속도(터보·오버드라이브)가 24m/s 를 넘으므로 평균 상한을 올렸다 */
  server: { maxAvgMps: 30 },
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

export type StageKey = (typeof CFG.stages)[number]["key"];

/** 마지막 정식 단계 (이후는 ∞) */
export const FINAL_STAGE = CFG.stages.length;

/**
 * 거리(m) → 단계. 1~15, ∞ 에서는 16, 17, … (16 = ∞ Lv.1)
 * HUD 는 16 이상을 "∞ Lv.n"으로 보여준다.
 */
export function stageFromMeters(m: number): number {
  if (m >= CFG.infinite.from) return FINAL_STAGE + 1 + Math.floor((m - CFG.infinite.from) / CFG.infinite.every);
  let s = 1;
  for (let i = 0; i < CFG.stages.length; i++) if (m >= CFG.stages[i].from) s = i + 1;
  return s;
}

/** ∞ 레벨 (15단계까지는 0) */
export function infiniteLevel(stage: number): number {
  return Math.max(0, stage - FINAL_STAGE);
}

export function stageDef(stage: number) {
  return CFG.stages[Math.min(FINAL_STAGE, Math.max(1, stage)) - 1];
}

/** 다음 단계가 시작되는 거리 (∞ 에서는 다음 무한 레벨) */
export function stageEndMeters(stage: number): number {
  if (stage < FINAL_STAGE) return CFG.stages[stage].from;
  if (stage === FINAL_STAGE) return CFG.infinite.from;
  return CFG.infinite.from + infiniteLevel(stage) * CFG.infinite.every;
}

export function stageStartMeters(stage: number): number {
  if (stage <= FINAL_STAGE) return stageDef(stage).from;
  return CFG.infinite.from + (infiniteLevel(stage) - 1) * CFG.infinite.every;
}

/** 15단계 마지막 300m */
export function isOverdrive(m: number): boolean {
  return m >= CFG.infinite.from - CFG.overdrive.lastMeters && m < CFG.infinite.from;
}

/** 거리(m) → 내부 페이즈 P0~P4 (청크 풀 · 아울 에너지 서버 조건) */
export function phaseFromMeters(m: number): number {
  return stageDef(stageFromMeters(m)).phase;
}

/** 거리(m) → 기본 스크롤 속도. 단계 안에서는 다음 단계 속도로 선형 보간, ∞ 는 레벨마다 조금씩 */
export function scrollFromMeters(m: number): number {
  const stage = stageFromMeters(m);
  if (stage > FINAL_STAGE) {
    const mult = Math.min(CFG.infinite.scrollMaxMult, 1 + infiniteLevel(stage) * CFG.infinite.scrollStep);
    return CFG.scroll.vMax * mult;
  }
  const cur = stageDef(stage);
  const nextScroll = stage < FINAL_STAGE ? CFG.stages[stage].scroll : CFG.scroll.vMax;
  const t = Math.min(1, (m - cur.from) / Math.max(1, stageEndMeters(stage) - cur.from));
  return cur.scroll + (nextScroll - cur.scroll) * t;
}

/** 거리(m) → 에너지 소비 배율 */
export function drainMultFromMeters(m: number): number {
  return stageDef(stageFromMeters(m)).drain;
}

/** ∞ 레벨이 오를수록 레이저 경고가 짧아진다 */
export function warnMult(stage: number): number {
  return Math.max(CFG.infinite.warnMin, 1 - infiniteLevel(stage) * CFG.infinite.warnStep);
}

export function comboMult(combo: number): number {
  return Math.min(CFG.score.comboMaxMult, 1 + Math.floor(combo / CFG.score.comboStep) * CFG.score.comboStepMult);
}
