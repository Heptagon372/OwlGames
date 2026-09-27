// 🧩 아울리스 — 필드 하나 (플레이어·AI 공통) · PlayerManager / AttackManager(받는 쪽) 역할
//
// 흐름: spawn → active(조작·낙하) → 굳음 → settle(떨어지는 연출) → clear(번쩍) → settle → … → 연쇄 끝
//       → (받을 방해 블록이 있으면) 방해 블록 낙하 → spawn
// 점수·공격 계산은 여기서 하지 않는다. 연쇄 단계·끝을 `hooks` 로 알리면 게임(game.ts)이 처리한다.

import { CFG, stepPower } from "../config";
import {
  CELLS,
  COLS,
  EMPTY,
  GARBAGE,
  ROWS,
  SPAWN_COL,
  SPAWN_ROW,
  applyGravity,
  colHeight,
  dangerOf,
  isDead,
  markGroups,
  newBoard,
  newScratch,
  removeMarked,
  stackOn,
  type Board,
  type Scratch,
  type StepResult,
} from "./board";
import { childC, childR, fits, pairAt, tryMove, tryRotate, writePiece, type Pair, type Piece } from "./piece";

export type Phase = "spawn" | "active" | "settle" | "clear" | "dead" | "reboot";

export type Field = {
  side: 0 | 1;
  seed: number;
  board: Board;
  /** 렌더용 — 칸마다 "아직 덜 떨어진 거리(칸)" */
  drop: Float32Array;
  /** 렌더용 — 지금 번쩍이는 칸 (1 = 색, 2 = 방해) */
  flash: Uint8Array;
  s: Scratch;
  step: StepResult;

  piece: Piece | null;
  /** 블록이 새로 나올 때마다 +1 (AI 가 "새 블록"을 알아채는 용도) */
  pieceId: number;
  /** 다음에 꺼낼 블록 순번 */
  seq: number;
  hold: Pair | null;
  holdUsed: boolean;

  phase: Phase;
  timer: number;
  fallAcc: number;
  grounded: boolean;
  lockT: number;
  /** 바닥에 닿은 뒤 움직여서 굳기를 미룬 횟수 — 더 낮은 줄에 닿아야 다시 0 이 된다 (무한 회전 방지) */
  lockResets: number;
  /** 이 블록이 내려간 가장 낮은 줄 · 그 줄에서 바닥에 닿은 적이 있는가 */
  lowest: number;
  touchedDown: boolean;
  soft: boolean;
  /** 소프트 드롭 속도 (AI 는 난이도마다 다르다) */
  softCps: number;

  /** 이번 연쇄 */
  chain: number;
  chainPower: number;
  /** 연쇄가 시작될 때의 위험도·받을 방해 블록 (EMERGENCY · COUNTER 판정) */
  chainDanger: number;
  chainIncoming: number;
  /** 이번 차례에 방해 블록을 이미 받았는가 */
  garbageDone: boolean;

  /** 받을 방해 블록 (칸) */
  incoming: number;
  /** 공격력 → 칸 수 변환에서 남은 소수 */
  carry: number;
  /** 방해 블록 위치 난수 (블록 순서와 따로) */
  grng: () => number;

  stats: {
    pieces: number;
    cleared: number;
    garbageCleared: number;
    chains: number;
    maxCombo: number;
    comboSum: number;
    sent: number;
    received: number;
  };
};

/** 연쇄 단계·끝을 게임에 알린다 */
export type FieldHooks = {
  /** 한 단계가 터지기 직전 (chain = 몇 번째 단계인지, step = 터지는 양) */
  onStep(f: Field, chain: number, step: StepResult): void;
  /** 연쇄가 끝났다 — 받을 방해 블록 상쇄는 여기서 끝나야 한다 */
  onChainEnd(f: Field, chain: number, power: number): void;
  onLock(f: Field): void;
  onGarbage(f: Field, cells: number): void;
  onDead(f: Field): void;
};

export function newField(side: 0 | 1, seed: number, grng: () => number): Field {
  return {
    side,
    seed,
    board: newBoard(),
    drop: new Float32Array(CELLS),
    flash: new Uint8Array(CELLS),
    s: newScratch(),
    step: { cells: 0, garbage: 0, groups: 0 },
    piece: null,
    pieceId: 0,
    seq: 0,
    hold: null,
    holdUsed: false,
    phase: "spawn",
    timer: 0,
    fallAcc: 0,
    grounded: false,
    lockT: 0,
    lockResets: 0,
    lowest: 0,
    touchedDown: false,
    soft: false,
    softCps: CFG.control.softCps,
    chain: 0,
    chainPower: 0,
    chainDanger: 0,
    chainIncoming: 0,
    garbageDone: false,
    incoming: 0,
    carry: 0,
    grng,
    stats: { pieces: 0, cleared: 0, garbageCleared: 0, chains: 0, maxCombo: 0, comboSum: 0, sent: 0, received: 0 },
  };
}

