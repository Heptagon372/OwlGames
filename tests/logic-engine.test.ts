import { describe, expect, it } from "vitest";
import { CFG, tierMult } from "@/games/logic/config";
import type { Gate, Placement, Puzzle, Source, Tier } from "@/games/logic/types";
import { ARITY, evalGate, GATE_LABEL, GATE_ORDER } from "@/games/logic/engine/gates";
import { evalOnce, evalTruth, inputColumn, rowIndex } from "@/games/logic/engine/circuit";
import { canPlace, gradeRows, isOptimal, isSolved, remainingParts, usedGateCount } from "@/games/logic/engine/judge";
import { solve } from "@/games/logic/engine/solver";
import { makeRng, truthHash } from "@/games/logic/engine/generator";
import {
  buildMeta,
  comboMult,
  createRun,
  onHint,
  onSolve,
  onWrongSubmit,
  rawScore,
  tierFor,
} from "@/games/logic/engine/score";

const IN = (index: number): Source => ({ kind: "input", index });
const SLOT = (index: number): Source => ({ kind: "slot", index });

function puzzle(over: Partial<Puzzle> = {}): Puzzle {
  return {
    id: "t",
    tier: 1,
    inputs: ["A", "B"],
    slots: [{ inputs: [IN(0), IN(1)] }],
    outputSlot: 0,
    parts: { AND: 1, OR: 1, NOT: 1 },
    truth: [0, 0, 0, 1],
    minGates: 1,
    hint: "",
    ...over,
  };
}

/** evalTruth(비트마스크)와 대조할 독립 구현 — 행마다 슬롯을 순서대로 계산한다 */
function refTruth(p: Puzzle, placement: Placement): number[] | null {
  const n = p.inputs.length;
  const rows = 1 << n;
  const out: number[] = [];
  for (let r = 0; r < rows; r++) {
    const bits: number[] = [];
    for (let j = 0; j < n; j++) bits.push((r >> (n - 1 - j)) & 1);
    const vals: (number | null)[] = [];
    for (let i = 0; i < p.slots.length; i++) {
      const g = placement[i] ?? null;
      if (!g) {
        vals.push(null);
        continue;
      }
      const args: number[] = [];
      let ok = p.slots[i].inputs.length >= ARITY[g];
      for (let w = 0; ok && w < ARITY[g]; w++) {
        const s = p.slots[i].inputs[w];
        const v = s.kind === "input" ? bits[s.index] : vals[s.index];
        if (v === null || v === undefined) ok = false;
        else args.push(v);
      }
      vals.push(ok ? evalGate(g, args) : null);
    }
    const v = vals[p.outputSlot];
    if (v === null || v === undefined) return null;
    out.push(v);
  }
  return out;
}

describe("게이트 (§11-6: 6종 × 전체 입력 조합)", () => {
  it("arity와 라벨", () => {
    expect(ARITY).toEqual({ AND: 2, OR: 2, NOT: 1, XOR: 2, NAND: 2, MUX: 3 });
    for (const g of GATE_ORDER) expect(GATE_LABEL[g]).toBe(g);
    expect(GATE_ORDER).toHaveLength(6);
  });

  it("2입력 게이트 4조합", () => {
    const table: Record<string, number[]> = {
      // [00, 01, 10, 11]
      AND: [0, 0, 0, 1],
      OR: [0, 1, 1, 1],
      XOR: [0, 1, 1, 0],
      NAND: [1, 1, 1, 0],
    };
    for (const [gate, expected] of Object.entries(table)) {
      const got = [
        evalGate(gate as Gate, [0, 0]),
        evalGate(gate as Gate, [0, 1]),
        evalGate(gate as Gate, [1, 0]),
        evalGate(gate as Gate, [1, 1]),
      ];
      expect(got, gate).toEqual(expected);
    }
  });

  it("NOT은 첫 배선만 본다", () => {
    expect(evalGate("NOT", [0])).toBe(1);
    expect(evalGate("NOT", [1])).toBe(0);
    expect(evalGate("NOT", [1, 0])).toBe(0);
    expect(evalGate("NOT", [0, 1])).toBe(1);
  });

  it("MUX 8조합 — [sel, a, b], sel이 0이면 a", () => {
    // sel,a,b = 000..111 → sel이 0이면 a, 1이면 b
    const expected = [0, 0, 1, 1, 0, 1, 0, 1];
    const got: number[] = [];
    for (let r = 0; r < 8; r++) got.push(evalGate("MUX", [(r >> 2) & 1, (r >> 1) & 1, r & 1]));
    expect(got).toEqual(expected);
  });

  it("입력이 모자라면 던진다", () => {
    expect(() => evalGate("MUX", [1, 0])).toThrow();
    expect(() => evalGate("AND", [1])).toThrow();
  });
});

