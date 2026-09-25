// 시간·콤보·오버드라이브(§6) + 원점수(§7.1) + 서버 검증 meta(§7.3)
//
// 시계는 UI가 들고 있다. 엔진은 "시간이 얼마나 늘고 줄었는지"만 돌려주고,
// OVERDRIVE 판정을 위해 onSolve로 들어온 solveMs를 내부 시계(run.clockMs)에 누적한다.
import { CFG, solveTimeGain, tierMult } from "../config";
import type { LogicMeta, LogicRunState, Placement, Puzzle, Tier } from "../types";
import { isOptimal } from "./judge";

export const BUILD = "1.0.0";

export type { LogicMeta, LogicRunState } from "../types";

export function createRun(): LogicRunState {
  return {
    solved: 0,
    optimal: 0,
    hints: 0,
    wrongSubmits: 0,
    combo: 0,
    comboMax: 0,
    tierMax: 1,
    solveMsList: [],
    score: 0,
    overdriveUntilMs: -1,
    overdriveBonus: 0,
    clockMs: 0,
    streak: 0,
    comboMultSum: 0,
    tierMultSum: 0,
    multCount: 0,
    owlEnergyFound: false,
  };
}

/** 콤보 배율 — 1 + floor(combo/4) × 0.2, 최대 2.4 (부동소수 오차가 점수에 새지 않게 소수 둘째 자리로 자른다) */
export function comboMult(combo: number): number {
  const raw = 1 + Math.floor(Math.max(0, combo) / CFG.combo.step) * CFG.combo.stepMult;
  return Math.min(CFG.combo.maxMult, Math.round(raw * 100) / 100);
}

/** 해결한 문제 수 → 티어 (§4 임계값) */
export function tierFor(solved: number): Tier {
  let tier: Tier = 1;
  for (let i = 0; i < CFG.tier.thresholds.length; i++) {
    if (solved >= CFG.tier.thresholds[i]) tier = (i + 1) as Tier;
  }
  return tier;
}

/**
 * 한 문제 해결.
 * 이 해결이 OVERDRIVE 창 안이면 ×2, 그리고 힌트 없이 5연속이 되면 이 해결 **다음부터** 10초간 OVERDRIVE.
 */
export function onSolve(
  run: LogicRunState,
  p: Puzzle,
  placement: Placement,
  solveMs: number,
): { points: number; timeGained: number; optimal: boolean; overdrive: boolean } {
  const optimal = isOptimal(p, placement);
  const ms = Math.max(0, Math.round(solveMs));

  run.clockMs += ms;
  run.solved += 1;
  if (optimal) run.optimal += 1;
  run.combo += 1;
  run.comboMax = Math.max(run.comboMax, run.combo);
  run.streak += 1;
  if (p.tier > run.tierMax) run.tierMax = p.tier;
  run.solveMsList.push(ms);

  const cMult = comboMult(run.combo);
  const tMult = tierMult(p.tier);
  run.comboMultSum += cMult;
  run.tierMultSum += tMult;
  run.multCount += 1;

  const overdrive = run.overdriveUntilMs >= 0 && run.clockMs <= run.overdriveUntilMs;
  const base = Math.round(CFG.score.perSolve * cMult * tMult);
  const points = overdrive ? base * CFG.overdrive.mult : base;
  run.score += points;
  run.overdriveBonus += points - base;

  // 5연속마다 OVERDRIVE 발동 (중첩 시 시간 갱신)
  if (run.streak % CFG.overdrive.triggerStreak === 0) {
    run.overdriveUntilMs = run.clockMs + CFG.overdrive.durationSec * 1000;
  }

  const timeGained = solveTimeGain(p.tier) + (optimal ? CFG.time.optimalBonus : 0);
  return { points, timeGained, optimal, overdrive };
}

/** 힌트 1회 — 시간 -8초, 콤보 0 (OVERDRIVE 연속도 끊긴다) */
export function onHint(run: LogicRunState): number {
  run.hints += 1;
  run.combo = 0;
  run.streak = 0;
  return CFG.time.hint;
}

/** 오답 제출 (자동 제출 OFF일 때만) — 시간 -3초. 콤보는 유지한다 */
export function onWrongSubmit(run: LogicRunState): number {
  run.wrongSubmits += 1;
  return CFG.time.wrong;
}

/**
 * 원점수 (§7.1).
 *   raw = Σ(120 × 콤보배율 × 티어계수) + 최적화 × 80 + 최고티어 × 200 + 남은시간 × 10 − 힌트 × 60
 * 남은 시간은 run이 들고 있지 않으므로 종료 시점에만 넘긴다 (HUD는 인자 없이 부르면 된다).
 */
export function rawScore(run: LogicRunState, timeLeft = 0): number {
  const raw =
    run.score +
    run.optimal * CFG.score.optimal +
    run.tierMax * CFG.score.tierReach +
    Math.max(0, timeLeft) * CFG.score.timeLeft -
    run.hints * CFG.score.hintPenalty;
  return Math.max(0, Math.round(raw));
}

export function avgSolveMs(run: LogicRunState): number {
  if (!run.solveMsList.length) return 0;
  return Math.round(run.solveMsList.reduce((a, b) => a + b, 0) / run.solveMsList.length);
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function buildMeta(run: LogicRunState, durationSec: number, timeLeft: number): LogicMeta {
  return {
    duration_s: round1(durationSec),
    solved: run.solved,
    optimal: run.optimal,
    tier_max: run.tierMax,
    combo_max: run.comboMax,
    hints: run.hints,
    wrong_submits: run.wrongSubmits,
    avg_solve_ms: avgSolveMs(run),
    time_left: round1(Math.max(0, timeLeft)),
    combo_mult_avg: run.multCount ? round2(run.comboMultSum / run.multCount) : 1,
    tier_mult_avg: run.multCount ? round2(run.tierMultSum / run.multCount) : 1,
    overdrive_bonus_score: Math.round(run.overdriveBonus),
    owl_energy_found: run.owlEnergyFound,
    v: BUILD,
  };
}
