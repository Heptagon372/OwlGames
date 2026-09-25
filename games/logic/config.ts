// 🔌 아울 로직 (OWL LOGIC) 튜닝 상수 — 기획서 §9
// 게임 안의 모든 수치는 여기에서만 온다. 엔진 코드에 매직넘버 금지.
import type { Gate, Tier } from "./types";

export const CFG = {
  /** 초 단위. 남은 시간 시계는 UI가 굴리고, 엔진은 증감값만 돌려준다 */
  time: { base: 70, solveT1: 4, solveT3: 6, optimalBonus: 2, hint: -8, wrong: -3, max: 180 },
  combo: { step: 4, stepMult: 0.2, maxMult: 2.4 },
  overdrive: { triggerStreak: 5, durationSec: 10, mult: 2 },
  /** thresholds[i] 이상 해결하면 티어 i+1 */
  tier: { thresholds: [0, 4, 8, 13, 19], mult: [1.0, 1.2, 1.5, 1.9, 2.4] },
  score: { perSolve: 120, optimal: 80, tierReach: 200, timeLeft: 10, hintPenalty: 60 },
  gen: {
    maxInputs: 4,
    maxSlots: 4,
    recentTruthBlock: 10,
    solverTimeoutMs: 50,
    /** 한 단계에서 다시 뽑아보는 횟수 — 넘으면 조건을 한 칸씩 풀어준다 (무한 루프 금지) */
    maxAttempts: 48,
  },
  ui: { autoSubmit: true, tapToPlace: true },
  /** 공통 15단계 표시용 — 24문제를 해결하면 STAGE 15 (티어 사다리와 같은 진행을 더 잘게 보여준다) */
  stage: { target: 24 },
  /** 🦉 아울 에너지 인게임 드랍 — 서버 조건(tier_max ≥ 4)과 반드시 같은 값 */
  owlEnergy: { minTier: 4, chance: 0.3 },
  platform: { K: 20, basePoints: 30, maxBonus: 270, maxSessionSec: 185 },
} as const;

/** 입력 이름 — truth 행 순서는 inputs[0]이 MSB */
export const INPUT_NAMES = ["A", "B", "C", "D"] as const;

/**
 * 티어별 문제 형태 (기획서 §4).
 * `wires`는 슬롯 하나에 들어오는 배선 수이자 그 티어 게이트들의 최대 arity다.
 * 배선 수를 게이트 종류마다 다르게 두면 "3선짜리 칸 = MUX 자리"가 들통나므로 티어 안에서는 항상 같은 수로 깐다.
 */
export const TIER_SHAPE: Record<
  Tier,
  {
    /** 뽑을 수 있는 입력 개수 */
    inputs: readonly number[];
    /** 뽑을 수 있는 슬롯 수 */
    slots: readonly number[];
    gates: readonly Gate[];
    wires: number;
    /** 부품을 정답에 딱 맞게만 준다 (T4·T5 — 일부러 모자라게) */
    exactParts: boolean;
  }
> = {
  1: { inputs: [2], slots: [1], gates: ["AND", "OR", "NOT"], wires: 2, exactParts: false },
  2: { inputs: [2], slots: [2], gates: ["AND", "OR", "NOT", "XOR"], wires: 2, exactParts: false },
  3: { inputs: [3], slots: [3], gates: ["AND", "OR", "NOT", "XOR", "NAND"], wires: 2, exactParts: false },
  4: { inputs: [3], slots: [3, 4], gates: ["AND", "OR", "NOT", "XOR", "NAND"], wires: 2, exactParts: true },
  5: { inputs: [3, 4], slots: [4], gates: ["AND", "OR", "NOT", "XOR", "NAND", "MUX"], wires: 3, exactParts: true },
};

/** 티어계수 (§7.1) */
export function tierMult(tier: Tier): number {
  return CFG.tier.mult[tier - 1];
}

/** 해결 시 얻는 시간 (§6) — T3 이상은 +6초 */
export function solveTimeGain(tier: Tier): number {
  return tier >= 3 ? CFG.time.solveT3 : CFG.time.solveT1;
}

/** raw → 플랫폼 포인트 (§7.2) */
export function pointsFromRaw(raw: number): number {
  return CFG.platform.basePoints + Math.min(CFG.platform.maxBonus, Math.floor(Math.max(0, raw) / CFG.platform.K));
}