describe("circuit — 순수 평가", () => {
  it("inputs[0]이 MSB다", () => {
    expect(rowIndex(3, [1, 0, 1])).toBe(5);
    expect(inputColumn(2, 0).toString(2).padStart(4, "0")).toBe("1100"); // 행 2,3에서 A=1
    expect(inputColumn(2, 1).toString(2).padStart(4, "0")).toBe("1010"); // 행 1,3에서 B=1
  });

  it("evalTruth / evalOnce 기본", () => {
    const p = puzzle();
    expect(evalTruth(p, ["AND"])).toEqual([0, 0, 0, 1]);
    expect(evalTruth(p, ["OR"])).toEqual([0, 1, 1, 1]);
    expect(evalTruth(p, ["NOT"])).toEqual([1, 1, 0, 0]); // 첫 배선(A)만 본다
    expect(evalOnce(p, ["AND"], [1, 1])).toBe(1);
    expect(evalOnce(p, ["AND"], [1, 0])).toBe(0);
  });

  it("빈 칸에 기대면 null (부분 배치)", () => {
    const chain = puzzle({
      inputs: ["A", "B"],
      slots: [{ inputs: [IN(0), IN(1)] }, { inputs: [SLOT(0), IN(1)] }],
      outputSlot: 1,
      parts: { AND: 2, OR: 2, NOT: 2, XOR: 2 },
      truth: [0, 0, 0, 1],
      minGates: 2,
    });
    expect(evalTruth(chain, [null, null])).toBeNull();
    expect(evalTruth(chain, ["AND", null])).toBeNull();
    expect(evalTruth(chain, [null, "AND"])).toBeNull();
    expect(evalOnce(chain, [null, "AND"], [1, 1])).toBeNull();
    expect(evalTruth(chain, ["XOR", "AND"])).toEqual([0, 1, 0, 0]);
    // 출력 칸이 NOT이면 두 번째 배선은 구조적으로 필요 없다
    expect(evalTruth(chain, ["AND", "NOT"])).toEqual([1, 1, 1, 0]);
    // 반대로 출력 칸이 안 채워지면 앞이 채워져도 null
    expect(evalTruth(chain, ["NOT", null])).toBeNull();
  });

  it("출력과 상관없는 칸이 비어 있어도 평가된다", () => {
    const p = puzzle({
      slots: [{ inputs: [IN(0), IN(1)] }, { inputs: [IN(0), IN(1)] }],
      outputSlot: 0,
      parts: { AND: 1, OR: 1, NOT: 1 },
      minGates: 1,
    });
    expect(evalTruth(p, ["AND", null])).toEqual([0, 0, 0, 1]);
  });

  it("비트마스크 평가와 행 단위 참조 구현이 같은 답을 낸다", () => {
    const rand = makeRng(7);
    const gates: Gate[] = ["AND", "OR", "NOT", "XOR", "NAND", "MUX"];
    for (let k = 0; k < 400; k++) {
      const n = 2 + Math.floor(rand() * 3); // 2~4
      const slotCount = 1 + Math.floor(rand() * 4);
      const slots = [];
      for (let i = 0; i < slotCount; i++) {
        const pool: Source[] = [];
        for (let j = 0; j < n; j++) pool.push(IN(j));
        for (let s = 0; s < i; s++) pool.push(SLOT(s));
        const wires: Source[] = [];
        for (let w = 0; w < 3; w++) wires.push(pool[Math.floor(rand() * pool.length)]);
        slots.push({ inputs: wires });
      }
      const p = puzzle({
        inputs: ["A", "B", "C", "D"].slice(0, n),
        slots,
        outputSlot: slotCount - 1,
        truth: new Array(1 << n).fill(0),
      });
      const placement: Placement = [];
      for (let i = 0; i < slotCount; i++) {
        placement.push(rand() < 0.2 ? null : gates[Math.floor(rand() * gates.length)]);
      }
      expect(evalTruth(p, placement)).toEqual(refTruth(p, placement));
    }
  });
});

