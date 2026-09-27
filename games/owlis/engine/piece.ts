// 🧩 아울리스 — 아울 블록(두 칸짜리) · BlockManager 역할 (§6)
//
// 블록 = 축(pivot) + 날개(child). 회전 rot 은 날개가 붙은 방향이다.
//   0 = 위 · 1 = 오른쪽 · 2 = 아래 · 3 = 왼쪽
// 굳으면 두 칸이 **따로 떨어진다** (§8) — 그래서 모양보다 색 배치가 중요하다.

import { mulberry32 } from "@/games/core/canvas";
import { CFG } from "../config";
import { COLS, EMPTY, HIDDEN, ROWS, colHeight, stackOn, type Board } from "./board";

export type Piece = { c: number; r: number; rot: number; a: number; b: number };
export type Pair = { a: number; b: number };

const DC = [0, 1, 0, -1] as const;
const DR = [-1, 0, 1, 0] as const;

export function childC(p: Piece): number {
  return p.c + DC[p.rot];
}
export function childR(p: Piece): number {
  return p.r + DR[p.rot];
}

function free(b: Board, c: number, r: number): boolean {
  return c >= 0 && c < COLS && r >= 0 && r < ROWS && b[r * COLS + c] === EMPTY;
}

export function fits(b: Board, c: number, r: number, rot: number): boolean {
  return free(b, c, r) && free(b, c + DC[rot], r + DR[rot]);
}

/** 좌우·아래 이동 — 막히면 false */
export function tryMove(b: Board, p: Piece, dc: number, dr: number): boolean {
  if (!fits(b, p.c + dc, p.r + dr, p.rot)) return false;
  p.c += dc;
  p.r += dr;
  return true;
}

/**
 * 회전 (dir = +1 시계 / -1 반시계).
 * 막히면 벽 차기: 날개가 벽/블록에 닿으면 축을 반대쪽으로 한 칸, 아래가 막히면 한 칸 위로.
 * 좁은 골짜기처럼 양옆이 다 막혀 가로로 못 돌면 **반 바퀴**(위↔아래)를 돈다 — 모바일에서 두 번 누를 필요가 없게.
 */
export function tryRotate(b: Board, p: Piece, dir: 1 | -1): boolean {
  const rot = (p.rot + dir + 4) % 4;
  const kicks: [number, number][] =
    rot === 1 ? [[0, 0], [-1, 0]] : rot === 3 ? [[0, 0], [1, 0]] : rot === 2 ? [[0, 0], [0, -1]] : [[0, 0], [0, 1]];
  for (const [dc, dr] of kicks) {
    if (fits(b, p.c + dc, p.r + dr, rot)) {
      p.c += dc;
      p.r += dr;
      p.rot = rot;
      return true;
    }
  }
  if (rot === 1 || rot === 3) {
    const flip = (p.rot + 2) % 4;
    for (const [dc, dr] of [[0, 0], [0, -1]] as const) {
      if (fits(b, p.c + dc, p.r + dr, flip)) {
        p.c += dc;
        p.r += dr;
        p.rot = flip;
        return true;
      }
    }
  }
  return false;
}

/** 굳힌다 — 보드에 두 칸을 쓴다 (중력은 부르는 쪽이) */
export function writePiece(b: Board, p: Piece): void {
  b[p.r * COLS + p.c] = p.a;
  const cr = childR(p);
  const cc = childC(p);
  if (cr >= 0 && cr < ROWS && cc >= 0 && cc < COLS) b[cr * COLS + cc] = p.b;
}

/* ── 블록 순서 ──────────────────────────────────────────────── */

/**
 * i 번째 블록의 두 색. 시드와 순번만으로 정해진다 — 플레이어와 AI 가 **같은 순서**를 받는다(공정).
 * 상태가 없어서 AI 가 몰래 앞을 볼 방법도 없다: AI 는 `peek` 으로 NEXT 개수만큼만 본다 (§46).
 */
export function pairAt(seed: number, i: number): Pair {
  const r = mulberry32((seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0);
  r();
  const a = 1 + Math.floor(r() * CFG.colors);
  const b = 1 + Math.floor(r() * CFG.colors);
  return { a, b };
}

/* ── AI 용: 놓을 수 있는 자리 ─────────────────────────────────── */

export type Placement = { col: number; rot: number };

/** 생성 위치에서 목표 열까지 윗줄로 지나갈 수 있는가 (지나가는 열의 보이는 맨 윗줄이 비어 있어야 한다) */
function pathOpen(b: Board, from: number, to: number): boolean {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  for (let c = lo; c <= hi; c++) if (colHeight(b, c) > ROWS - HIDDEN - 1) return false;
  return true;
}

/**
 * 서로 다른 결과가 나오는 자리 전부 (최대 22개). 같은 색 두 칸이면 겹치는 자리는 뺀다.
 * 결과만 보면 되므로 굳은 뒤의 모양(열마다 위에 얹힘)으로 계산한다.
 */
export function placements(b: Board, pair: Pair, spawnCol: number, out: Placement[]): Placement[] {
  out.length = 0;
  const same = pair.a === pair.b;
  for (let c = 0; c < COLS; c++) {
    // 세로 (날개 위 / 아래)
    if (pathOpen(b, spawnCol, c)) {
      out.push({ col: c, rot: 0 });
      if (!same) out.push({ col: c, rot: 2 });
    }
    // 가로 (날개 오른쪽 / 왼쪽)
    if (c < COLS - 1 && pathOpen(b, spawnCol, c) && pathOpen(b, spawnCol, c + 1)) out.push({ col: c, rot: 1 });
    if (!same && c > 0 && pathOpen(b, spawnCol, c) && pathOpen(b, spawnCol, c - 1)) out.push({ col: c, rot: 3 });
  }
  return out;
}

/** 보드에 자리 하나를 적용한다 (중력이 끝난 모양으로). 넘치면 false */
export function applyPlacement(b: Board, pair: Pair, pl: Placement): boolean {
  const { col, rot } = pl;
  if (rot === 0) return stackOn(b, col, pair.a) && stackOn(b, col, pair.b);
  if (rot === 2) return stackOn(b, col, pair.b) && stackOn(b, col, pair.a);
  if (rot === 1) return stackOn(b, col, pair.a) && stackOn(b, col + 1, pair.b);
  return stackOn(b, col, pair.a) && stackOn(b, col - 1, pair.b);
}
