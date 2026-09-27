// 🦉 아울 서바이버즈 v3 — 튜닝 상수 (기획서 §13)
// 게임 안의 모든 수치는 여기에서만 온다. 엔진 코드에 매직넘버 금지.

import type { BossKind } from "./data/stages";

export const CFG = {
  /** 논리 해상도 — 가로 고정 (세로면 회전 안내, §2) */
  view: { w: 960, h: 540 },

  player: { hp: 100, speed: 190, iFrameSec: 0.8, pickupRadius: 70, radius: 13 },

  /** 경험치 조각 — 무한 맵에서 도망치며 싸우니, 멀리 흘린 조각도 따라오게 한다 */
  orb: { nearAccel: 1400, farAccel: 700, damping: 0.92, vacuumSec: 1.5 },

  /** 레벨업 XP 곡선 (§6) — 한 런이 15단계를 넘어 계속 가므로 상한을 넉넉히 둔다 */
  xp: { base: 10, step: 7, maxLevel: 60 },

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

  /** 단계 진행 (§2) — 한 런 안에서 1 → 15 → 무한으로 올라간다 */
  stage: {
    count: 15,
    /** 보스가 없는 단계의 길이 */
    normalSec: 30,
    /** 14단계 총력전 */
    allOutSec: 40,
    /** 단계마다 누적되는 적 체력·공격력 */
    hpPerStage: 0.18,
    atkPerStage: 0.12,
    /** 적이 주는 XP 도 단계마다 오른다 — 안 그러면 체력만 늘어서 성장이 적을 못 따라간다 */
    xpPerStage: 0.08,
    /** 16단계부터 십오각형이 몇 단계마다 돌아오는가 (15 → 19 → 23 …) */
    chronoEvery: 4,
    /** 단계 전환 배너 */
    bannerSec: 2.2,
  },

  /** 스폰 (§3) — 단계가 오를수록 생성 속도가 붙는다 */
  spawn: {
    budgetPerSec: 3.2,
    perStage: 0.12,
    maxPerSec: 8,
    /** 보스전·총력전 배율 */
    bossMult: 0.5,
    allOutMult: 1.4,
    ringMin: 560,
    ringMax: 680,
    /** 새로 나온 몬스터가 뽑힐 가중치 (나머지는 1) */
    newestWeight: 3,
  },

  /** 장애물 (§3) — 무한 맵이라 격자 칸마다 결정적으로 깔고, 멀어지면 회수한다 */
  obstacle: {
    densityMin: 0.06,
    densityMax: 0.09,
    minCorridorPx: 140,
    spawnClearRadius: 200,
    /** 격자 칸 하나에 장애물이 놓일 확률 */
    occupancy: 0.95,
    /** 종류별 가중치 (서버랙 / 박스 / 소화기 / 배선 / 포털) — 평균 밀도 ≈ 6.7% */
    kindWeights: [0.35, 0.18, 0.09, 0.26, 0.12],
    /** 화면 밖 이만큼까지 미리 깔아 둔다 */
    streamMargin: 320,
    /** 부서진 칸을 기억하는 수 (다시 와도 비어 있게) */
    brokenMemory: 256,
    hpDropRate: 0.12,
    hpDropAmount: 8,
    xpMin: 1,
    xpMax: 3,
  },

  /** 몬스터 특수 행동 (§4·§5) */
  ai: {
    /** 🔶 오각형 돌진 */
    charge: { cd: 5, windup: 0.9, speed: 520, time: 0.55, dmg: 24, range: 420 },
    /** 🟨 칠각형 4방향 감속탄 */
    shoot4: { cd: 3, speed: 200, life: 3.2, r: 7, slowSec: 1.6, slowMult: 0.6 },
    /** ⬡ 십일각형 소환 */
    summon: { cd: 4.5, count: 3, keepDist: 340, maxAlive: 2 },
    /** ⬢ 십사각형 재생 (최대 체력 비율 / 초) */
    regen: { perSec: 0.04, pulseSec: 1 },
    /** 겹침 분리: 8프레임마다 근접 2마리만 */
    separateEvery: 8,
    separatePairs: 2,
    separatePush: 18,
    /** 너무 멀어진 잡몹 회수 (풀 고갈 방지) */
    cullDist: 1400,
  },

  /** 보스 공통 */
  boss: {
    contactDmg: 18,
    keepDist: 200,
    /** 보스 단계가 시작되고 보스가 나타나기까지 (경고 배너) */
    spawnDelay: 1.6,
    /** 나타난 직후 무적 연출 */
    introSec: 1.2,
    /** 보스 등장 시 주변 장애물을 이만큼 치운다 (§8 40%) */
    clearR: 700,
    clearRatio: 0.4,
  },

  /** 🔷 5단계 육각형 — 레이저 (§6) */
  hexa: {
    hp: 1300, r: 50, speed: 60,
    cycle: 3.4,
    laserWarn: 1, laserFire: 0.6, laserLen: 900, laserWidth: 26, laserDmg: 30,
    bombCount: 6, bombSpread: 320, bombR: 70, bombWarn: 1.4,
  },

  /** 🔵 8단계 구각형 — 포식자 (§7) */
  nona: {
    hp: 3000, r: 46, rMax: 82, speed: 48,
    eatRange: 36, suckRange: 280, suckSpeed: 80,
    /** 한 마리 먹을 때 — 회복·최대 체력은 작게, 0.5초에 한 마리만 (안 그러면 딜이 회복을 못 이긴다) */
    eatCd: 0.5, eatHeal: 0.002, eatMaxHp: 0.004, eatGrow: 2.2, eatGauge: 9,
    /** 먹어서 불릴 수 있는 최대 체력 상한 (처음 체력의 배수) */
    maxHpCap: 1.5,
    /** 구각형전 스폰 배율 — 먹을 게 있어야 한다 */
    spawnMult: 0.8,
    gaugeMax: 100, gaugePerHpPct: 1.4,
    blastR: 210, blastDmg: 34, blastBullets: 20,
    armorAt: 0.5, weakArc: 0.42, weakMoveSec: 4,
    buffCd: 10, buffR: 420, buffHp: 1.5, buffDmg: 1.3, buffSize: 1.2,
    shotCd: 4, shotSpread: 5, shotMinR: 6, shotMaxR: 22, shotSpeed: 210,
  },

  /** 🟥 12단계 십삼각형 — 술래잡기 (§11) */
  trideca: {
    hp: 4000, r: 44, speed: 175,
    arenaR: 430, outsideDps: 4, outsideRamp: 3,
    dashCd: 15, dashFirst: 3, dashWarn: 0.65, dashSpeed: 950, dashDmg: 32, dashGap: 0.35,
    laserCd: 5, laserWarn: 1.1, laserFire: 0.5, laserDmg: 30, laserWidth: 30,
    tileLife: 8, tileEvery: 110, tileRedRate: 0.3, tileRedR: 24, tileBlueR: 34, tileSlowMult: 0.55,
    doomAt: 0.5, doomCount: 3, doomWarn: 3.2, doomGap: 14,
    nearR: 200, nearRate: 0.18, nearMin: 0.4, nearRecover: 1.5,
    holeCd: 22, holeFirst: 12, holeWarn: 3, holeLife: 15, holePullEvery: 3, holePull: 170, holeR: 160, holeCoreDps: 20,
    safeCount: 2, safeR: 55,
    slowPerHit: 0.012, slowMin: 0.35, slowRecover: 0.25,
  },

  /** ⏱️ 15단계 십오각형 — 시간을 지배하는 자 (§12) */
  chrono: {
    hp: 7000, r: 52, speed: 70,
    /** 제한 시간 5분, 다시 올 때마다 +1분 */
    limitSec: 300, limitStepSec: 60,
    /** 다시 올 때마다 체력 +35% */
    loopHp: 0.35,
    /** 시간이 흐를수록 (0→1) 붙는 배율 */
    grow: { hp: 0.5, atk: 1, speed: 0.6, cd: 0.4 },
    rewindAt: 0.5, rewindBackSec: 20, rewindSec: 1.6,
    homingCd: 4, homingCount: 3, homingLife: 5, homingMin: 110, homingMax: 380, homingNear: 500,
    homingBlastR: 60, homingDmg: 16, homingTurn: 3.2,
    rainCd: [9, 5] as const, rainCount: [8, 16] as const, rainWarn: [1.6, 0.7] as const, rainR: 64, rainDmg: 32,
    rainSpread: 460,
    bombEvery: 60, bombCount: 3, bombFuse: 25, bombOrbitR: 120, bombHp: 0.035,
    cloneCd: 180, cloneFirst: 45, cloneCount: 2, cloneLife: 30, cloneHp: 0.06, cloneDmg: 60, cloneBlastR: 150, cloneBlastDmg: 45,
    rage: { perSec: 0.4, perXp: 0.8, max: 100, hp: 1, dmg: 0.5, speed: 0.3 },
    clockAt: 0.25, clockOn: 12, clockOff: 6, clockArc: 0.4,
    stopCd: 26, stopFirst: 30, stopSec: 2, stopRing: 10, stopRingR: 150, stopBlastR: 60, stopWarn: 0.8,
    stopBulletBoost: 2.2, stopDashers: 6, stopDashSpeed: 400, stopDashSec: 0.6,
    reverseAt: [0.6, 0.4, 0.2] as const, reverseMonsters: 12, reverseObstacles: 10,
    timeoutSec: 3.5,
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

  /** 성능 (§14) */
  perf: {
    maxEnemies: 180,
    maxEnemiesLow: 120,
    maxProjectiles: 320,
    maxParticles: 256,
    maxOrbs: 512,
    /** 내 장판(쿠키·화염·블랙홀…)과 보스 경고 원이 나눠 쓴다 — 쿠키는 슬롯당 12개로 묶어 둔다 */
    maxHazards: 128,
    maxObstacles: 96,
    maxBeams: 32,
    /** 그리기 전용 이펙트 (링·부채꼴·베기·번개…) */
    maxFx: 96,
    /** 시간 역주행으로 되살릴 수 있는 최근 처치 기록 */
    killMemory: 24,
    gridCell: 64,
    fpsFloor: 45,
    lowFpsSec: 2,
    /** XP 조각이 이 수를 넘으면 가까운 것끼리 병합 */
    orbMergeAbove: 60,
    /** 🍴 포크 밤 — 한 프레임에 쌓아 둘 수 있는 폭발 수 (연쇄가 화면을 덮지 않게) */
    popQueue: 32,
  },

  /** 점수 (§11.1) */
  score: {
    perKill: 3,
    perSec: 2,
    perLevel: 40,
    perEvolution: 300,
    /** 도달 단계 (1단계 = 0) */
    perStage: 200,
    perBoss: 800,
    perObstacle: 8,
    noDamage: 500,
  },

  /** 🦉 아울 에너지 인게임 드랍 — 서버 조건과 같은 값이어야 한다 (첫 보스를 넘긴 판) */
  owlEnergy: { minStage: 6, chance: 0.3 },

  /** 런 상한 — 서버 max_sec(2400)보다 먼저 끝낸다. 시작 전 3·2·1 카운트다운 */
  run: { hardCapSec: 2280, countdownSec: 3 },

  platform: { K: 20, basePoints: 30, maxBonus: 270, maxSessionSec: 2400 },
} as const;

/** 레벨 L → L+1 에 필요한 XP */
export function xpToNext(level: number): number {
  return CFG.xp.base + CFG.xp.step * level;
}

/** 단계 S 의 적 체력 배율 — 무한 구간에서도 그대로 연장 */
export function hpMult(stage: number): number {
  return 1 + CFG.stage.hpPerStage * (Math.max(1, stage) - 1);
}

/** 단계 S 의 적 공격력 배율 */
export function atkMult(stage: number): number {
  return 1 + CFG.stage.atkPerStage * (Math.max(1, stage) - 1);
}

/** 단계 S 의 XP 배율 */
export function xpMult(stage: number): number {
  return 1 + CFG.stage.xpPerStage * (Math.max(1, stage) - 1);
}

/** 단계 S 의 초당 스폰 예산 */
export function spawnPerSec(stage: number): number {
  return Math.min(CFG.spawn.maxPerSec, CFG.spawn.budgetPerSec * (1 + CFG.spawn.perStage * (Math.max(1, stage) - 1)));
}

/** 십오각형이 몇 번째로 나오는가 (15단계 = 1회차, 19 = 2회차 …). 아니면 0 */
export function chronoLoop(stage: number): number {
  if (stage < CFG.stage.count) return 0;
  const d = stage - CFG.stage.count;
  return d % CFG.stage.chronoEvery === 0 ? d / CFG.stage.chronoEvery + 1 : 0;
}

/** 단계 S 의 보스 (없으면 null) — 서버 재계산식이 같은 규칙을 쓴다 */
export function bossOf(stage: number): BossKind | null {
  if (stage === 5) return "hexa";
  if (stage === 8) return "nona";
  if (stage === 12) return "trideca";
  return chronoLoop(stage) > 0 ? "chrono" : null;
}

/** 단계 S 에 도달했다면 그 전에 잡은 보스 수 (보스를 잡아야 다음 단계로 간다) */
export function bossesBefore(stage: number): number {
  let n = 0;
  for (let s = 1; s < stage; s++) if (bossOf(s)) n++;
  return n;
}
