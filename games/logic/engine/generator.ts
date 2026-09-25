// 문제 생성 + 자체 검증 (기획서 §5) — 고정 문제 배열 금지, 암기 방지
//
// 파이프라인
//   1) 티어에 맞는 배선(DAG)을 깔고 각 칸에 정답 게이트를 랜덤으로 꽂는다
//   2) 그 회로를 2^n 조합으로 평가해 목표 진리표를 얻는다
//   3) 솔버로 "지급 부품으로 만들 수 있는 최소 게이트 수"를 구한다
//   4) 통과 조건: 해가 있다 / 최소 게이트 수 == 슬롯 수 / 자명하지 않다 / 최근 진리표와 겹치지 않는다
//   조건을 못 맞추면 다시 뽑되, 단계마다 조건을 한 칸씩 풀어주고 마지막엔 안전한 폴백 문제로 떨어진다.
import { CFG, INPUT_NAMES, TIER_SHAPE } from "../config";
import type { Gate, Puzzle, SlotDef, Source, Tier } from "../types";
import { evalTruth, inputColumn } from "./circuit";
import { ARITY } from "./gates";
import { solve } from "./solver";

export function truthHash(truth: number[]): string {
  return `${truth.length}:${truth.join("")}`;
}

/** 진단용 카운터 — "문제 하나당 몇 번 다시 뽑았나"를 시뮬 테스트가 리포트한다 (게임 로직에는 쓰지 않는다) */
export const genStats = { attempts: 0, puzzles: 0, fallbacks: 0 };

/** mulberry32 — 일일 시드(§13)·봇 시뮬·테스트가 같은 문제를 재현할 수 있게 한다 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length) % arr.length];
}

/**
 * 최근 진리표 차단 깊이.
 * 2입력 티어는 만들 수 있는 비자명 진리표가 10개도 안 된다(2입력 함수 16개 중 자명한 6개 제외 = 10개,
 * 그중 "최소 게이트 수 == 슬롯 수"까지 맞는 건 T1 2개·T2 7개뿐). 10개를 막으면 생성이 불가능해지므로
 * 티어별로 실제 가능한 만큼만 막는다. T3부터는 기획서대로 10개.
 */
export function dedupDepth(tier: Tier): number {
  if (tier === 1) return 1;
  if (tier === 2) return 3;
  return CFG.gen.recentTruthBlock;
}

/** 자명한 진리표인가 — 전부 0 / 전부 1 / 입력 하나와 같거나 그 반대 (§5-4) */
export function isTrivialTruth(truth: number[], inputCount: number): boolean {
  if (truth.every((v) => v === 0)) return true;
  if (truth.every((v) => v === 1)) return true;
  for (let j = 0; j < inputCount; j++) {
    const col = inputColumn(inputCount, j);
    let same = true;
    let flipped = true;
    for (let r = 0; r < truth.length; r++) {
      const bit = (col >> r) & 1;
      if (truth[r] !== bit) same = false;
      if (truth[r] === bit) flipped = false;
      if (!same && !flipped) break;
    }
    if (same || flipped) return true;
  }
  return false;
}

/**
 * 배선 깔기. 슬롯 i는 입력과 앞선 슬롯만 가리킨다(비순환).
 * 슬롯 i(>0)는 반드시 슬롯 i-1을 한 번 쓴다 → 모든 칸이 출력까지 이어지므로 "안 써도 되는 칸"이 생기지 않는다.
 */
