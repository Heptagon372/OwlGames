// 🧩 아울리스 — 보드 규칙 (§5, §7, §8, §12) · GridManager / ComboManager 역할
//
// 보드는 Uint8Array 한 장이다. 칸 = r * COLS + c, r = 0 이 맨 위(보이지 않는 줄), r = ROWS-1 이 바닥.
//   0 = 빈칸 · 1~4 = 색 블록 · 5 = 방해 블록
// 이 파일의 함수는 전부 순수 함수 + 미리 만든 버퍼(Scratch)만 쓴다 — AI 가 한 번 생각할 때 수천 번 부르기 때문.

import { CFG, stepPower } from "../config";

export const EMPTY = 0;
export const GARBAGE = 5;
export const COLS = CFG.field.cols;
/** 보이는 줄 + 숨은 줄 */
export const ROWS = CFG.field.rows + CFG.field.hidden;
export const HIDDEN = CFG.field.hidden;
export const CELLS = COLS * ROWS;
/** 여기가 차 있으면 새 블록이 못 나온다 = 패배 (보이는 맨 윗줄의 가운데 열) */
export const SPAWN_ROW = HIDDEN;
export const SPAWN_COL = CFG.field.spawnCol;
export const DEATH_CELL = SPAWN_ROW * COLS + SPAWN_COL;

export type Board = Uint8Array;

export function newBoard(): Board {
  return new Uint8Array(CELLS);
}

export const at = (c: number, r: number) => r * COLS + c;

/** 연쇄 계산용 작업 버퍼 (flood fill 스택·표시) — 한 번 만들어 계속 쓴다 */
export type Scratch = {
  seen: Uint8Array;
  mark: Uint8Array;
  stack: Int16Array;
  group: Int16Array;
};

export function newScratch(): Scratch {
  return {
    seen: new Uint8Array(CELLS),
    mark: new Uint8Array(CELLS),
    stack: new Int16Array(CELLS),
    group: new Int16Array(CELLS),
  };
}

/**
 * 중력 — 열마다 블록을 바닥으로 내린다.
 * `drop` 을 주면 새 자리의 "아직 덜 떨어진 거리(칸)"를 더해 둔다 → 렌더가 그만큼 위에서부터 떨어지는 연출을 한다.
 */
export function applyGravity(b: Board, drop?: Float32Array): boolean {
  let moved = false;
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      const i = r * COLS + c;
      const v = b[i];
      if (v === EMPTY) continue;
      if (r !== write) {
        const j = write * COLS + c;
        b[j] = v;
        b[i] = EMPTY;
        if (drop) {
          drop[j] = drop[i] + (write - r);
          drop[i] = 0;
        }
        moved = true;
      }
      write--;
    }
  }
  return moved;
}

/** 열 높이 (바닥부터 쌓인 칸 수) — 중력이 끝난 보드 기준 */
export function colHeight(b: Board, c: number): number {
  for (let r = 0; r < ROWS; r++) if (b[r * COLS + c] !== EMPTY) return ROWS - r;
  return 0;
}

/** 위험도 0~1 (§27) — 가장 높은 열 기준, 생성 열은 한 칸 더 무겁게 본다 */
export function dangerOf(b: Board): number {
  const vis = CFG.field.rows;
  let worst = 0;
  for (let c = 0; c < COLS; c++) {
    const h = Math.min(vis, colHeight(b, c));
    const w = c === SPAWN_COL || c === SPAWN_COL + 1 ? h / vis : (h / vis) * 0.9;
    if (w > worst) worst = w;
  }
  return Math.min(1, worst);
}

export function isDead(b: Board): boolean {
  return b[DEATH_CELL] !== EMPTY;
}

/** 한 단계 제거 결과 */
export type StepResult = {
  /** 터진 색 블록 수 */
  cells: number;
  /** 함께 부서진 방해 블록 수 */
  garbage: number;
  /** 터진 그룹 수 */
  groups: number;
};

function push(seen: Uint8Array, stack: Int16Array, sp: number, i: number): number {
  seen[i] = 1;
  stack[sp] = i;
  return sp + 1;
}

