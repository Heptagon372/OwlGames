// 진리표 채점·최적화 판정 (기획서 §10)
import type { Gate, Placement, Puzzle, RowResult } from "../types";
import { evalTruth } from "./circuit";
import { ARITY, GATE_ORDER } from "./gates";

/** 행별 채점 — 배치 즉시(1프레임 내) 갱신되어야 한다 (§11-3) */
export function gradeRows(p: Puzzle, placement: Placement): RowResult[] {
  const actual = evalTruth(p, placement);
  return p.truth.map((expected, r) => {
    const a = actual ? actual[r] : null;
    return { expected, actual: a, ok: a !== null && a === expected };
  });
}

export function isSolved(p: Puzzle, placement: Placement): boolean {
  const actual = evalTruth(p, placement);
  if (!actual || actual.length !== p.truth.length) return false;
  return actual.every((v, r) => v === p.truth[r]);
}

export function usedGateCount(placement: Placement): number {
  let n = 0;
  for (const g of placement) if (g) n += 1;
  return n;
}

export function isOptimal(p: Puzzle, placement: Placement): boolean {
  return isSolved(p, placement) && usedGateCount(placement) === p.minGates;
}

/** 남은 부품 수 (지급 - 배치됨). 지급하지 않은 종류는 아예 넣지 않는다 */
export function remainingParts(p: Puzzle, placement: Placement): Partial<Record<Gate, number>> {
  const placed: Partial<Record<Gate, number>> = {};
  for (const g of placement) if (g) placed[g] = (placed[g] ?? 0) + 1;

  const out: Partial<Record<Gate, number>> = {};
  for (const g of GATE_ORDER) {
    const given = p.parts[g];
    if (given === undefined) continue;
    out[g] = Math.max(0, given - (placed[g] ?? 0));
  }
  return out;
}

/** 지금 이 슬롯에 이 게이트를 꽂을 수 있는가 (이미 그 칸에 있던 부품은 회수된 것으로 본다) */
export function canPlace(p: Puzzle, placement: Placement, gate: Gate, slot: number): boolean {
  if (!Number.isInteger(slot) || slot < 0 || slot >= p.slots.length) return false;
  if (p.slots[slot].inputs.length < ARITY[gate]) return false;
  const given = p.parts[gate] ?? 0;
  if (given <= 0) return false;
  let used = 0;
  for (let i = 0; i < p.slots.length; i++) if (i !== slot && placement[i] === gate) used += 1;
  return used < given;
}