function wireSlots(inputCount: number, slotCount: number, wires: number, rand: () => number): SlotDef[] {
  const slots: SlotDef[] = [];
  for (let i = 0; i < slotCount; i++) {
    const pool: Source[] = [];
    for (let j = 0; j < inputCount; j++) pool.push({ kind: "input", index: j });
    for (let s = 0; s < i; s++) pool.push({ kind: "slot", index: s });

    const bag = [...pool];
    const chosen: Source[] = [];
    for (let w = 0; w < wires; w++) {
      if (bag.length) chosen.push(bag.splice(Math.floor(rand() * bag.length) % bag.length, 1)[0]);
      else chosen.push(pick(pool, rand));
    }
    if (i > 0) {
      const pos = Math.floor(rand() * wires) % wires;
      const prev: Source = { kind: "slot", index: i - 1 };
      // 원래 그 자리에 있던 소스를 다른 자리로 밀어내 중복 배선을 줄인다
      const dup = chosen.findIndex((s, idx) => idx !== pos && s.kind === "slot" && s.index === i - 1);
      if (dup >= 0) chosen[dup] = chosen[pos];
      chosen[pos] = prev;
    }
    slots.push({ inputs: chosen });
  }
  return slots;
}

/** 정답 회로에 꽂을 게이트 뽑기 — 티어 성격(§4)을 여기서 준다 */
function pickSolutionGates(tier: Tier, slotCount: number, rand: () => number): Gate[] | null {
  const shape = TIER_SHAPE[tier];
  const gates: Gate[] = [];
  for (let i = 0; i < slotCount; i++) gates.push(pick(shape.gates, rand));

  // T5의 간판은 MUX다. 부품을 딱 맞게 주는 티어라 정답에 없으면 트레이에도 안 올라온다
  if (tier === 5 && !gates.includes("MUX")) gates[Math.floor(rand() * slotCount) % slotCount] = "MUX";
  // T4는 "NOT 하나로 뒤집기"(드모르간) 맛을 내려고 NOT을 정확히 1개로 맞출 때가 많다
  if (tier === 4 && rand() < 0.6) {
    const others = shape.gates.filter((g) => g !== "NOT");
    for (let i = 0; i < slotCount; i++) if (gates[i] === "NOT") gates[i] = pick(others, rand);
    gates[Math.floor(rand() * slotCount) % slotCount] = "NOT";
  }

  for (const g of gates) if (ARITY[g] > shape.wires) return null;

  if (shape.exactParts) {
    const counts: Partial<Record<Gate, number>> = {};
    for (const g of gates) counts[g] = (counts[g] ?? 0) + 1;
    const values = Object.values(counts) as number[];
    // 한 종류만 주면 '모자란 부품' 맛이 안 나고, 귀한 부품(1개짜리)이 하나는 있어야 한다
    if (values.length < 2) return null;
    if (!values.some((c) => c === 1)) return null;
  }
  return gates;
}

/**
 * 지급 부품.
 * T1~T3: 정답이 쓰는 개수 + 여유 — 티어의 게이트를 최소 1개씩 트레이에 올린다(고를 게 없으면 퍼즐이 아니다).
 * T4~T5: 여유 0. 정답이 쓰는 개수 그대로 (§4 — 일부러 모자라게).
 */
function partsFor(tier: Tier, gates: Gate[]): Partial<Record<Gate, number>> {
  const counts: Partial<Record<Gate, number>> = {};
  for (const g of gates) counts[g] = (counts[g] ?? 0) + 1;
  const shape = TIER_SHAPE[tier];
  if (shape.exactParts) return counts;

  const out: Partial<Record<Gate, number>> = {};
  for (const g of shape.gates) out[g] = Math.max(1, counts[g] ?? 0);
  return out;
}

function popcount(v: number): number {
  let n = 0;
  for (let x = v; x; x >>= 1) n += x & 1;
  return n;
}

function rowLabel(inputs: string[], row: number): string {
  const n = inputs.length;
  return inputs.map((name, j) => `${name}=${(row >> (n - 1 - j)) & 1}`).join(" ");
}

function dependsOn(truth: number[], inputCount: number, j: number): boolean {
  const bit = 1 << (inputCount - 1 - j);
  for (let r = 0; r < truth.length; r++) if (truth[r] !== truth[r ^ bit]) return true;
  return false;
}

/**
 * 성질만 알려주는 한 줄 힌트 (§6 — 정답 게이트는 절대 찍어주지 않는다).
 * 앞쪽 규칙일수록 더 구체적이다.
 */
