// 🧩 아울리스 — AIManager (§21~§23, §45, §46)
//
//   Observe → Generate Actions → Score Actions → Select → Execute
//
// · 보는 것: 자기 보드 · 지금 블록 · NEXT(CFG.preview 개) · 자기에게 올 방해 블록 수 · 상대 필드 위험도.
//   전부 플레이어 화면에도 보이는 정보다. 플레이어의 NEXT·입력·난수 시드는 보지 않는다 (§46).
// · 강해지는 방법은 "더 많이 따져 보고(candidates·lookahead) · 연쇄를 설계하고(potential·fireChain)
//   · 실수를 덜 하고(mistake) · 빨리 움직이는(think·move·drop)" 것뿐이다.
// · 계산은 한 틱에 `evalsPerTick` 개씩 나눠서 한다 — 모바일에서 한 프레임에 몰려 끊기지 않게.

import { mulberry32 } from "@/games/core/canvas";
import { CFG } from "../config";
import {
  CELLS,
  COLS,
  EMPTY,
  ROWS,
  SPAWN_COL,
  colHeight,
  dangerOf,
  isDead,
  newScratch,
  resolve,
  stackOn,
  type Board,
  type ChainResult,
  type Scratch,
} from "./board";
import { aiParams, type AIParams } from "./difficulty";
import { hardDrop, moveX, peek, rotate, type Field, type FieldHooks } from "./field";
import { applyPlacement, placements, type Pair, type Placement } from "./piece";

/** 후보 하나 — first = 1수 점수, fire = 1수로 터뜨린 가치, total = 최종 점수 (2수면 다음 블록까지) */
type Cand = { pl: Placement; first: number; fire: number; total: number; dead: boolean };

export type Brain = {
  rng: () => number;
  p: AIParams;
  /** 지금 생각 중인 블록 (field.pieceId) */
  pieceId: number;
  /** 탐색 상태 */
  stage: "idle" | "first" | "second" | "done";
  cands: Cand[];
  i: number;
  /** 2수 탐색: 지금 보고 있는 후보(beam) 번호 · 다음 블록 자리 목록 · 그 안의 번호 */
  bi: number;
  second: Placement[];
  si: number;
  plan: Placement | null;
  thinkT: number;
  moveT: number;
  /** 이 블록에 쓴 동작 수 · 회전이 막혀서 옆으로 먼저 옮길지 */
  acts: number;
  moveFirst: boolean;
  /** 작업 보드 (2수까지) + 잠재력 계산용 */
  b1: Board;
  b2: Board;
  b3: Board;
  s: Scratch;
  res: ChainResult;
  tmp: Placement[];
  /** 관측 (§23) — 탐색 시작 때 한 번 찍는다 */
  obs: { danger: number; incoming: number; oppDanger: number };
  /** 탐색을 시작할 때의 내부 난이도 */
  d: number;
};

export function newBrain(seed: number): Brain {
  return {
    rng: mulberry32(seed ^ 0x5eed0a1),
    p: aiParams(1),
    pieceId: -1,
    stage: "idle",
    cands: [],
    i: 0,
    bi: 0,
    second: [],
    si: 0,
    plan: null,
    thinkT: 0,
    moveT: 0,
    acts: 0,
    moveFirst: false,
    b1: new Uint8Array(CELLS),
    b2: new Uint8Array(CELLS),
    b3: new Uint8Array(CELLS),
    s: newScratch(),
    res: { chain: 0, power: 0, cells: 0, garbage: 0 },
    tmp: [],
    obs: { danger: 0, incoming: 0, oppDanger: 0 },
    d: 1,
  };
}

/* ── 평가 (§21) ──────────────────────────────────────────────── */

const W = {
  dead: -1e6,
  /** 터뜨릴 때: 공격력 · 연쇄 */
  firePower: 60,
  fireChain: 40,
  /** 아직 쌓을 때인데 터뜨려 버리면 */
  waste: 45,
  wastePower: 10,
  /** 모양 */
  height2: 0.6,
  spawnHeight2: 1.6,
  spawnDanger: 400,
  bump: 4,
  pair: 7,
  garbage: 2,
  /** 잠재 연쇄 (potential 가중치 × chain²) */
  potential: 26,
};

/** 한 수 뒤 몇 연쇄까지 나올 수 있는가 — 열마다 색마다 두 칸을 얹어 본다 (연쇄 설계 §21) */
function potentialChain(b: Board, br: Brain): number {
  let best = 0;
  for (let c = 0; c < COLS; c++) {
    if (colHeight(b, c) >= ROWS - 3) continue;
    for (let color = 1; color <= 4; color++) {
      br.b3.set(b);
      stackOn(br.b3, c, color);
      stackOn(br.b3, c, color);
      const r = resolve(br.b3, br.s, br.res).chain;
      if (r > best) best = r;
    }
  }
  return best;
}