describe("judge — 채점·부품", () => {
  const p = puzzle();

  it("gradeRows는 행마다 따로 맞는다", () => {
    const rows = gradeRows(p, ["OR"]); // 목표 AND vs 실제 OR
    expect(rows.map((r) => r.actual)).toEqual([0, 1, 1, 1]);
    expect(rows.map((r) => r.ok)).toEqual([true, false, false, true]);
    expect(rows.map((r) => r.expected)).toEqual([0, 0, 0, 1]);
  });

  it("빈 배치는 actual이 전부 null", () => {
    const rows = gradeRows(p, [null]);
    expect(rows.every((r) => r.actual === null && !r.ok)).toBe(true);
  });

  it("isSolved / usedGateCount / isOptimal", () => {
    expect(isSolved(p, ["AND"])).toBe(true);
    expect(isSolved(p, ["OR"])).toBe(false);
    expect(isSolved(p, [null])).toBe(false);
    expect(usedGateCount(["AND", null, "OR"])).toBe(2);

    // 출력과 상관없는 칸에 부품을 더 꽂으면 풀려도 최적화가 아니다
    const spare = puzzle({
      slots: [{ inputs: [IN(0), IN(1)] }, { inputs: [IN(0), IN(1)] }],
      outputSlot: 0,
      minGates: 1,
    });
    expect(isOptimal(spare, ["AND", null])).toBe(true);
    expect(isSolved(spare, ["AND", "OR"])).toBe(true);
    expect(isOptimal(spare, ["AND", "OR"])).toBe(false);
    expect(isOptimal(spare, ["OR", null])).toBe(false); // 풀지도 못했다
  });

  it("remainingParts / canPlace가 모자란 부품을 지킨다", () => {
    const scarce = puzzle({
      tier: 4,
      inputs: ["A", "B", "C"],
      slots: [{ inputs: [IN(0), IN(1)] }, { inputs: [SLOT(0), IN(2)] }, { inputs: [SLOT(1), IN(0)] }],
      outputSlot: 2,
      parts: { NOT: 1, AND: 2 },
      truth: new Array(8).fill(0),
      minGates: 3,
    });
    expect(remainingParts(scarce, [null, null, null])).toEqual({ AND: 2, NOT: 1 });
    expect(remainingParts(scarce, ["NOT", "AND", null])).toEqual({ AND: 1, NOT: 0 });

    expect(canPlace(scarce, ["NOT", null, null], "NOT", 1)).toBe(false); // NOT은 하나뿐
    expect(canPlace(scarce, ["NOT", null, null], "NOT", 0)).toBe(true); // 같은 칸은 회수 후 재배치
    expect(canPlace(scarce, ["AND", "AND", null], "AND", 2)).toBe(false);
    expect(canPlace(scarce, [null, null, null], "XOR", 0)).toBe(false); // 지급하지 않은 부품
    expect(canPlace(scarce, [null, null, null], "AND", 9)).toBe(false); // 없는 칸

    // 배선이 모자란 칸에는 못 꽂는다 (2선 칸에 MUX)
    const wide = puzzle({ parts: { MUX: 1, AND: 1 } });
    expect(canPlace(wide, [null], "MUX", 0)).toBe(false);
    expect(canPlace(wide, [null], "AND", 0)).toBe(true);
  });
});

