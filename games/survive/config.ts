// 🛡️ 아울 서바이버즈 (OWL SURVIVORS) 튜닝 상수 — 기획서 전체 수치를 여기 모은다.
// 엔진 코드에 매직넘버 금지.

export const CFG = {
  /** 논리 해상도 (고정 카메라, 플레이어 중심) */
  view: { w: 960, h: 540 },
  /** 런 길이 180초 고정 (§1) */
  runSec: 180,
  physics: { dt: 1 / 60, maxStepsPerFrame: 3 },

  player: {
    hp: 100,
    speed: 190,
    radius: 13,
    /** 피격 후 무적 (§7) */
    iframeSec: 0.5,
    magnet: 70,
    /** 레벨 L → L+1 필요 XP: 8 + 6L (§5.1) */
    xpBase: 8,
    xpStep: 6,
    maxLevel: 20,
  },

  /** 구역 타임라인 (§3) */
  zones: [
    { idx: 0, name: "ZONE 1 · 서버실", from: 0, to: 60, cap: 60, tone: "#0b1020" },
    { idx: 1, name: "ZONE 2 · 캠퍼스망", from: 60, to: 120, cap: 110, tone: "#0d1526" },
    { idx: 2, name: "ZONE 3 · 다크웹", from: 120, to: 165, cap: 180, tone: "#140b1e" },
    { idx: 3, name: "BOSS · 루트킷 오버로드", from: 165, to: 180, cap: 80, tone: "#1a0b12" },
  ],
  /** 스폰 예산 — 초당 최대 마리 (§12) */
  spawnBudgetPerSec: 6,
  /** 저사양 대응 상한 (§12) */
  enemyCapLow: 120,

  /** 스테이지 (§8) */
  stages: [
    { id: 1, name: "서버실", emoji: "🖥️", hpMult: 1.0, speedMult: 1.0, scoreMult: 1.0 },
    { id: 2, name: "캠퍼스망", emoji: "🏫", hpMult: 1.3, speedMult: 1.08, scoreMult: 1.25 },
    { id: 3, name: "다크웹", emoji: "🕳️", hpMult: 1.7, speedMult: 1.15, scoreMult: 1.5 },
  ],

  /** 풀 크기 — 런 중 new 금지 (§12) */
  pool: { enemies: 256, bullets: 256, orbs: 512, particles: 256, hazards: 32 },
  /** 공간 해시 셀 크기 */
  gridCell: 64,

  /** 레벨업 카드 (§14) */
  levelup: {
    cards: 3,
    rerolls: 1,
    skipXpRatio: 0.1,
    newWeaponBelowLevel: 6,
    newWeaponChanceLate: 0.4,
    lowHpRatio: 0.3,
    lowHpWeight: 2,
    weaponSlots: 4,
    passiveSlots: 4,
    maxWeaponLevel: 5,
    maxPassiveLevel: 5,
    /** 진화 조건: 무기 MAX + 짝 패시브 3 이상 (§6) */
    evolvePassiveLevel: 3,
  },

  /** 점수 (§9.1) */
  score: {
    perKill: 3,
    perSec: 8,
    perLevel: 40,
    perEvolution: 300,
    perElite: 50,
    boss: 800,
    perZone: 150,
  },

  /** 아울 에너지 드롭 — ZONE 3 이상에서 가끔 (플랫폼 규칙) */
  owlEnergy: { minZone: 2, chance: 0.35, fromElite: true },

  /** K=20이면 스테이지 1 풀클리어(raw ≈ 6,300)만으로 상한 300P라 난이도 선택이 무의미해진다 */
  platform: { K: 30, basePoints: 30, maxBonus: 270, maxSessionSec: 200 },

  /** 저사양 감지 (§12) */
  perf: { lowFpsThreshold: 45, lowFpsSec: 2 },
} as const;

export type StageId = 1 | 2 | 3;

export function xpToNext(level: number): number {
  return CFG.player.xpBase + CFG.player.xpStep * level;
}

/** 경과 시간 → 구역 index (0~3) */
export function zoneAt(sec: number): number {
  for (let i = CFG.zones.length - 1; i >= 0; i--) if (sec >= CFG.zones[i].from) return i;
  return 0;
}

/** 경과 시간에 따른 동시 적 상한 (구역 안에서 선형 증가) */
export function enemyCapAt(sec: number): number {
  const z = CFG.zones[zoneAt(sec)];
  const prev = zoneAt(sec) === 0 ? 20 : CFG.zones[zoneAt(sec) - 1].cap;
  const t = Math.min(1, (sec - z.from) / Math.max(1, z.to - z.from));
  return Math.round(prev + (z.cap - prev) * t);
}

export function stageById(id: StageId) {
  return CFG.stages.find((s) => s.id === id) ?? CFG.stages[0];
}