/** NEXT — i 번째 뒤 블록 (0 = 바로 다음). NEXT 개수보다 멀리는 못 본다 */
export function peek(f: Field, i: number): Pair {
  return pairAt(f.seed, f.seq + Math.min(i, CFG.preview - 1));
}

function spawnPair(f: Field, pair: Pair): void {
  const p: Piece = { c: SPAWN_COL, r: SPAWN_ROW, rot: 0, a: pair.a, b: pair.b };
  f.piece = p;
  f.pieceId++;
  f.fallAcc = 0;
  f.grounded = false;
  f.lockT = 0;
  f.lockResets = 0;
  f.lowest = p.r;
  f.touchedDown = false;
}

function die(f: Field, hooks: FieldHooks): void {
  f.phase = "dead";
  f.piece = null;
  hooks.onDead(f);
}

/* ── 조작 (플레이어 입력 · AI 가 똑같이 쓴다) ─────────────────────── */

/**
 * 움직였다 — 바닥에 닿은 적이 있으면 굳기를 미룬다(횟수 제한).
 * 벽 차기로 위로 떠도 횟수는 그대로라서, 제자리에서 계속 돌려도 결국 굳는다.
 */
function touched(f: Field): void {
  const p = f.piece;
  if (!p) return;
  f.grounded = !fits(f.board, p.c, p.r + 1, p.rot);
  if (!f.touchedDown) return;
  f.lockResets++;
  if (f.lockResets <= CFG.control.lockResets) f.lockT = 0;
}

/** 더 낮은 줄에 닿으면 미룰 수 있는 횟수를 되돌린다 */
function reached(f: Field, p: Piece): void {
  if (p.r > f.lowest) {
    f.lowest = p.r;
    f.lockResets = 0;
    f.touchedDown = false;
  }
}

export function moveX(f: Field, dx: -1 | 1): boolean {
  if (f.phase !== "active" || !f.piece) return false;
  if (!tryMove(f.board, f.piece, dx, 0)) return false;
  touched(f);
  return true;
}

export function rotate(f: Field, dir: 1 | -1): boolean {
  if (f.phase !== "active" || !f.piece) return false;
  if (!tryRotate(f.board, f.piece, dir)) return false;
  touched(f);
  return true;
}

export function hardDrop(f: Field, hooks: FieldHooks): boolean {
  if (f.phase !== "active" || !f.piece) return false;
  while (tryMove(f.board, f.piece, 0, 1));
  lock(f, hooks);
  return true;
}

/** HOLD — 한 블록에 한 번. 비어 있으면 다음 블록을 꺼낸다 */
export function holdPiece(f: Field): boolean {
  if (f.phase !== "active" || !f.piece || f.holdUsed) return false;
  const cur: Pair = { a: f.piece.a, b: f.piece.b };
  if (f.hold) {
    const h = f.hold;
    f.hold = cur;
    spawnPair(f, h);
  } else {
    f.hold = cur;
    spawnPair(f, pairAt(f.seed, f.seq++));
  }
  f.holdUsed = true;
  return true;
}

/** 굳을 때 보일 자리 (고스트) — out[0] = 축 칸, out[1] = 날개 칸 인덱스. 없으면 -1 */
export function ghostCells(f: Field, out: Int16Array): void {
  out[0] = -1;
  out[1] = -1;
  const p = f.piece;
  if (!p) return;
  const q = { ...p };
  while (tryMove(f.board, q, 0, 1));
  const cc = childC(q);
  const cr = childR(q);
  if (q.rot === 0 || q.rot === 2) {
    // 세로는 이미 서로 받치고 있다
    out[0] = q.r * COLS + q.c;
    out[1] = cr * COLS + cc;
    return;
  }
  // 가로는 굳으면 칸마다 따로 떨어진다
  out[0] = landRow(f.board, q.c, q.r) * COLS + q.c;
  out[1] = landRow(f.board, cc, cr) * COLS + cc;
}

function landRow(b: Board, c: number, r: number): number {
  while (r + 1 < ROWS && b[(r + 1) * COLS + c] === EMPTY) r++;
  return r;
}

/* ── 한 틱 ───────────────────────────────────────────────────── */

function lock(f: Field, hooks: FieldHooks): void {
  const p = f.piece;
  if (!p) return;
  writePiece(f.board, p);
  f.piece = null;
  f.stats.pieces++;
  f.chain = 0;
  f.chainPower = 0;
  f.garbageDone = false;
  applyGravity(f.board, f.drop);
  f.chainDanger = dangerOf(f.board);
  f.chainIncoming = f.incoming;
  f.phase = "settle";
  hooks.onLock(f);
}

function settled(f: Field): boolean {
  const d = f.drop;
  for (let i = 0; i < CELLS; i++) if (d[i] > 0) return false;
  return true;
}