export function describeTruth(inputs: string[], truth: number[]): string {
  const n = inputs.length;
  const rows = truth.length;
  const ones = truth.reduce((a, b) => a + b, 0);

  if (ones === 1 && truth[rows - 1] === 1) return "모든 입력이 1일 때만 열린다.";
  if (ones === rows - 1 && truth[0] === 0) return "입력이 하나라도 1이면 열린다.";
  if (ones === 1) return `${rowLabel(inputs, truth.indexOf(1))}일 때만 열린다.`;
  if (ones === rows - 1) return `${rowLabel(inputs, truth.indexOf(0))}일 때만 빼고 전부 열린다.`;

  let odd = true;
  let even = true;
  for (let r = 0; r < rows; r++) {
    const p = popcount(r) & 1;
    if (truth[r] !== p) odd = false;
    if (truth[r] === p) even = false;
  }
  if (odd) return "1인 입력의 개수가 홀수일 때만 열린다.";
  if (even) return "1인 입력의 개수가 짝수일 때만 열린다.";

  let exactlyOne = true;
  let majority = true;
  for (let r = 0; r < rows; r++) {
    if (truth[r] !== (popcount(r) === 1 ? 1 : 0)) exactlyOne = false;
    if (truth[r] !== (popcount(r) * 2 > n ? 1 : 0)) majority = false;
  }
  if (exactlyOne) return "1인 입력이 정확히 하나일 때만 열린다.";
  if (majority) return "1인 입력이 절반을 넘을 때만 열린다.";

  const ignored = inputs.filter((_, j) => !dependsOn(truth, n, j));
  if (ignored.length) return `입력 ${ignored.join("·")}는 출력에 전혀 영향을 주지 않는다.`;

  // 혼자서 문을 막거나 여는 입력이 있는가 (필요조건·충분조건)
  for (let j = 0; j < n; j++) {
    const bit = 1 << (n - 1 - j);
    let zeroNeverOpens = true;
    let oneAlwaysOpens = true;
    let oneNeverOpens = true;
    let zeroAlwaysOpens = true;
    for (let r = 0; r < rows; r++) {
      if (r & bit) {
        if (!truth[r]) oneAlwaysOpens = false;
        else oneNeverOpens = false;
      } else {
        if (truth[r]) zeroNeverOpens = false;
        else zeroAlwaysOpens = false;
      }
    }
    if (zeroNeverOpens) return `입력 ${inputs[j]}가 0이면 절대 열리지 않는다.`;
    if (oneNeverOpens) return `입력 ${inputs[j]}가 1이면 절대 열리지 않는다.`;
    if (oneAlwaysOpens) return `입력 ${inputs[j]}가 1이면 무조건 열린다.`;
    if (zeroAlwaysOpens) return `입력 ${inputs[j]}가 0이면 무조건 열린다.`;
  }

  let antiSelfDual = true;
  for (let r = 0; r < rows; r++) if (truth[r] === truth[rows - 1 - r]) antiSelfDual = false;
  if (antiSelfDual) return "입력을 전부 뒤집으면 출력도 뒤집힌다.";

  let up = true;
  let down = true;
  for (let r = 0; r < rows; r++) {
    for (let b = 0; b < n; b++) {
      if (r & (1 << b)) continue;
      const hi = truth[r | (1 << b)];
      if (truth[r] > hi) up = false;
      if (truth[r] < hi) down = false;
    }
  }
  if (up) return "입력을 0에서 1로 바꿀 때 출력이 1에서 0으로 내려가는 경우는 없다.";
  if (down) return "입력을 0에서 1로 바꿀 때 출력이 0에서 1로 올라가는 경우는 없다.";

  const firstOne = truth.indexOf(1);
  return `${rows}가지 조합 중 ${ones}가지에서만 열린다 (예: ${rowLabel(inputs, firstOne)}).`;
}