/** 방해 블록이면 표시하고 1 (이미 표시했거나 방해 블록이 아니면 0) */
function crack(b: Board, mark: Uint8Array, i: number): number {
  if (b[i] !== GARBAGE || mark[i]) return 0;
  mark[i] = 2;
  return 1;
}

/**
 * 같은 색 4개 이상 그룹(상하좌우 연결, §7)을 찾아 `s.mark` 에 1 로 표시한다.
 * 그룹에 붙어 있는 방해 블록은 2 로 표시한다 (§12 — 옆에서 터지면 같이 부서진다).
 * 표시만 하고 지우지는 않는다 (엔진은 번쩍이는 연출 뒤에 지운다).
 */
export function markGroups(b: Board, s: Scratch, out: StepResult): boolean {
  const { seen, mark, stack, group } = s;
  seen.fill(0);
  mark.fill(0);
  out.cells = 0;
  out.garbage = 0;
  out.groups = 0;
  const min = CFG.matchMin;

  for (let start = 0; start < CELLS; start++) {
    const color = b[start];
    if (color === EMPTY || color === GARBAGE || seen[start]) continue;
    // flood fill
    let sp = 0;
    let gn = 0;
    stack[sp++] = start;
    seen[start] = 1;
    while (sp > 0) {
      const i = stack[--sp];
      group[gn++] = i;
      const c = i % COLS;
      if (c > 0 && !seen[i - 1] && b[i - 1] === color) sp = push(seen, stack, sp, i - 1);
      if (c < COLS - 1 && !seen[i + 1] && b[i + 1] === color) sp = push(seen, stack, sp, i + 1);
      if (i >= COLS && !seen[i - COLS] && b[i - COLS] === color) sp = push(seen, stack, sp, i - COLS);
      if (i + COLS < CELLS && !seen[i + COLS] && b[i + COLS] === color) sp = push(seen, stack, sp, i + COLS);
    }
    if (gn < min) continue;
    out.groups++;
    out.cells += gn;
    for (let k = 0; k < gn; k++) mark[group[k]] = 1;
  }
  if (out.groups === 0) return false;

  // 터지는 칸 옆의 방해 블록
  for (let i = 0; i < CELLS; i++) {
    if (mark[i] !== 1) continue;
    const c = i % COLS;
    if (c > 0) out.garbage += crack(b, mark, i - 1);
    if (c < COLS - 1) out.garbage += crack(b, mark, i + 1);
    if (i >= COLS) out.garbage += crack(b, mark, i - COLS);
    if (i + COLS < CELLS) out.garbage += crack(b, mark, i + COLS);
  }
  return true;
}

/** `markGroups` 로 표시한 칸을 지운다 */
export function removeMarked(b: Board, s: Scratch): void {
  const { mark } = s;
  for (let i = 0; i < CELLS; i++) if (mark[i]) b[i] = EMPTY;
}

/** 연쇄를 끝까지 돌린 결과 (AI 시뮬레이션용) */
export type ChainResult = { chain: number; power: number; cells: number; garbage: number };

const tmpStep: StepResult = { cells: 0, garbage: 0, groups: 0 };

/**
 * 보드를 제자리에서 끝까지 굴린다: 중력 → 제거 → 중력 → … (§8)
 * 연쇄 수와 공격력 합계를 돌려준다. 공격력은 `stepPower` 를 그대로 더한 값(방해 블록 칸 수로 바꾸기 전).
 */
export function resolve(b: Board, s: Scratch, out: ChainResult): ChainResult {
  out.chain = 0;
  out.power = 0;
  out.cells = 0;
  out.garbage = 0;
  applyGravity(b);
  while (markGroups(b, s, tmpStep)) {
    out.chain++;
    out.power += stepPower(out.chain, tmpStep.cells);
    out.cells += tmpStep.cells;
    out.garbage += tmpStep.garbage;
    removeMarked(b, s);
    applyGravity(b);
  }
  return out;
}

/** 열 위에 색 하나를 얹는다 (시뮬레이션용 — 중력이 끝난 보드 기준). 넘치면 false */
export function stackOn(b: Board, c: number, color: number): boolean {
  const h = colHeight(b, c);
  if (h >= ROWS) return false;
  b[(ROWS - 1 - h) * COLS + c] = color;
  return true;
}
