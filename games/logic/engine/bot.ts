// 자동 봇 시뮬레이션 (기획서 §11-7) — 밸런스 확인·회귀 검증용.
//
// 모델: 부스에 온 "보통 손님" 한 명.
//  - 판마다 실력 skill(0~1)을 뽑는다. 실력이 낮으면 오래 걸리고 힌트를 더 자주 쓰고 더 자주 막힌다.
//  - 문제는 솔버가 대신 풀어준다(사람이 결국 푼다고 보고). 대신 "푸는 데 걸린 시간"을 모델링한다.
//  - 막히면(stuck) 남은 시간을 다 태우고 판이 끝난다 — 실제 판이 끝나는 가장 흔한 이유.
//
// 시계 산수: 판 길이 = 70 + Σ(해결 보상) − 힌트 8초 × n − 오답 3초 × n.
// 생각하는 시간은 남은 시계에서 그대로 빠지므로 판 길이를 늘리지 않는다.
import { CFG, pointsFromRaw } from "../config";
import type { LogicMeta, Tier } from "../types";
import { generatePuzzle, makeRng, truthHash } from "./generator";
import { buildMeta, createRun, onHint, onSolve, onWrongSubmit, rawScore, tierFor } from "./score";
import { solve } from "./solver";

export { makeRng };

/** 티어별 기본 사고 시간(ms) — 실력 0.5 기준으로 T3가 기획서의 avg_solve_ms 6.2초 근처에 오게 잡았다 */
const THINK_MS: Record<Tier, number> = { 1: 3800, 2: 5000, 3: 7000, 4: 9200, 5: 10500 };
/** 힌트를 부르기 전에 혼자 끙끙댄 시간 */
const HINT_THINK_MS = 3200;
/** 티어별 힌트 사용 성향 */
const HINT_BIAS: Record<Tier, number> = { 1: 0.12, 2: 0.24, 3: 0.4, 4: 0.52, 5: 0.58 };
/** 티어별 "끝내 못 푸는" 성향 — T4·T5의 모자란 부품에서 실제로 손이 멈춘다 */
const STUCK_BIAS: Record<Tier, number> = { 1: 0.02, 2: 0.05, 3: 0.11, 4: 0.2, 5: 0.26 };
/** 자동 제출을 꺼 두고 노는 비율 (§2 — 이때만 오답 제출 -3초가 생긴다) */
const MANUAL_SUBMIT_RATIO = 0.3;

export type LogicBotResult = {
  durationSec: number;
  timeLeft: number;
  raw: number;
  points: number;
  solved: number;
  optimal: number;
  tierMax: number;
  hints: number;
  wrongSubmits: number;
  avgSolveMs: number;
  /** 시간이 다 돼서 끝났는지(timeout), 판 길이 상한에 닿았는지(cap) */
  end: "timeout" | "cap";
  meta: LogicMeta;
};

function thinkMs(tier: Tier, skill: number, rand: () => number): number {
  const speed = 1.75 - 1.0 * skill; // 실력 0 → 1.75배 느리게, 1 → 0.75배
  const jitter = 0.65 + rand() * 0.8;
  return Math.round(THINK_MS[tier] * speed * jitter);
}

export function simulate(seed: number): LogicBotResult {
  const rand = makeRng(seed);
  const run = createRun();
  const skill = 0.15 + rand() * 0.85;
  const autoSubmit = rand() >= MANUAL_SUBMIT_RATIO;
  const recent: string[] = [];

  let time: number = CFG.time.base;
  let duration = 0;
  /** 한 판의 길이 상한 (§9 platform.maxSessionSec — 서버가 185초를 넘는 판을 거부한다) */
  const maxDuration = CFG.platform.maxSessionSec - 5;

  while (time > 0 && duration < maxDuration) {
    const tier = tierFor(run.solved);
    const p = generatePuzzle(tier, rand, recent);
    recent.push(truthHash(p.truth));
    if (recent.length > CFG.gen.recentTruthBlock) recent.shift();

    const sol = solve(p);
    if (!sol) break; // 생성기가 검증했으니 올 일이 없다

    let spentMs = thinkMs(tier, skill, rand);
    const stuck = rand() < STUCK_BIAS[tier] * (1.4 - skill);

    if (!stuck && rand() < Math.min(0.8, HINT_BIAS[tier] * (1.3 - skill))) {
      spentMs += Math.round(HINT_THINK_MS * (1.4 - skill * 0.5));
      time += onHint(run);
      if (time <= 0) break;
    }
    if (!stuck && !autoSubmit && rand() < 0.22) {
      spentMs += 900;
      time += onWrongSubmit(run);
      if (time <= 0) break;
    }

    // 이 문제에 쓸 수 있는 시간 = 남은 시계와 판 길이 상한 중 짧은 쪽
    const room = Math.min(time, maxDuration - duration);
    const spendSec = spentMs / 1000;
    if (stuck || spendSec >= room) {
      // 끝내 못 풀었다 — 남은 시간을 다 태우고 판이 끝난다
      duration += room;
      time -= room;
      break;
    }
    time -= spendSec;
    duration += spendSec;

    const r = onSolve(run, p, sol.placement, spentMs);
    time = Math.min(CFG.time.max, time + r.timeGained);
  }

  const timeLeft = Math.max(0, time);
  const end: "timeout" | "cap" = timeLeft <= 0 ? "timeout" : "cap";
  const raw = rawScore(run, timeLeft);
  const meta = buildMeta(run, duration, timeLeft);
  return {
    durationSec: Math.round(duration * 10) / 10,
    timeLeft: Math.round(timeLeft * 10) / 10,
    raw,
    points: pointsFromRaw(raw),
    solved: run.solved,
    optimal: run.optimal,
    tierMax: run.tierMax,
    hints: run.hints,
    wrongSubmits: run.wrongSubmits,
    avgSolveMs: meta.avg_solve_ms,
    end,
    meta,
  };
}

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function summarize(results: LogicBotResult[]) {
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return {
    runs: results.length,
    durationMedian: r1(median(results.map((r) => r.durationSec))),
    durationMean: r1(mean(results.map((r) => r.durationSec))),
    rawMedian: Math.round(median(results.map((r) => r.raw))),
    rawMean: Math.round(mean(results.map((r) => r.raw))),
    pointsMedian: median(results.map((r) => r.points)),
    solvedMedian: median(results.map((r) => r.solved)),
    solvedMean: r1(mean(results.map((r) => r.solved))),
    tierMaxMedian: median(results.map((r) => r.tierMax)),
    hintsMean: r1(mean(results.map((r) => r.hints))),
    avgSolveMsMedian: Math.round(median(results.map((r) => r.avgSolveMs))),
    cappedRuns: results.filter((r) => r.end === "cap").length,
  };
}