describe("solver", () => {
  it("최소 게이트 해를 찾는다", () => {
    const spare = puzzle({
      slots: [{ inputs: [IN(0), IN(1)] }, { inputs: [IN(0), IN(1)] }],
      outputSlot: 0,
      minGates: 1,
    });
    const sol = solve(spare);
    expect(sol).not.toBeNull();
    expect(sol?.minGates).toBe(1);
    expect(usedGateCount(sol!.placement)).toBe(1);
    expect(isSolved(spare, sol!.placement)).toBe(true);
  });

  it("NOT 하나로 XNOR 만들기 — 두 칸이 필요하다", () => {
    const p = puzzle({
      tier: 2,
      slots: [{ inputs: [IN(0), IN(1)] }, { inputs: [SLOT(0), IN(1)] }],
      outputSlot: 1,
      parts: { AND: 1, OR: 1, NOT: 1, XOR: 1 },
      truth: [1, 0, 0, 1], // XNOR
      minGates: 2,
    });
    const sol = solve(p);
    expect(sol?.minGates).toBe(2);
    expect(isSolved(p, sol!.placement)).toBe(true);
    expect(usedGateCount(sol!.placement)).toBe(2);
  });

  it("부품이 모자라면 null", () => {
    const p = puzzle({ parts: { OR: 1 }, truth: [0, 0, 0, 1] });
    expect(solve(p)).toBeNull();
  });

  it("50ms 예산 안에 끝난다", () => {
    const p = puzzle({
      tier: 5,
      inputs: ["A", "B", "C", "D"],
      slots: [
        { inputs: [IN(0), IN(1), IN(2)] },
        { inputs: [SLOT(0), IN(3), IN(1)] },
        { inputs: [SLOT(1), IN(0), IN(2)] },
        { inputs: [SLOT(2), SLOT(0), IN(3)] },
      ],
      outputSlot: 3,
      parts: { AND: 2, OR: 2, NOT: 2, XOR: 2, NAND: 2, MUX: 2 },
      truth: new Array(16).fill(0).map((_, r) => (r % 3 === 0 ? 1 : 0)),
      minGates: 4,
    });
    const t0 = performance.now();
    solve(p);
    expect(performance.now() - t0).toBeLessThan(CFG.gen.solverTimeoutMs);
  });
});

