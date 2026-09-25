import { describe, expect, it } from "vitest";
import { CFG, TIER_SHAPE } from "@/games/logic/config";
import type { Tier } from "@/games/logic/types";
import { dedupDepth, genStats, generatePuzzle, isTrivialTruth, makeRng, truthHash } from "@/games/logic/engine/generator";
import { isSolved, usedGateCount } from "@/games/logic/engine/judge";
import { solve } from "@/games/logic/engine/solver";
import { GATE_ORDER } from "@/games/logic/engine/gates";
import { simulate, summarize } from "@/games/logic/engine/bot";

// 기획서 §11-1,2: 생성기는 해가 없는 문제·자명한 진리표·최근 진리표 중복을 만들지 않고,
// 솔버는 모든 문제를 50ms 안에 판정한다. 1만 회는 CI에 너무 무거워 2,000회로 돌린다
// (PUZZLES 환경변수로 늘리면 그대로 §11-1 규모가 된다).
const PER_TIER = Math.round(Number(process.env.PUZZLES ?? 2000) / 5);
const TIERS: Tier[] = [1, 2, 3, 4, 5];

describe("아울 로직 생성기 (§11-1,2)", () => {
  genStats.attempts = 0;
  genStats.puzzles = 0;
  genStats.fallbacks = 0;

  const rand = makeRng(20260925);
  const report: Record<string, unknown>[] = [];
  const problems: string[] = [];
  let worstSolveMs = 0;
  // 봇 시뮬 describe도 수집 시점에 문제를 만들므로, 생성기 몫만 따로 세어 둔다
  let generated = 0;

  for (const tier of TIERS) {
    const shape = TIER_SHAPE[tier];
    const depth = dedupDepth(tier);
    const recent: string[] = [];
    const seen = new Set<string>();
    const hints = new Set<string>();
    const attempts0 = genStats.attempts;
    const t0 = performance.now();
    let slotSum = 0;
    let partsSum = 0;

    for (let i = 0; i < PER_TIER; i++) {
      const p = generatePuzzle(tier, rand, recent);
      const n = p.inputs.length;
      const hash = truthHash(p.truth);

      if (p.truth.length !== 1 << n) problems.push(`T${tier} 진리표 길이 ${p.truth.length}`);
      if (isTrivialTruth(p.truth, n)) problems.push(`T${tier} 자명한 진리표 ${hash}`);
      // 최근 N문제와 겹치지 않는다 (T1·T2는 만들 수 있는 진리표 자체가 10개가 안 돼 깊이를 줄인다)
      if (recent.slice(-depth).includes(hash)) problems.push(`T${tier} 최근 ${depth}문제와 중복 ${hash}`);
      // 배선은 언제나 비순환이고, 어떤 게이트를 꽂아도 배선이 모자라지 않는다
      for (let s = 0; s < p.slots.length; s++) {
        if (p.slots[s].inputs.length !== shape.wires) problems.push(`T${tier} 배선 수 ${p.slots[s].inputs.length}`);
        for (const src of p.slots[s].inputs) {
          if (src.kind === "slot" && src.index >= s) problems.push(`T${tier} 순환 배선 ${s}←${src.index}`);
          if (src.kind === "input" && src.index >= n) problems.push(`T${tier} 없는 입력 ${src.index}`);
        }
      }
      // 힌트는 성질만 말한다 — 정답 게이트 이름을 찍지 않는다
      for (const g of GATE_ORDER) if (p.hint.includes(g)) problems.push(`T${tier} 힌트가 ${g}를 찍었다: ${p.hint}`);

      const t1 = performance.now();
      const sol = solve(p);
      worstSolveMs = Math.max(worstSolveMs, performance.now() - t1);

      if (!sol) problems.push(`T${tier} 해가 없다 ${hash}`);
      else {
        if (sol.minGates !== p.slots.length) problems.push(`T${tier} 최소 ${sol.minGates} ≠ 슬롯 ${p.slots.length}`);
        if (sol.minGates !== p.minGates) problems.push(`T${tier} minGates 불일치 ${sol.minGates} ≠ ${p.minGates}`);
        if (!isSolved(p, sol.placement)) problems.push(`T${tier} 솔버 해가 안 맞는다 ${hash}`);
        if (usedGateCount(sol.placement) !== sol.minGates) problems.push(`T${tier} 해의 부품 수가 안 맞는다`);
      }

      recent.push(hash);
      if (recent.length > CFG.gen.recentTruthBlock) recent.shift();
      seen.add(hash);
      hints.add(p.hint);
      slotSum += p.slots.length;
      partsSum += Object.values(p.parts).reduce((a, b) => a + (b ?? 0), 0);
    }

    report.push({
      tier,
      puzzles: PER_TIER,
      attemptsPerPuzzle: Math.round(((genStats.attempts - attempts0) / PER_TIER) * 100) / 100,
      distinctTruth: seen.size,
      distinctHints: hints.size,
      slotsAvg: Math.round((slotSum / PER_TIER) * 100) / 100,
      partsAvg: Math.round((partsSum / PER_TIER) * 100) / 100,
      msPerPuzzle: Math.round(((performance.now() - t0) / PER_TIER) * 1000) / 1000,
    });
    generated = genStats.puzzles;
  }
  const fallbacks = genStats.fallbacks;

  it("리포트", () => {
    // 티어별 샘플 한 개씩 — 배선·부품·힌트가 사람이 읽을 만한지 눈으로 확인하는 용도
    const sampleRand = makeRng(1);
    for (const tier of TIERS) {
      const p = generatePuzzle(tier, sampleRand, []);
      console.log(
        `[logic-gen] T${tier}`,
        JSON.stringify({
          inputs: p.inputs.join(""),
          slots: p.slots.map((s) =>
            s.inputs.map((src) => (src.kind === "input" ? p.inputs[src.index] : `#${src.index}`)).join("+"),
          ),
          out: p.outputSlot,
          parts: p.parts,
          truth: p.truth.join(""),
          minGates: p.minGates,
          hint: p.hint,
        }),
      );
    }
    console.log("[logic-gen]", JSON.stringify(report));
    console.log(
      "[logic-gen]",
      JSON.stringify({ generated, fallbacks, worstSolveMs: Math.round(worstSolveMs * 1000) / 1000 }),
    );
    expect(generated).toBe(PER_TIER * TIERS.length);
  });

  it("해가 없는 문제·자명한 진리표·최근 중복이 0건이다", () => {
    expect(problems.slice(0, 10)).toEqual([]);
    expect(problems).toHaveLength(0);
  });

  it("폴백 문제로 떨어지지 않는다", () => {
    expect(fallbacks).toBe(0);
  });

  it("솔버가 모든 문제를 50ms 안에 판정한다 (§11-2)", () => {
    expect(worstSolveMs).toBeLessThan(CFG.gen.solverTimeoutMs);
  });

  it("T4·T5는 부품을 딱 맞게만 주고 귀한 부품이 하나 이상 있다 (§4)", () => {
    const rand2 = makeRng(4242);
    for (const tier of [4, 5] as Tier[]) {
      for (let i = 0; i < 200; i++) {
        const p = generatePuzzle(tier, rand2, []);
        const counts = Object.values(p.parts).map((v) => v ?? 0);
        expect(counts.reduce((a, b) => a + b, 0)).toBe(p.slots.length); // 여유 0
        expect(counts.length).toBeGreaterThanOrEqual(2);
        expect(counts.some((c) => c === 1)).toBe(true);
      }
    }
  });

  it("T1~T3은 티어의 모든 부품을 트레이에 올린다 (고를 게 있어야 퍼즐이다)", () => {
    const rand2 = makeRng(777);
    for (const tier of [1, 2, 3] as Tier[]) {
      for (let i = 0; i < 100; i++) {
        const p = generatePuzzle(tier, rand2, []);
        expect(Object.keys(p.parts).sort()).toEqual([...TIER_SHAPE[tier].gates].sort());
      }
    }
  });
});

