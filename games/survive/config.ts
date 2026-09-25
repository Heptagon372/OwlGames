// 🦉 아울 서바이버즈 v2 — 튜닝 상수 (기획서 §13)
// 게임 안의 모든 수치는 여기에서만 온다. 엔진 코드에 매직넘버 금지.

export const CFG = {
  /** 논리 해상도 — 가로 고정 (세로면 회전 안내, §2) */
  view: { w: 960, h: 540 },
  /** 맵(아레나). 카메라가 플레이어를 따라가되 이 안으로 제한된다.
   *  장애물 "밀도 6~9%"(§8)는 이 면적 기준이라 경계가 반드시 필요하다. */
  arena: { w: 1600, h: 900 },

  player: { hp: 100, speed: 190, iFrameSec: 0.8, pickupRadius: 70, radius: 13 },

  /** 레벨업 XP 곡선 (§13) */
  xp: { base: 10, step: 7, maxLevel: 24 },

  slots: { active: 6, passive: 6 },

  card: {
    choices: 3,
    reroll: 1,
    skip: 1,
    skipXpRatio: 0.1,
    /** Lv10 이후 신규 스킬 등장 확률 (§7 추첨 규칙 3) */
    newSkillRateAfterLv10: 0.4,
    /** Lv6 이전에는 신규 액티브 최소 1장 보장 */
    newActiveBeforeLv: 6,
    /** 같은 카드 3회 연속 금지 */
    noRepeat: 3,
    /** 체력 30% 이하면 구제 패시브 가중치 2배 */
    lowHpRatio: 0.3,
    lowHpWeight: 2,
  },

  evolution: { activeMaxLv: 5, passiveReqLv: 3, forceTopSlot: true, maxSkillLv: 5 },

  /** 런 타임라인 (§3) */
  wave: { w1End: 40, midbossAt: 40, w2Start: 55, bossAt: 100, hardCapSec: 180 },

  /** 스테이지 스케일 (§4·§5) */
  stage: {
    count: 15,
    hpPerStage: 0.18,
    atkPerStage: 0.12,
    /** 적이 주는 XP 도 스테이지마다 오른다 — 안 그러면 체력만 2배가 돼서 시작하자마자 밀린다 */
    xpPerStage: 0.14,
    multBase: 1.0,
    multPerStage: 0.06,
    multCap: 3.0,
    /** 무한 구간: 5스테이지마다 강화 보스 */
    endlessBossEvery: 5,
    /** 무한 구간: 3스테이지마다 특수 규칙 1개 */
    endlessRuleEvery: 3,
    /** 시작 보정 — 높은 스테이지에 갈수록 "장비를 갖추고" 들어간다 (§DECISIONS) */
    startLevelEvery: 3,
    startSkillEvery: 5,
    startHpPerStage: 8,
  },

  /** 장애물 (§8) — 밀도 상한이 이 시스템의 핵심 */
  obstacle: {
    densityMin: 0.06,
    densityMax: 0.09,
    minCorridorPx: 140,
    spawnClearRadius: 200,
    hpDropRate: 0.12,
    hpDropAmount: 8,
    bossClearRatio: 0.4,
    xpMin: 1,
    xpMax: 3,
    /** 배치 시도 상한 (무한 루프 금지) */
    maxAttempts: 2000,
  },

  /** 피격 연출 (§9.1) */
  feedback: {
    shakeSec: 0.25,
    shakePx: 6,
    bossShakeSec: 0.4,
    bossShakePx: 12,
    hitFlashSec: 0.08,
    logLines: 5,
    logFadeSec: 3,
    lowHpRatio: 0.3,
    evoFreezeSec: 0.6,
  },

  /** 스폰 (§14) */
  spawn: { budgetPerSec: 6, ringMin: 560, ringMax: 680 },

  /** 성능 (§14) */
  perf: {
    maxEnemies: 180,
    maxEnemiesLow: 120,
    maxProjectiles: 256,
    maxParticles: 256,
    maxOrbs: 512,
    maxHazards: 48,
    maxObstacles: 64,
    gridCell: 64,
    fpsFloor: 45,
    lowFpsSec: 2,
    /** XP 조각이 이 수를 넘으면 가까운 것끼리 병합 */
    orbMergeAbove: 60,
  },

  /** 점수 (§11.1) */
  score: {
    perKill: 3,
    perSec: 6,
    perLevel: 40,
    perEvolution: 300,
    midboss: 250,
    stageCleared: 1000,
    perObstacle: 8,
    noDamage: 500,
  },

  /** 🦉 아울 에너지 인게임 드랍 — 서버 조건과 같은 값이어야 한다 */
  owlEnergy: { minStage: 3, chance: 0.3, requireClear: true },

  platform: { K: 20, basePoints: 30, maxBonus: 270, maxSessionSec: 200 },
} as const;

/** 레벨 L → L+1 에 필요한 XP (§13) */
export function xpToNext(level: number): number {
  return CFG.xp.base + CFG.xp.step * level;
}

/** 스테이지 S 의 적 체력 배율 (§4) */
export function hpMult(stage: number): number {
  return 1 + CFG.stage.hpPerStage * (Math.max(1, stage) - 1);
}

/** 스테이지 S 의 적 공격력 배율 (§4) */
export function atkMult(stage: number): number {
  return 1 + CFG.stage.atkPerStage * (Math.max(1, stage) - 1);
}

/** 스테이지 S 의 XP 배율 — 스테이지가 올라가면 성장도 빨라진다 */
export function xpMult(stage: number): number {
  return 1 + CFG.stage.xpPerStage * (Math.max(1, stage) - 1);
}

/** 스테이지 S 의 점수 배율 (§5) — 상한 ×3.0 */
export function stageScoreMult(stage: number): number {
  return Math.min(CFG.stage.multCap, CFG.stage.multBase + CFG.stage.multPerStage * (Math.max(1, stage) - 1));
}
