// 게이트 평가 — 6종 (기획서 §10)
// 스칼라판(evalGate)과 진리표 열 비트마스크판(evalGateMask)을 같은 진리로 유지한다.
import type { Gate } from "../types";

/** 트레이·솔버 탐색 순서 (결정적 결과를 위해 고정) */
export const GATE_ORDER: readonly Gate[] = ["AND", "OR", "NOT", "XOR", "NAND", "MUX"];

export const ARITY: Record<Gate, number> = { AND: 2, OR: 2, NOT: 1, XOR: 2, NAND: 2, MUX: 3 };

/** 표시용 라벨 — 기호 병기는 UI가 한다 (§12 접근성) */
export const GATE_LABEL: Record<Gate, string> = {
  AND: "AND",
  OR: "OR",
  NOT: "NOT",
  XOR: "XOR",
  NAND: "NAND",
  MUX: "MUX",
};

/** 부품 트레이 한 줄 설명 — 기호만으론 비전공자가 못 읽는다 (§12) */
export const GATE_DESC: Record<Gate, string> = {
  AND: "둘 다 1일 때만 1",
  OR: "하나라도 1이면 1",
  NOT: "0과 1을 뒤집는다 (첫 번째 배선만 쓴다)",
  XOR: "두 입력이 서로 다를 때만 1",
  NAND: "둘 다 1일 때만 0",
  MUX: "선택선이 0이면 첫째, 1이면 둘째 배선을 내보낸다",
};

/**
 * 한 입력 조합에 대한 게이트 출력 (0|1).
 * MUX의 배선 순서는 [sel, a, b] — sel이 0이면 a, 1이면 b.
 */
export function evalGate(gate: Gate, args: number[]): number {
  const need = ARITY[gate];
  if (args.length < need) {
    throw new Error(`${gate} 게이트에는 입력 ${need}개가 필요하다 (받은 값 ${args.length}개)`);
  }
  const x = args[0] ? 1 : 0;
  switch (gate) {
    case "NOT":
      return x ? 0 : 1;
    case "AND":
      return x && args[1] ? 1 : 0;
    case "OR":
      return x || args[1] ? 1 : 0;
    case "XOR":
      return x === (args[1] ? 1 : 0) ? 0 : 1;
    case "NAND":
      return x && args[1] ? 0 : 1;
    case "MUX":
      return x ? (args[2] ? 1 : 0) : (args[1] ? 1 : 0);
  }
}

/**
 * 진리표 열(2^n 비트를 담은 정수) 단위 평가.
 * 2^n ≤ 16이라 한 회로를 통째로 비트 연산 몇 번에 끝낼 수 있다 — 솔버가 밀리초 단위로 끝나는 이유.
 */
export function evalGateMask(gate: Gate, args: number[], mask: number): number {
  switch (gate) {
    case "NOT":
      return ~args[0] & mask;
    case "AND":
      return args[0] & args[1] & mask;
    case "OR":
      return (args[0] | args[1]) & mask;
    case "XOR":
      return (args[0] ^ args[1]) & mask;
    case "NAND":
      return ~(args[0] & args[1]) & mask;
    case "MUX":
      return ((~args[0] & args[1]) | (args[0] & args[2])) & mask;
  }
}