function attempt(
  tier: Tier,
  slotCount: number,
  inputCount: number,
  rand: () => number,
  blocked: Set<string>,
  requireAllInputs: boolean,
): Puzzle | null {
  const shape = TIER_SHAPE[tier];
  const gates = pickSolutionGates(tier, slotCount, rand);
  if (!gates) return null;

  const draft: Puzzle = {
    id: "",
    tier,
    inputs: INPUT_NAMES.slice(0, inputCount),
    slots: wireSlots(inputCount, slotCount, shape.wires, rand),
    outputSlot: slotCount - 1,
    parts: partsFor(tier, gates),
    truth: [],
    minGates: slotCount,
    hint: "",
  };

  const truth = evalTruth(draft, gates);
  if (!truth) return null;
  if (isTrivialTruth(truth, inputCount)) return null;
  // 화면에 그려 둔 입력이 출력에 아무 영향도 못 주면 배선을 읽는 재미가 사라진다
  if (requireAllInputs) {
    for (let j = 0; j < inputCount; j++) if (!dependsOn(truth, inputCount, j)) return null;
  }
  if (blocked.has(truthHash(truth))) return null;

  draft.truth = truth;
  const sol = solve(draft);
  if (!sol) return null;
  // 난이도 일치 — 더 적은 부품으로 풀리면 그 티어의 문제가 아니다 (§5-4)
  if (sol.minGates !== slotCount) return null;

  draft.minGates = sol.minGates;
  draft.hint = describeTruth(draft.inputs, truth);
  draft.id = `L${tier}-${Math.floor(rand() * 0xffffff).toString(36)}`;
  return draft;
}

/** 어떤 상황에서도 돌려줄 수 있는 안전판 — 2입력 AND 한 칸 */
function fallbackPuzzle(tier: Tier, rand: () => number): Puzzle {
  const truth = [0, 0, 0, 1];
  return {
    id: `L${tier}-fb${Math.floor(rand() * 0xffff).toString(36)}`,
    tier,
    inputs: ["A", "B"],
    slots: [{ inputs: [{ kind: "input", index: 0 }, { kind: "input", index: 1 }] }],
    outputSlot: 0,
    parts: { AND: 1, OR: 1, NOT: 1 },
    truth,
    minGates: 1,
    hint: describeTruth(["A", "B"], truth),
  };
}

/**
 * 티어에 맞는 문제 생성 + 자체 검증.
 * `recentTruth`는 최근 진리표 해시 목록(가장 최근이 배열 끝). 티어별 차단 깊이만큼 뒤에서 잘라 쓴다.
 */
export function generatePuzzle(tier: Tier, rand: () => number, recentTruth: string[]): Puzzle {
  const shape = TIER_SHAPE[tier];
  const depth = dedupDepth(tier);
  // 조건을 한 단계씩 풀어준다: 중복 차단 축소 → 모든 입력 쓰기 해제 → 슬롯 한 칸 줄이기 → 중복 차단 해제
  const stages: { dedup: number; shrink: number; allInputs: boolean }[] = [
    { dedup: depth, shrink: 0, allInputs: true },
    { dedup: 1, shrink: 0, allInputs: true },
    { dedup: 1, shrink: 0, allInputs: false },
    { dedup: 1, shrink: 1, allInputs: false },
    { dedup: 0, shrink: 1, allInputs: false },
  ];

  for (const st of stages) {
    const blocked = new Set(st.dedup > 0 ? recentTruth.slice(-st.dedup) : []);
    for (let i = 0; i < CFG.gen.maxAttempts; i++) {
      const slotCount = Math.max(1, pick(shape.slots, rand) - st.shrink);
      const inputCount = pick(shape.inputs, rand);
      genStats.attempts += 1;
      const p = attempt(tier, slotCount, inputCount, rand, blocked, st.allInputs);
      if (p) {
        genStats.puzzles += 1;
        return p;
      }
    }
  }
  genStats.puzzles += 1;
  genStats.fallbacks += 1;
  return fallbackPuzzle(tier, rand);
}