/** 방해 블록을 떨어뜨린다 (§11, §12) — 한 번에 maxDropCells 까지, 꽉 찬 줄 먼저 + 나머지는 무작위 열 */
function dropGarbage(f: Field, hooks: FieldHooks): void {
  const n = Math.min(f.incoming, CFG.attack.maxDropCells);
  if (n <= 0) return;
  f.incoming -= n;
  const rows = Math.floor(n / COLS);
  const rem = n - rows * COLS;
  const extra = new Uint8Array(COLS);
  // 나머지 칸을 서로 다른 열에 (부분 셔플)
  const cols = Array.from({ length: COLS }, (_, i) => i);
  for (let k = 0; k < rem; k++) {
    const j = k + Math.floor(f.grng() * (COLS - k));
    const t = cols[k];
    cols[k] = cols[j];
    cols[j] = t;
    extra[cols[k]] = 1;
  }
  const b = f.board;
  for (let c = 0; c < COLS; c++) {
    const k = rows + extra[c];
    const h0 = colHeight(b, c);
    for (let j = 0; j < k; j++) {
      if (!stackOn(b, c, GARBAGE)) break;
      // 보드 위에서부터 한 덩어리로 쏟아지는 연출
      f.drop[(ROWS - 1 - (h0 + j)) * COLS + c] = CFG.anim.garbageLift + k;
    }
  }
  f.stats.received += n;
  f.garbageDone = true;
  hooks.onGarbage(f, n);
}

export function updateField(f: Field, dt: number, gravity: number, hooks: FieldHooks): void {
  switch (f.phase) {
    case "dead":
      return;

    case "reboot":
      f.timer -= dt;
      if (f.timer <= 0) {
        f.phase = "spawn";
        f.timer = 0;
      }
      return;

    case "spawn":
      f.timer -= dt;
      if (f.timer > 0) return;
      if (isDead(f.board)) return die(f, hooks);
      spawnPair(f, pairAt(f.seed, f.seq++));
      f.holdUsed = false;
      if (!f.piece || !fits(f.board, f.piece.c, f.piece.r, f.piece.rot)) return die(f, hooks);
      f.phase = "active";
      return;

    case "active": {
      const p = f.piece;
      if (!p) return;
      const cps = f.soft ? Math.max(f.softCps, gravity) : gravity;
      f.grounded = !fits(f.board, p.c, p.r + 1, p.rot);
      if (!f.grounded) {
        f.fallAcc += cps * dt;
        while (f.fallAcc >= 1) {
          if (!tryMove(f.board, p, 0, 1)) {
            f.fallAcc = 0;
            break;
          }
          f.fallAcc -= 1;
        }
        f.grounded = !fits(f.board, p.c, p.r + 1, p.rot);
        if (f.grounded) f.fallAcc = 0;
        reached(f, p);
      }
      if (f.grounded) {
        f.touchedDown = true;
        // 소프트 드롭 중이면 바닥에서 빨리 굳는다. 미룰 횟수를 다 썼으면 바로 굳는다
        f.lockT += f.soft ? dt * 4 : dt;
        if (f.lockT >= CFG.control.lockDelay || f.lockResets > CFG.control.lockResets) lock(f, hooks);
      }
      return;
    }

    case "clear":
      f.timer -= dt;
      if (f.timer > 0) return;
      removeMarked(f.board, f.s);
      f.flash.fill(0);
      applyGravity(f.board, f.drop);
      f.phase = "settle";
      return;

    case "settle": {
      const d = f.drop;
      const v = CFG.anim.settleCps * dt;
      for (let i = 0; i < CELLS; i++) if (d[i] > 0) d[i] = Math.max(0, d[i] - v);
      if (!settled(f)) return;

      if (!f.garbageDone && markGroups(f.board, f.s, f.step)) {
        f.chain++;
        f.chainPower += stepPower(f.chain, f.step.cells);
        f.flash.set(f.s.mark);
        hooks.onStep(f, f.chain, f.step);
        f.stats.cleared += f.step.cells;
        f.stats.garbageCleared += f.step.garbage;
        f.phase = "clear";
        f.timer = CFG.anim.clear;
        return;
      }
      if (f.chain > 0) {
        const chain = f.chain;
        f.stats.chains++;
        f.stats.comboSum += chain;
        if (chain > f.stats.maxCombo) f.stats.maxCombo = chain;
        hooks.onChainEnd(f, chain, f.chainPower);
        f.chain = 0;
        f.chainPower = 0;
      }
      // 연쇄가 끝났는데 받을 게 남아 있으면 이제 떨어진다 (한 차례에 한 번)
      if (!f.garbageDone && f.incoming > 0) {
        dropGarbage(f, hooks);
        return; // 떨어지는 연출이 끝나면 다시 여기로 와서 spawn 으로 간다
      }
      f.phase = "spawn";
      f.timer = CFG.anim.spawnDelay;
      return;
    }
  }
}

/** AI KO — 필드를 비우고 잠시 뒤 다시 시작한다 (§ 무한 진행) */
export function rebootField(f: Field, sec: number): void {
  f.board.fill(EMPTY);
  f.drop.fill(0);
  f.flash.fill(0);
  f.piece = null;
  f.incoming = 0;
  f.carry = 0;
  f.chain = 0;
  f.chainPower = 0;
  f.hold = null;
  f.holdUsed = false;
  f.phase = "reboot";
  f.timer = sec;
}
