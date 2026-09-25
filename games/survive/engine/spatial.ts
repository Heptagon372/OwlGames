// 공간 해시 그리드 (기획서 §12) — 전수 비교 금지.
// 좌표가 무한히 늘어나므로 셀 좌표를 비트마스크로 감싸서 고정 크기 해시 테이블에 넣는다.
// 매 프레임 계수 정렬로 다시 채운다 (할당 없음).

import { CFG } from "../config";

const BITS = 7; // 128 × 128 셀
const SIDE = 1 << BITS;
const MASK = SIDE - 1;
const BUCKETS = SIDE * SIDE;

export type Grid = {
  counts: Int32Array;
  starts: Int32Array;
  items: Int32Array;
  cursor: Int32Array;
  cell: number;
};

export function createGrid(capacity: number): Grid {
  return {
    counts: new Int32Array(BUCKETS),
    starts: new Int32Array(BUCKETS + 1),
    items: new Int32Array(capacity),
    cursor: new Int32Array(BUCKETS),
    cell: CFG.perf.gridCell,
  };
}

function hash(cx: number, cy: number): number {
  return ((cy & MASK) << BITS) | (cx & MASK);
}

/** alive한 엔티티 index를 셀별로 정렬해 담는다 */
export function rebuildGrid(g: Grid, n: number, x: Float32Array, y: Float32Array, alive: Uint8Array): void {
  g.counts.fill(0);
  for (let i = 0; i < n; i++) {
    if (!alive[i]) continue;
    g.counts[hash(Math.floor(x[i] / g.cell), Math.floor(y[i] / g.cell))]++;
  }
  let acc = 0;
  for (let b = 0; b < BUCKETS; b++) {
    g.starts[b] = acc;
    g.cursor[b] = acc;
    acc += g.counts[b];
  }
  g.starts[BUCKETS] = acc;
  for (let i = 0; i < n; i++) {
    if (!alive[i]) continue;
    const b = hash(Math.floor(x[i] / g.cell), Math.floor(y[i] / g.cell));
    g.items[g.cursor[b]++] = i;
  }
}

/** 반경 r 안의 후보 index를 훑는다. 실제 거리 검사는 호출자가 한다 */
export function queryGrid(g: Grid, cx: number, cy: number, r: number, visit: (index: number) => void): void {
  const x0 = Math.floor((cx - r) / g.cell);
  const x1 = Math.floor((cx + r) / g.cell);
  const y0 = Math.floor((cy - r) / g.cell);
  const y1 = Math.floor((cy + r) / g.cell);
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      const b = hash(gx, gy);
      const end = g.starts[b] + g.counts[b];
      for (let k = g.starts[b]; k < end; k++) visit(g.items[k]);
    }
  }
}