/** 모양 점수 (높을수록 좋다) */
function shape(b: Board, br: Brain): number {
  if (isDead(b)) return W.dead;
  let v = 0;
  let prev = -1;
  for (let c = 0; c < COLS; c++) {
    const h = colHeight(b, c);
    v -= h * h * W.height2;
    if (c === SPAWN_COL) {
      v -= h * h * W.spawnHeight2;
      if (h >= ROWS - 3) v -= W.spawnDanger;
    }
    if (prev >= 0) v -= Math.abs(h - prev) * W.bump;
    prev = h;
  }
  // 같은 색끼리 붙어 있는 쌍 (다음 연쇄의 재료)
  for (let i = 0; i < CELLS; i++) {
    const x = b[i];
    if (x === EMPTY) continue;
    if (x === 5) {
      v -= W.garbage;
      continue;
    }
    if (i % COLS < COLS - 1 && b[i + 1] === x) v += W.pair;
    if (i + COLS < CELLS && b[i + COLS] === x) v += W.pair;
  }
  if (br.p.potential > 0) {
    const k = potentialChain(b, br);
    v += br.p.potential * W.potential * k * k;
  }
  return v;
}

/** 터뜨린 결과의 가치 — 쌓을 때인지 칠 때인지 판단한다 (§21 공격 가능성 · 위험도) */
function fireValue(r: ChainResult, br: Brain): number {
  if (r.chain === 0) return 0;
  const p = br.p;
  const o = br.obs;
  const panic = o.danger >= CFG.ai.panicDanger || o.incoming >= CFG.ai.panicIncoming;
  // 상대가 위험할 때 바로 친다 — 상대 필드는 플레이어도 보는 공개 정보다
  const strike = br.d >= CFG.ai.strikeFrom && o.oppDanger >= CFG.ai.strikeDanger && r.chain >= 2;
  if (r.chain >= p.fireChain || panic || strike) {
    // 받을 게 있으면 상쇄 가치까지
    const offset = Math.min(o.incoming, r.power) * 0.5;
    return (r.power + offset) * W.firePower + r.chain * W.fireChain;
  }
  return -(W.waste + r.power * W.wastePower);
}

/** 자리 하나를 두고 굴린 뒤의 점수. 보드 `into` 에 결과가 남는다 */
function scorePlacement(base: Board, pair: Pair, pl: Placement, into: Board, br: Brain): number {
  into.set(base);
  if (!applyPlacement(into, pair, pl)) return W.dead;
  const r = resolve(into, br.s, br.res);
  const fire = fireValue(r, br);
  return fire + shape(into, br);
}

/* ── 탐색 (여러 틱에 나눠서) ─────────────────────────────────── */

function startSearch(br: Brain, f: Field, opp: Field, d: number): void {
  aiParams(d, br.p);
  br.d = d;
  br.obs.danger = dangerOf(f.board);
  br.obs.incoming = f.incoming;
  br.obs.oppDanger = dangerOf(opp.board);
  const piece = f.piece;
  br.cands.length = 0;
  br.plan = null;
  br.i = 0;
  br.bi = 0;
  br.si = 0;
  br.stage = "first";
  if (!piece) return;
  const all = placements(f.board, { a: piece.a, b: piece.b }, SPAWN_COL, br.tmp);
  // 고려하는 배치 수 (§22) — 전부가 아니면 무작위로 몇 개만 본다
  const n = Math.min(all.length, br.p.candidates);
  for (let k = 0; k < n; k++) {
    const j = k + Math.floor(br.rng() * (all.length - k));
    const t = all[k];
    all[k] = all[j];
    all[j] = t;
    br.cands.push({ pl: { ...all[k] }, first: 0, fire: 0, total: 0, dead: false });
  }
}