describe("score — 시간·콤보·오버드라이브·원점수", () => {
  it("콤보 배율 (§6)", () => {
    expect(comboMult(0)).toBe(1);
    expect(comboMult(3)).toBe(1);
    expect(comboMult(4)).toBe(1.2);
    expect(comboMult(7)).toBe(1.2);
    expect(comboMult(8)).toBe(1.4);
    expect(comboMult(12)).toBe(1.6);
    expect(comboMult(28)).toBe(2.4);
    expect(comboMult(200)).toBe(CFG.combo.maxMult);
  });

  it("티어 임계값 (§4)", () => {
    expect([0, 3].map(tierFor)).toEqual([1, 1]);
    expect([4, 7].map(tierFor)).toEqual([2, 2]);
    expect([8, 12].map(tierFor)).toEqual([3, 3]);
    expect([13, 18].map(tierFor)).toEqual([4, 4]);
    expect([19, 99].map(tierFor)).toEqual([5, 5]);
    expect(CFG.tier.mult.map((_, i) => tierMult((i + 1) as Tier))).toEqual([1.0, 1.2, 1.5, 1.9, 2.4]);
  });

  it("해결 시 점수·시간 (§6·§7.1)", () => {
    const run = createRun();
    const p1 = puzzle({ tier: 1 });
    const r1 = onSolve(run, p1, ["AND"], 4000);
    expect(r1).toEqual({ points: 120, timeGained: 6, optimal: true, overdrive: false }); // 4 + 최적화 2
    expect(run.combo).toBe(1);

    // 최적화가 아니면 보너스 시간이 없다
    const spare = puzzle({
      tier: 3,
      slots: [{ inputs: [IN(0), IN(1)] }, { inputs: [IN(0), IN(1)] }],
      outputSlot: 0,
      minGates: 1,
    });
    const r2 = onSolve(run, spare, ["AND", "OR"], 5000);
    expect(r2.optimal).toBe(false);
    expect(r2.timeGained).toBe(CFG.time.solveT3);
    expect(r2.points).toBe(Math.round(120 * 1 * 1.5));
    expect(run.tierMax).toBe(3);
  });

  it("힌트는 콤보를 끊고 -8초, 오답은 -3초", () => {
    const run = createRun();
    onSolve(run, puzzle(), ["AND"], 3000);
    onSolve(run, puzzle(), ["AND"], 3000);
    expect(run.combo).toBe(2);
    expect(onHint(run)).toBe(-8);
    expect(run.combo).toBe(0);
    expect(run.hints).toBe(1);
    expect(onWrongSubmit(run)).toBe(-3);
    expect(run.wrongSubmits).toBe(1);
    expect(run.combo).toBe(0);
  });

  it("힌트 없이 5연속이면 OVERDRIVE 10초 동안 ×2", () => {
    const run = createRun();
    const p = puzzle({ tier: 1 });
    for (let i = 0; i < 5; i++) {
      expect(onSolve(run, p, ["AND"], 1000).overdrive).toBe(false);
    }
    // 5번째 해결 시점(5초)부터 10초 동안
    const r6 = onSolve(run, p, ["AND"], 1000);
    expect(r6.overdrive).toBe(true);
    expect(r6.points).toBe(Math.round(120 * comboMult(6)) * 2);
    expect(run.overdriveBonus).toBe(r6.points / 2);

    // 창이 지나면 원래대로
    const r7 = onSolve(run, p, ["AND"], 20000);
    expect(r7.overdrive).toBe(false);
  });

  it("§7.1 원점수 — 손으로 계산한 예제와 같다", () => {
    const run = createRun();
    const t1 = puzzle({ tier: 1 });
    const t3 = puzzle({ tier: 3 });
    // T1 3회(콤보 1·2·3 → 배율 1.0) + T3 2회(콤보 4·5 → 배율 1.2), 전부 최적화
    for (let i = 0; i < 3; i++) onSolve(run, t1, ["AND"], 4000);
    for (let i = 0; i < 2; i++) onSolve(run, t3, ["AND"], 6000);
    const solveScore = 120 * 3 + Math.round(120 * 1.2 * 1.5) * 2; // 360 + 216×2 = 792
    expect(run.score).toBe(solveScore);
    // raw = 792 + 최적화 5×80 + 최고티어 3×200 - 힌트 0
    expect(rawScore(run)).toBe(solveScore + 400 + 600);
    expect(rawScore(run, 12.5)).toBe(solveScore + 400 + 600 + 125);
    onHint(run);
    expect(rawScore(run, 12.5)).toBe(solveScore + 400 + 600 + 125 - 60);
  });

  it("buildMeta는 서버가 보는 키만 낸다", () => {
    const run = createRun();
    onSolve(run, puzzle({ tier: 1 }), ["AND"], 4000);
    onSolve(run, puzzle({ tier: 3 }), ["AND"], 8000);
    onHint(run);
    onWrongSubmit(run);
    run.owlEnergyFound = true;
    const meta = buildMeta(run, 112.44, 3.14);
    expect(Object.keys(meta).sort()).toEqual(
      [
        "avg_solve_ms",
        "combo_max",
        "combo_mult_avg",
        "duration_s",
        "hints",
        "optimal",
        "overdrive_bonus_score",
        "owl_energy_found",
        "solved",
        "tier_max",
        "tier_mult_avg",
        "time_left",
        "v",
        "wrong_submits",
      ].sort(),
    );
    expect(meta.duration_s).toBe(112.4);
    expect(meta.time_left).toBe(3.1);
    expect(meta.solved).toBe(2);
    expect(meta.optimal).toBe(2);
    expect(meta.tier_max).toBe(3);
    expect(meta.combo_max).toBe(2);
    expect(meta.hints).toBe(1);
    expect(meta.wrong_submits).toBe(1);
    expect(meta.avg_solve_ms).toBe(6000);
    expect(meta.combo_mult_avg).toBe(1);
    expect(meta.tier_mult_avg).toBe(1.25);
    expect(meta.overdrive_bonus_score).toBe(0);
    expect(meta.owl_energy_found).toBe(true);
    expect(meta.v).toBe("1.0.0");
  });
});

describe("truthHash", () => {
  it("길이가 다르면 다른 해시", () => {
    expect(truthHash([0, 1, 1, 0])).toBe(truthHash([0, 1, 1, 0]));
    expect(truthHash([0, 1])).not.toBe(truthHash([0, 1, 0, 1]));
    expect(truthHash([0, 0, 0, 1])).not.toBe(truthHash([0, 0, 1, 0]));
  });
});