// 기획서 §11-7: 봇 시뮬레이션으로 밸런스를 본다.
// 기본 120판(CI용), SIM_RUNS=1000으로 늘리면 튜닝용 리포트가 된다.
const RUNS = Number(process.env.SIM_RUNS ?? 120);

describe("아울 로직 봇 시뮬레이션 (§11-7)", () => {
  const results = Array.from({ length: RUNS }, (_, i) => simulate(9000 + i));
  const s = summarize(results);

  it("리포트", () => {
    console.log("[logic-sim]", JSON.stringify(s));
    expect(s.runs).toBe(RUNS);
  });

  it("모든 판이 정상 종료된다 (무한 루프·NaN 없음)", () => {
    for (const r of results) {
      expect(Number.isFinite(r.raw)).toBe(true);
      expect(r.durationSec).toBeGreaterThan(0);
      expect(r.durationSec).toBeLessThanOrEqual(CFG.platform.maxSessionSec);
      expect(r.timeLeft).toBeLessThanOrEqual(CFG.time.max);
      expect(r.optimal).toBeLessThanOrEqual(r.solved);
    }
  });

  it("메타가 서버 검증 규칙을 통과한다 (§7.3)", () => {
    for (const r of results) {
      const m = r.meta;
      expect(m.duration_s).toBeGreaterThanOrEqual(10);
      expect(m.duration_s).toBeLessThanOrEqual(CFG.platform.maxSessionSec);
      expect(m.solved / m.duration_s).toBeLessThanOrEqual(0.6); // 문제당 최소 1.6초
      if (m.solved > 0) expect(m.avg_solve_ms).toBeGreaterThanOrEqual(1200);
      expect(m.optimal).toBeLessThanOrEqual(m.solved);
      expect(m.tier_max).toBeLessThanOrEqual(5);
      expect(m.combo_mult_avg).toBeLessThanOrEqual(CFG.combo.maxMult);
      expect(m.tier_mult_avg).toBeLessThanOrEqual(2.4);
    }
  });

  it("분포가 무너지지 않는다", () => {
    // 관측값(seed 9000~): 120판·1,000판 모두 길이 중앙값 118초 / raw 중앙값 ≈ 3,100 / 184~185P /
    // 해결 11문제 / 최고 T3 / 평균 풀이 7.0초 / 힌트 2.1회.
    // raw는 기획서 §11-7의 목표(2,500~3,500)와 §7.2의 '익숙'(195P) 안에 들어오지만, 길이는 목표(70~110초)보다
    // 조금 길다 — 판 길이 = 70 + Σ(해결 보상) − 힌트/오답 차감이라 한 문제 풀 때마다 시계가 늘어나는 구조다.
    // 회귀 감지가 목적이므로 폭은 넉넉히 잡는다.
    expect(s.durationMedian).toBeGreaterThan(60);
    expect(s.durationMedian).toBeLessThanOrEqual(CFG.platform.maxSessionSec);
    expect(s.rawMedian).toBeGreaterThan(1200);
    expect(s.rawMedian).toBeLessThan(9000);
    expect(s.pointsMedian).toBeGreaterThan(CFG.platform.basePoints);
    expect(s.pointsMedian).toBeLessThanOrEqual(300);
    expect(s.solvedMedian).toBeGreaterThanOrEqual(4);
    expect(s.avgSolveMsMedian).toBeGreaterThan(1200);
  });

  it("티어가 실제로 올라간다 (§4 임계값이 닿는 범위)", () => {
    expect(Math.max(...results.map((r) => r.tierMax))).toBe(5);
    expect(results.filter((r) => r.tierMax >= 3).length).toBeGreaterThan(RUNS * 0.3);
  });
});