function stepSearch(br: Brain, f: Field): void {
  const piece = f.piece;
  if (!piece) {
    br.stage = "done";
    return;
  }
  const pair: Pair = { a: piece.a, b: piece.b };
  let budget = br.p.evalsPerTick;

  while (budget > 0 && br.stage !== "done") {
    if (br.stage === "first") {
      if (br.i >= br.cands.length) {
        if (br.p.lookahead && br.cands.length > 1) {
          br.cands.sort((x, y) => y.first - x.first);
          br.stage = "second";
          br.bi = 0;
          br.si = -1;
        } else {
          for (const c of br.cands) c.total = c.first;
          br.stage = "done";
        }
        continue;
      }
      const c = br.cands[br.i++];
      c.first = scorePlacement(f.board, pair, c.pl, br.b1, br);
      c.dead = c.first <= W.dead / 2;
      budget--;
      continue;
    }

    // second: 상위 beam 개 후보마다 다음 블록(NEXT 1)의 모든 자리를 본다
    const beam = Math.min(br.p.beam, br.cands.length);
    if (br.bi >= beam) {
      for (let k = beam; k < br.cands.length; k++) br.cands[k].total = br.cands[k].first - 1e5;
      br.stage = "done";
      continue;
    }
    const c = br.cands[br.bi];
    if (br.si < 0) {
      // 이 후보의 1수 결과 보드를 만든다
      br.b1.set(f.board);
      if (c.dead || !applyPlacement(br.b1, pair, c.pl)) {
        c.total = c.first;
        br.bi++;
        continue;
      }
      const r = resolve(br.b1, br.s, br.res);
      c.total = -Infinity;
      c.fire = fireValue(r, br);
      placements(br.b1, peek(f, 0), SPAWN_COL, br.second);
      br.si = 0;
      if (br.second.length === 0) {
        c.total = c.first;
        br.bi++;
        br.si = -1;
      }
      budget--;
      continue;
    }
    if (br.si >= br.second.length) {
      br.bi++;
      br.si = -1;
      continue;
    }
    const v = scorePlacement(br.b1, peek(f, 0), br.second[br.si++], br.b2, br);
    const t = c.fire + 0.9 * v;
    if (t > c.total) c.total = t;
    budget--;
  }

  if (br.stage === "done") choose(br, piece.c, piece.rot);
}

/** 최종 선택 — 가끔 최선이 아닌 수를 둔다 (§15 실수) */
function choose(br: Brain, c0: number, r0: number): void {
  const list = br.cands;
  if (list.length === 0) {
    br.plan = { col: c0, rot: r0 };
    return;
  }
  list.sort((x, y) => y.total - x.total);
  let pick = list[0];
  if (br.rng() < br.p.mistake) {
    const alive = list.filter((c) => !c.dead);
    if (alive.length > 1) pick = alive[1 + Math.floor(br.rng() * (alive.length - 1))];
  }
  br.plan = { col: pick.pl.col, rot: pick.pl.rot };
}

/* ── 실행 (§45 Execute) ─────────────────────────────────────── */

/** 블록 하나에 쓰는 동작 상한 — 넘으면 그 자리에 내린다 */
const MAX_ACTS = 10;

/**
 * AI 한 틱: 새 블록이면 관측·탐색을 시작하고, 생각할 시간이 지나면 한 동작씩 옮긴다.
 * 입력은 플레이어와 똑같은 함수(moveX·rotate·hardDrop·soft)만 쓴다.
 */
export function updateBrain(br: Brain, f: Field, opp: Field, d: number, dt: number, hooks: FieldHooks): void {
  if (f.phase !== "active" || !f.piece) {
    f.soft = false;
    return;
  }
  if (br.pieceId !== f.pieceId) {
    br.pieceId = f.pieceId;
    startSearch(br, f, opp, d);
    br.thinkT = br.p.thinkSec;
    br.moveT = 0;
    br.acts = 0;
    br.moveFirst = false;
    f.softCps = Number.isFinite(br.p.dropCps) ? br.p.dropCps : f.softCps;
    f.soft = false;
  }
  if (br.stage !== "done") stepSearch(br, f);
  br.thinkT -= dt;
  if (br.thinkT > 0 || !br.plan) return;

  br.moveT -= dt;
  if (br.moveT > 0) return;
  br.moveT = br.p.moveSec;

  const p = f.piece;
  const plan = br.plan;
  // 너무 오래 걸리면 그 자리에서 내린다 (블록이 이미 많이 내려와 길이 막힌 경우)
  if (++br.acts > MAX_ACTS) {
    plan.rot = p.rot;
    plan.col = p.c;
  }
  const wantRot = p.rot !== plan.rot;
  const wantCol = p.c !== plan.col;
  if (wantRot && !(br.moveFirst && wantCol)) {
    const diff = (plan.rot - p.rot + 4) % 4;
    const dir = diff === 3 ? -1 : 1;
    const expect = (p.rot + dir + 4) % 4;
    const ok = rotate(f, dir);
    // 원하는 방향으로 못 돌았다(막힘·반 바퀴) → 옆으로 먼저 옮겨 보고, 그래도 안 되면 포기
    if (!ok || p.rot !== expect) {
      if (br.moveFirst || !wantCol) plan.rot = p.rot;
      br.moveFirst = true;
    }
    return;
  }
  if (wantCol) {
    if (!moveX(f, p.c < plan.col ? 1 : -1)) plan.col = p.c; // 막히면 포기
    return;
  }
  if (!Number.isFinite(br.p.dropCps)) hardDrop(f, hooks);
  else f.soft = true;
}
