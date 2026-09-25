// 슬롯 그래프 평가 — 순수 함수 (기획서 §10, 단위 테스트 필수)
//
// 규칙
//  - 배선은 고정이고 플레이어는 게이트 종류만 고른다. 슬롯 i의 배선은 항상 앞선 슬롯(index < i)이나 입력만 가리킨다.
//  - 게이트가 슬롯의 배선 수보다 적게 쓰면 앞에서부터 ARITY[gate]개만 쓴다 (2선 칸에 NOT을 꽂으면 [0]번만).
//  - 비어 있는 칸은 값이 없다(null). 출력이 그 칸에 **구조적으로** 기대고 있으면 결과도 null이다.
//    (AND의 한쪽이 0이라 어차피 0이어도 null로 둔다 — 값에 따라 채점이 깜빡이면 UI가 더 헷갈린다)
import type { Placement, Puzzle, Source } from "../types";
import { ARITY, evalGateMask } from "./gates";

/** 진리표 행 수 = 2^n */
export function rowCount(inputCount: number): number {
  return 1 << inputCount;
}

/** 2^n비트를 덮는 마스크 (n ≤ 4 → 최대 16비트) */
export function maskFor(inputCount: number): number {
  return (1 << (1 << inputCount)) - 1;
}

/** 입력 j의 진리표 열 — inputs[0]이 MSB */
export function inputColumn(inputCount: number, j: number): number {
  const rows = rowCount(inputCount);
  const shift = inputCount - 1 - j;
  let col = 0;
  for (let r = 0; r < rows; r++) if ((r >> shift) & 1) col |= 1 << r;
  return col;
}

/** 진리표 배열 → 열 비트마스크 */
export function truthColumn(truth: number[]): number {
  let col = 0;
  for (let r = 0; r < truth.length; r++) if (truth[r]) col |= 1 << r;
  return col;
}

/** 입력 비트 배열 → 진리표 행 번호 */
export function rowIndex(inputCount: number, bits: number[]): number {
  let r = 0;
  for (let j = 0; j < inputCount; j++) if (bits[j]) r |= 1 << (inputCount - 1 - j);
  return r;
}

function sourceColumn(src: Source, inCols: number[], slotCols: (number | null)[]): number | null {
  if (src.kind === "input") return inCols[src.index] ?? null;
  // 아직 계산되지 않은(=뒤쪽) 슬롯을 가리키면 값이 없는 것으로 본다 — 순환 배선 방지
  const v = slotCols[src.index];
  return v === undefined ? null : v;
}

/** 슬롯별 진리표 열. 빈 칸이거나 그 칸이 기대는 칸이 비면 null */
export function evalColumns(p: Puzzle, placement: Placement): (number | null)[] {
  const n = p.inputs.length;
  const mask = maskFor(n);
  const inCols: number[] = [];
  for (let j = 0; j < n; j++) inCols.push(inputColumn(n, j));

  const cols: (number | null)[] = [];
  for (let i = 0; i < p.slots.length; i++) {
    const gate = placement[i] ?? null;
    if (!gate) {
      cols.push(null);
      continue;
    }
    const need = ARITY[gate];
    const wires = p.slots[i].inputs;
    if (wires.length < need) {
      cols.push(null);
      continue;
    }
    const args: number[] = [];
    let ok = true;
    for (let w = 0; w < need; w++) {
      const v = sourceColumn(wires[w], inCols, cols);
      if (v === null) {
        ok = false;
        break;
      }
      args.push(v);
    }
    cols.push(ok ? evalGateMask(gate, args, mask) : null);
  }
  return cols;
}

/** 전체 입력 조합. 하나라도 평가 불가면 null */
export function evalTruth(p: Puzzle, placement: Placement): number[] | null {
  const out = evalColumns(p, placement)[p.outputSlot];
  if (out === null || out === undefined) return null;
  const rows = rowCount(p.inputs.length);
  const truth: number[] = [];
  for (let r = 0; r < rows; r++) truth.push((out >> r) & 1);
  return truth;
}

/** 한 입력 조합에 대한 출력. 출력에 필요한 슬롯이 비어 있으면 null */
export function evalOnce(p: Puzzle, placement: Placement, bits: number[]): number | null {
  const truth = evalTruth(p, placement);
  if (!truth) return null;
  return truth[rowIndex(p.inputs.length, bits)] ?? null;
}
