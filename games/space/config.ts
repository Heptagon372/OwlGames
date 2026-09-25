// 🚀 아울스페이스 (OWL SPACE) — 튜닝 상수 (기획서 §12)
// 게임 안의 모든 수치는 여기에서만 온다. 엔진 코드에 매직넘버 금지.

export const CFG = {
  /** 세로 고정 540×960 (가로 감지 시 회전 안내, §1) */
  screen: { w: 540, h: 960 },

  player: {
    lives: 3,
    speed: 280,
    preciseMult: 0.45,
    /** 피격 판정점 반경 — 탄막 장르의 핵심 배려 (§3) */
    hitboxR: 4,
    iFrameSec: 3,
    /** 손가락이 기체를 가리지 않게 위로 띄운다 (§2) */
    touchOffsetY: -80,
    /** 기체 렌더 반경 (판정과 다르다) */
    radius: 14,
    startY: 0.78,
  },

  /** 그레이즈 = 이 게임 점수의 핵심 (§4) */
  graze: { radius: 22, score: 15, chipGain: 1, bombGain: 1 },

  bomb: { start: 2, max: 4, grazePerBomb: 100, iFrameSec: 1.5, damage: 900, radius: 9999 },

  /** 칩 게이지: 12 + 4×(획득 횟수) (§5.1) */
  chip: { base: 12, step: 4, magnetR: 90, value: 1 },

  slots: { main: 1, sub: 3, passive: 4, maxLv: 4, choices: 3 },

  /** 패럴랙스 3레이어 — "달리는 느낌" (§2) */
  scroll: { bg: 60, mid: 240, fore: 600, streakPx: 24, accelMaxRatio: 0.35, bossSlowRatio: 0.4 },

  /** 스테이지 스케일 (§6) */
  stage: {
    count: 15,
    hpPerStage: 0.16,
    bulletSpeedPerStage: 0.05,
    densityPerStage: 0.09,
    multBase: 1.0,
    multPerStage: 0.06,
    multCap: 3.0,
    /** 엔드리스: 5스테이지마다 강화 보스 / 3스테이지마다 특수 규칙 */
    endlessBossEvery: 5,
    endlessRuleEvery: 3,
  },

  /** 런 타임라인 (§1 70~150초) */
  wave: { bossAt: 55, hardCapSec: 180 },

  /** 장애물 (§7) — 접촉은 넉백만, 피격 아님 */
  obstacle: { maxOnScreen: 4, areaMax: 0.07, chipDropMin: 2, chipDropMax: 4, bombDropRate: 0.1, spawnEvery: 2.2 },

  /** 연출 (§8) */
  feedback: {
    hitShakeSec: 0.35,
    hitShakePx: 8,
    hitSlowSec: 0.3,
    bombShakeSec: 0.25,
    flashSec: 0.08,
    logLines: 3,
    logFadeSec: 3,
    bossKillSlowSec: 0.8,
  },

  /** 성능 (§13) */
  perf: {
    maxBullets: 900,
    maxEnemies: 60,
    maxParticles: 200,
    maxChips: 256,
    maxObstacles: 8,
    gridCell: 48,
    fpsFloor: 45,
    lowFpsSec: 2,
  },

  /** 점수 (§10.1) */
  score: {
    perKill: 4,
    perGraze: 15,
    perChip: 2,
    perSec: 5,
    bossKilled: 500,
    stageCleared: 1000,
    perLife: 300,
    noMiss: 600,
    perBombUnused: 100,
  },

  /** 🦉 아울 에너지 인게임 드랍 — 서버 조건과 같은 값 */
  owlEnergy: { minStage: 3, chance: 0.3, requireClear: true },

  platform: { K: 20, basePoints: 30, maxBonus: 270, maxSessionSec: 200 },
} as const;

/** 칩 게이지에 필요한 칩 수 (획득 횟수 n) */
export function chipNeed(n: number): number {
  return CFG.chip.base + CFG.chip.step * n;
}

/** 스테이지 S 의 적 체력 배율 */
export function hpMult(stage: number): number {
  return 1 + CFG.stage.hpPerStage * (Math.max(1, stage) - 1);
}

/** 스테이지 S 의 탄 속도 배율 */
export function bulletSpeedMult(stage: number): number {
  return 1 + CFG.stage.bulletSpeedPerStage * (Math.max(1, stage) - 1);
}

/** 스테이지 S 의 탄 밀도 배율 */
export function densityMult(stage: number): number {
  return 1 + CFG.stage.densityPerStage * (Math.max(1, stage) - 1);
}

/** 스테이지 S 의 점수 배율 (§10.1) — 상한 ×3.0 */
export function stageScoreMult(stage: number): number {
  return Math.min(CFG.stage.multCap, CFG.stage.multBase + CFG.stage.multPerStage * (Math.max(1, stage) - 1));
}
