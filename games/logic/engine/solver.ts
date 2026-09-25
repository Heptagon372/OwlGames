// 브루트포스 최소 게이트 탐색 (기획서 §5-3)
//
// 슬롯은 최대 4칸, 고를 수 있는 부품은 최대 6종이라 (6+1)^4 = 2,401가지가 상한이다.
// 슬롯 순서대로 깊이우선으로 내려가며 각 칸의 진리표 열을 한 번만 계산하고,
// 이미 찾은 답보다 부품을 더 쓰는 가지는 잘라낸다 → 항상 밀리초 단위로 끝난다 (§11-2: 50ms).
import type { Gate, Placement, Puzzle } from "../types";
import { inputColumn, maskFor, truthColumn } from "./circuit";
import { ARITY, evalGateMask, GATE_ORDER } from "./gates";

/** 주어진 부품으로 만들 수 있는 최소 게이트 해. 없으면 null */
export function solve(p: Puzzle): { minGates: number; placement: Placement } | null {
  const k = p.slots.length;
  const n = p.inputs.length;
  if (k === 0 || p.outputSlot < 0 || p.outputSlot >= k) return null;

  const mask = maskFor(n);
  const target = truthColumn(p.truth) & mask;
  const inCols: number[] = [];
  for (let j = 0; j < n; j++) inCols.push(inputColumn(n, j));

  const gates: Gate[] = GATE_ORDER.filter((g) => (p.parts[g] ?? 0) > 0);
  const remain: Partial<Record<Gate, number>> = { ...p.parts };
  const cols: (number | null)[] = new Array(k).fill(null);
  const cur: Placement = new Array(k).fill(null);
  // 클로저 안에서 갱신하므로 객체에 담는다 (지역 변수면 타입 좁히기에 걸린다)
  const best: { placement: Placement | null; used: number } = { placement: null, used: Infinity };

  const argsOf = (slot: number, gate: Gate): number[] | null => {
    const need = ARITY[gate];
    const wires = p.slots[slot].inputs;
    if (wires.length < need) return null;
    const args: number[] = [];
    for (let w = 0; w < need; w++) {
      const src = wires[w];
      const v = src.kind === "input" ? (inCols[src.index] ?? null) : (cols[src.index] ?? null);
      if (v === null) return null;
      args.push(v);
    }
    return args;
  };

  const dfs = (i: number, used: number): void => {
    if (used >= best.used) return; // 더 나아질 수 없다
    if (i === k) {
      if (cols[p.outputSlot] === target) {
        best.used = used;
        best.placement = cur.slice();
      }
      return;
    }
    // 1) 빈 칸을 먼저 본다 — 적게 쓰는 해를 빨리 찾아야 가지치기가 산다
    cols[i] = null;
    cur[i] = null;
    dfs(i + 1, used);
    // 2) 남은 부품을 하나씩
    for (const g of gates) {
      if ((remain[g] ?? 0) <= 0) continue;
      const args = argsOf(i, g);
      if (!args) continue;
      remain[g] = (remain[g] ?? 0) - 1;
      cols[i] = evalGateMask(g, args, mask);
      cur[i] = g;
      dfs(i + 1, used + 1);
      remain[g] = (remain[g] ?? 0) + 1;
    }
    cols[i] = null;
    cur[i] = null;
  };

  dfs(0, 0);
  return best.placement ? { minGates: best.used, placement: best.placement } : null;
}
