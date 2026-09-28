// 🧩 아울리스 — 렌더 (VFXManager / 캔버스 쪽 UIManager) · 네온 (DECISIONS §5-21)
//
// 화면 배치는 뿌요뿌요 온라인 대전 화면을 따른다 (§4, 모바일 우선 · DECISIONS "아울리스 UI 개편"):
//   · 필드마다 위 = 받을 방해 블록 아이콘 줄, 아래 = 이름 + 점수(AI 는 LEVEL) 줄
//   · 가로(PC·태블릿): [내 필드] [가운데: 내 NEXT | AI NEXT · HOLD · TIME · AI 부엉이 · 게이지] [AI 필드] — 두 필드 같은 크기
//   · 세로(폰): [내 필드(크게)] [오른쪽 레일: TIME · NEXT · HOLD · AI 미니 필드 · 게이지] + 아래 터치 패드 (필드를 가리지 않는다)
// 그림 파일 없이 전부 코드로 그린다 — 처음 버전의 네온: 어두운 몸통 + 밝은 네온 선 + 강한 발광.
//   필드·NEXT·HOLD = 네온관 테두리(색 발광 + 흰 심지), 배경 = 흐르는 격자,
//   블록 = 부엉이 블록(귀 · 색별 도형 눈 · 부리), AI = 네온 선 부엉이 (+ 천천히 도는 무지개 링).
// 블록은 크기·색마다 한 번만 그려 둔 스프라이트를 찍는다 — 셀마다 shadowBlur 를 쓰지 않는다.
// 엔진 상태는 읽기만 한다. 파티클·팝업·빔 같은 연출 상태는 여기(Renderer)에만 있다.

import { font, roundRect } from "@/games/core/canvas";
import { CFG } from "../config";
import { CELLS, COLS, GARBAGE, HIDDEN, SPAWN_COL, dangerOf } from "./board";
import { ghostCells, peek, type Field } from "./field";
import { childC, childR } from "./piece";
import type { Game } from "./game";
import { levelLabel } from "./difficulty";
import { rawScore } from "./score";
import { GLYPH, GRAD, OWLIS, aiTone, type Glyph } from "../theme";

const VIS = CFG.field.rows;

export type Labels = {
  next: string;
  hold: string;
  attack: string;
  fever: string;
  feverOn: string;
  you: string;
  aiLevel: string;
  time: string;
  /** 연쇄 팝업 ("3연쇄!") */
  chain: (n: number) => string;
  reboot: string;
};

type Rect = { x: number; y: number; cell: number };
/** 필드 아래 이름 + 점수 줄 — y 는 글자 기준선, w 는 필드 너비 */
type Info = { x: number; y: number; w: number; size: number };
export type Layout = {
  portrait: boolean;
  pf: Rect;
  af: Rect;
  /** 내 NEXT · NEXT-NEXT */
  next: Rect[];
  /** AI 의 NEXT · NEXT-NEXT (가로만 — 세로는 null) */
  aiNext: Rect[] | null;
  /** HOLD 한 쌍의 왼쪽 위 (가로로 눕혀 그린다) */
  hold: Rect;
  gauge: { x: number; y: number; w: number };
  /** AI 부엉이 (§40) — size 0 이면 그리지 않는다. x·y 는 중심 */
  avatar: { x: number; y: number; size: number };
  /** TIME — x 는 가운데, y 는 맨 위 */
  time: { x: number; y: number };
  pInfo: Info;
  aInfo: Info;
  labelSize: number;
};

/** 화면 가장자리에서 비워 둘 곳 (위 · 아래 터치 패드 · 좌우 터치 패드) */
export type Insets = { top: number; bottom: number; left: number; right: number };

/** 필드 네온 테두리 두께 */
function framePad(s: number): number {
  return Math.max(5, Math.round(s * 0.16));
}
/** 받을 방해 블록 아이콘 크기 */
function garbageIcon(s: number): number {
  return Math.max(10, Math.round(s * 0.56));
}
/** 필드 아래 점수 글자 크기 */
function infoSize(s: number): number {
  return Math.max(13, Math.round(s * 0.62));
}
/** 필드 위(방해 블록 줄) · 아래(점수 줄) 까지 친 필드 한 벌의 높이 */
function aboveH(s: number): number {
  return framePad(s) + 6 + garbageIcon(s);
}
function belowH(s: number): number {
  return framePad(s) + 8 + infoSize(s) + 4;
}
function stackH(s: number): number {
  return aboveH(s) + s * VIS + belowH(s);
}
/** TIME 두 줄(이름 + 시계) 높이 */
function timeH(ls: number): number {
  return Math.round(ls * 2.7 + 10);
}
/** 게이지 두 줄(이름 + 막대)이 차지하는 높이 (drawGauges 와 맞춘다) */
function gaugeHeight(ls: number): number {
  const bh = Math.max(6, ls * 0.7);
  return 2 * (5 + bh + ls + 8);
}

/**
 * NEXT 상자 안 두 칸 — 뿌요뿌요처럼 NEXT(크게)는 필드 쪽, NEXT-NEXT(작게)는 한 칸쯤 아래로 비껴 놓는다.
 * `x` 는 상자 왼쪽, `mirror` 면 NEXT 가 오른쪽(AI 필드 쪽).
 */
function nextSlots(x: number, y: number, nc: number, mirror: boolean): { slots: Rect[]; w: number; h: number } {
  const n2 = Math.max(MIN_CELL, Math.round(nc * 0.72));
  const w = 8 + nc + 6 + n2 + 8;
  const h = 16 + Math.max(nc * 2, Math.round(nc * 0.9) + n2 * 2);
  const a = mirror ? x + w - 8 - nc : x + 8;
  const b = mirror ? x + 8 : x + 8 + nc + 6;
  return {
    slots: [
      { x: a, y: y + 8, cell: nc },
      { x: b, y: y + 8 + Math.round(nc * 0.9), cell: n2 },
    ],
    w,
    h,
  };
}
/** 폭 `room` 안에 들어가는 NEXT 칸 크기 */
function fitNext(room: number, want: number): number {
  return Math.max(MIN_CELL, Math.min(want, Math.floor((room - 22) / 1.72)));
}

function infoOf(L: Rect): Info {
  const size = infoSize(L.cell);
  return { x: L.x, y: L.y + L.cell * VIS + framePad(L.cell) + 8 + size, w: L.cell * COLS, size };
}

/** 화면 크기 → 배치 */
export function layout(w: number, h: number, inset: Insets): Layout {
  const availH = Math.max(160, h - inset.top - inset.bottom);
  const availW = Math.max(160, w - inset.left - inset.right);
  const portrait = h > w * 1.05;

  if (portrait) {
    // 내 필드가 화면을 차지하고, 오른쪽 좁은 레일에 NEXT · AI 미니 필드
    const railW = Math.min(170, Math.max(96, Math.round(availW * 0.3)));
    let cell = Math.floor(Math.min((availW - railW - 24) / (COLS + 0.4), (availH - 26) / 13.5));
    while (cell > MIN_CELL && stackH(cell) > availH - 8) cell--;
    const pad = framePad(cell);
    const pw = cell * COLS;
    const H = cell * VIS;
    const px = inset.left + Math.max(pad + 4, Math.round((availW - railW - 8 - pw) / 2));
    const top = inset.top + Math.round((availH - stackH(cell)) / 2);
    const py = top + aboveH(cell);
    const rx = px + pw + pad + 10;
    const rw = w - inset.right - rx - 6;
    const bottom = py + H + belowH(cell);
    const ls = 11;
    const mid = rx + rw / 2;

    let y = top;
    const time = { x: mid, y };
    y += timeH(ls) + 4;

    const nc = fitNext(rw, Math.round(cell * 0.8));
    const nb = nextSlots(0, 0, nc, false);
    const nx = rx + Math.round((rw - nb.w) / 2);
    const next = nextSlots(nx, y + ls + 5, nc, false);
    y += ls + 5 + next.h + 10;

    // HOLD — 이름 + 눕힌 한 쌍 한 줄 (뿌요뿌요에 없는 규칙이라 작게)
    const hc = Math.max(MIN_CELL, Math.round(nc * 0.5));
    const hold = { x: rx + rw - 7 - hc * 2, y: y + 7, cell: hc };
    y += hc + 14 + 12;

    // 게이지는 레일 맨 아래 (내 필드 바닥 줄에 맞춘다)
    const gTop = bottom - gaugeHeight(ls);
    const gauge = { x: rx + 2, y: gTop + ls, w: rw - 4 };

    // AI 미니 필드 — 남은 높이에 맞춘다
    const room = gTop - 8 - y;
    let ac = Math.max(MIN_CELL, Math.floor(Math.min((rw - 12) / COLS, cell * 0.62)));
    while (ac > MIN_CELL && stackH(ac) > room) ac--;
    const af = { x: rx + Math.round((rw - ac * COLS) / 2), y: y + aboveH(ac), cell: ac };
    const aEnd = y + stackH(ac);
    const left = gTop - 8 - aEnd;
    const size = left >= 40 ? Math.min(rw * 0.6, left - 4) : 0;

    const pf = { x: px, y: py, cell };
    return {
      portrait,
      pf,
      af,
      next: next.slots,
      aiNext: null,
      hold,
      gauge,
      avatar: { x: mid, y: aEnd + left / 2 + 2, size },
      time,
      pInfo: infoOf(pf),
      aInfo: infoOf(af),
      labelSize: ls,
    };
  }

  // 가로 — [내 필드] [가운데 칸] [AI 필드], 두 필드 같은 크기
  const midC = 5.6;
  const gapC = 0.45;
  let cell = Math.floor(Math.min((availW - 16) / (COLS * 2 + midC + gapC * 2 + 0.7), (availH - 26) / 13.5));
  while (cell > MIN_CELL && stackH(cell) > availH - 8) cell--;
  const pad = framePad(cell);
  const pw = cell * COLS;
  const H = cell * VIS;
  const mid = Math.round(cell * midC);
  const gap = Math.round(cell * gapC);
  const total = pad * 4 + pw * 2 + gap * 2 + mid;
  const x0 = inset.left + Math.round((availW - total) / 2);
  const px = x0 + pad;
  const mx = px + pw + pad + gap;
  const ax = mx + mid + gap + pad;
  const top = inset.top + Math.round((availH - stackH(cell)) / 2);
  const py = top + aboveH(cell);
  const ls = Math.max(11, Math.round(cell * 0.34));
  const cx = mx + mid / 2;

  // NEXT — 내 것은 내 필드 쪽, AI 것은 AI 필드 쪽 (가운데 칸을 반씩)
  let y = py - pad;
  const nc = fitNext(mid / 2 - 4, Math.round(cell * 0.86));
  const pn = nextSlots(mx, y + ls + 5, nc, false);
  const an = nextSlots(mx + mid - pn.w, y + ls + 5, nc, true);
  y += ls + 5 + pn.h + 12;

  const hc = Math.max(MIN_CELL, Math.round(nc * 0.55));
  const hold = { x: mx + pn.w - 7 - hc * 2, y: y + 7, cell: hc };
  y += hc + 14 + 14;

  const time = { x: cx, y };
  y += timeH(ls) + 8;

  const gTop = py + H + pad - gaugeHeight(ls);
  const gauge = { x: mx, y: gTop + ls, w: mid };
  const room = gTop - 10 - y;
  const size = room >= 40 ? Math.min(mid * 0.78, room) : 0;

  const pf = { x: px, y: py, cell };
  const af = { x: ax, y: py, cell };
  return {
    portrait,
    pf,
    af,
    next: pn.slots,
    aiNext: an.slots,
    hold,
    gauge,
    avatar: { x: cx, y: y + room / 2, size },
    time,
    pInfo: infoOf(pf),
    aInfo: infoOf(af),
    labelSize: ls,
  };
}

/* ── 네온 ────────────────────────────────────────────────────── */

/** 대각선 그라데이션 (두 색 또는 세 색) */
function diag(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a: string, b: string, c?: string): CanvasGradient {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, a);
  if (c) {
    g.addColorStop(0.5, b);
    g.addColorStop(1, c);
  } else g.addColorStop(1, b);
  return g;
}

/**
 * 네온관 테두리 — 어두운 판 + 색으로 번지는 선 + 가운데 흰 심지.
 * 실제 네온사인처럼 "가운데는 하얗고 바깥으로 색이 번지는" 두 겹이라 얇아도 또렷하다.
 */
function neonFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
  glow = 16,
  fill: string | null = OWLIS.panel,
): void {
  if (fill) {
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  roundRect(ctx, x, y, w, h, r);
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
  roundRect(ctx, x, y, w, h, r);
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.stroke();
}

/** 알약 게이지 — 트랙 + 그라데이션 채움 + 발광 + 윗면 광택 */
function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, v: number, a: string, b: string, glow: number): void {
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.stroke();
  if (v <= 0) return;
  const fw = Math.max(h, w * Math.min(1, v));
  ctx.save();
  ctx.shadowColor = b;
  ctx.shadowBlur = glow;
  roundRect(ctx, x, y, fw, h, h / 2);
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  roundRect(ctx, x + 1, y + 1, Math.max(0, fw - 2), h * 0.42, h / 3);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fill();
}

/* ── 블록 스프라이트 ─────────────────────────────────────────── */

type Sprite = { img: HTMLCanvasElement; pad: number };

function glyphPath(ctx: CanvasRenderingContext2D, g: Glyph, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  if (g === "diamond") {
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
  } else if (g === "circle") {
    ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
  } else if (g === "triangle") {
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.95, cy + r * 0.75);
    ctx.lineTo(cx - r * 0.95, cy + r * 0.75);
    ctx.closePath();
  } else if (g === "star") {
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 === 0 ? r : r * 0.45;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
}

/** 스프라이트로 만들 수 있는 가장 작은 칸 (더 작으면 모서리 반지름이 음수가 된다) */
const MIN_CELL = 8;

/**
 * 아울 블록 한 칸 (§6) — 처음 버전의 네온: 어두운 몸통 + 색 네온 테두리(발광) + 귀 두 개
 * + 눈(색별 도형 ◆●▲★, 흰 선) + 부리. 도형 덕분에 색만으로 구분하지 않는다.
 */
function makeBlock(v: number, size0: number): Sprite {
  const s = Math.max(MIN_CELL, size0);
  const pad = Math.ceil(s * 0.35);
  const c = document.createElement("canvas");
  const size = s + pad * 2;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.ceil(size * dpr);
  c.height = Math.ceil(size * dpr);
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const x = pad + 1;
  const y = pad + 1;
  const w = s - 2;
  const r = s * 0.24;

  if (v === GARBAGE) {
    roundRect(ctx, x, y, w, w, r * 0.7);
    ctx.fillStyle = OWLIS.garbageDeep;
    ctx.fill();
    ctx.lineWidth = Math.max(1, s * 0.07);
    ctx.strokeStyle = OWLIS.garbage;
    ctx.stroke();
    // 네온 균열 ╳
    ctx.save();
    ctx.shadowColor = OWLIS.garbageCrack;
    ctx.shadowBlur = s * 0.25;
    ctx.strokeStyle = `${OWLIS.garbageCrack}aa`;
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.2, y + w * 0.22);
    ctx.lineTo(x + w * 0.45, y + w * 0.5);
    ctx.lineTo(x + w * 0.8, y + w * 0.78);
    ctx.moveTo(x + w * 0.78, y + w * 0.2);
    ctx.lineTo(x + w * 0.55, y + w * 0.45);
    ctx.lineTo(x + w * 0.22, y + w * 0.8);
    ctx.stroke();
    ctx.restore();
    glyphPath(ctx, "diamond", x + w / 2, y + w / 2, w * 0.13);
    ctx.fillStyle = "#6b7394";
    ctx.fill();
    return { img: c, pad };
  }

  const col = OWLIS.block[v];
  const deep = OWLIS.blockDeep[v];
  // 몸 — 위쪽만 살짝 색이 비치는 어두운 몸통 + 네온 테두리
  const grad = ctx.createLinearGradient(x, y, x, y + w);
  grad.addColorStop(0, `${col}66`);
  grad.addColorStop(0.45, deep);
  grad.addColorStop(1, deep);
  ctx.save();
  ctx.shadowColor = col;
  ctx.shadowBlur = s * 0.34;
  roundRect(ctx, x, y, w, w, r);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = Math.max(1.2, s * 0.08);
  ctx.strokeStyle = col;
  ctx.stroke();
  ctx.restore();
  // 네온관 심지
  roundRect(ctx, x, y, w, w, r);
  ctx.lineWidth = Math.max(0.6, s * 0.025);
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.stroke();
  // 귀
  if (s >= 14) {
    ctx.fillStyle = col;
    const e = w * 0.2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.16, y + 1);
    ctx.lineTo(x + w * 0.16 + e, y + 1);
    ctx.lineTo(x + w * 0.16, y - e * 0.55);
    ctx.closePath();
    ctx.moveTo(x + w * 0.84, y + 1);
    ctx.lineTo(x + w * 0.84 - e, y + 1);
    ctx.lineTo(x + w * 0.84, y - e * 0.55);
    ctx.closePath();
    ctx.fill();
  }
  // 눈 (색별 도형)
  glyphPath(ctx, GLYPH[v], x + w / 2, y + w * 0.47, w * 0.26);
  ctx.fillStyle = `${col}55`;
  ctx.fill();
  ctx.lineWidth = Math.max(1, s * 0.07);
  ctx.strokeStyle = "#ffffffdd";
  ctx.stroke();
  // 부리
  if (s >= 16) {
    ctx.fillStyle = "#ffffffaa";
    ctx.beginPath();
    ctx.moveTo(x + w * 0.44, y + w * 0.8);
    ctx.lineTo(x + w * 0.56, y + w * 0.8);
    ctx.lineTo(x + w * 0.5, y + w * 0.9);
    ctx.closePath();
    ctx.fill();
  }
  return { img: c, pad };
}

/* ── 연출 상태 ────────────────────────────────────────────────── */

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string };
/** 글자 팝업 — x0·x1 = 글자가 벗어나지 않을 가로 범위(필드 안), big = 연쇄 팝업(외곽선 + 튀어나오는 크기) */
type Popup = { x: number; y: number; x0: number; x1: number; text: string; color: string; life: number; max: number; size: number; big: boolean };
type Beam = { x0: number; y0: number; x1: number; y1: number; t: number; color: string; big: boolean };

const MAX_PARTICLES = 360;

export type Renderer = {
  sprites: Map<string, Sprite>;
  parts: Particle[];
  popups: Popup[];
  beams: Beam[];
  shake: number;
  ko: number;
  ghost: Int16Array;
  t: number;
};

export function createRenderer(): Renderer {
  return {
    sprites: new Map(),
    parts: [],
    popups: [],
    beams: [],
    shake: 0,
    ko: 0,
    ghost: new Int16Array(2),
    t: 0,
  };
}

function sprite(R: Renderer, v: number, s: number): Sprite {
  const key = `${v}:${s}`;
  let sp = R.sprites.get(key);
  if (!sp) {
    sp = makeBlock(v, s);
    R.sprites.set(key, sp);
  }
  return sp;
}

function drawCell(ctx: CanvasRenderingContext2D, R: Renderer, v: number, x: number, y: number, s: number): void {
  const sp = sprite(R, v, s);
  const size = s + sp.pad * 2;
  ctx.drawImage(sp.img, x - sp.pad, y - sp.pad, size, size);
}

function burst(R: Renderer, x: number, y: number, color: string, n: number, speed: number): void {
  for (let k = 0; k < n; k++) {
    if (R.parts.length >= MAX_PARTICLES) R.parts.shift();
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.8);
    const life = 0.35 + Math.random() * 0.35;
    R.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life, max: life, color });
  }
}

/* ── 필드 ────────────────────────────────────────────────────── */

/** 필드 네온 색 — 나: 시안 / AI: LEVEL 색 (보라 → 자홍 → 빨강) */
function fieldColor(side: 0 | 1, d: number): string {
  return side === 0 ? OWLIS.player : aiTone(d).line;
}

function drawField(ctx: CanvasRenderingContext2D, R: Renderer, g: Game, f: Field, L: Rect, labels: Labels): void {
  const s = L.cell;
  const W = s * COLS;
  const H = s * VIS;
  const color = fieldColor(f.side, g.diff.peak);
  const danger = dangerOf(f.board);
  const crit = danger >= CFG.danger.critical;
  const pad = Math.max(5, s * 0.16);
  const rad = Math.min(22, s * 0.6);
  const feverGlow = f.side === 0 && g.fever.t > 0;

  // 판 — 네온관 테두리 (위험하면 빨강, 피버면 더 세게)
  neonFrame(ctx, L.x - pad, L.y - pad, W + pad * 2, H + pad * 2, rad, crit ? OWLIS.danger : color, crit ? 22 : feverGlow ? 30 : 16);

  // 격자
  ctx.strokeStyle = OWLIS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < COLS; c++) {
    ctx.moveTo(L.x + c * s + 0.5, L.y);
    ctx.lineTo(L.x + c * s + 0.5, L.y + H);
  }
  for (let r = 1; r < VIS; r++) {
    ctx.moveTo(L.x, L.y + r * s + 0.5);
    ctx.lineTo(L.x + W, L.y + r * s + 0.5);
  }
  ctx.stroke();

  // 위험도 (§27) — 윗부분이 붉게 달아오른다
  if (danger >= CFG.danger.warning) {
    const a = Math.min(0.45, (danger - CFG.danger.warning) * 0.8) * (0.75 + 0.25 * Math.sin(R.t * (crit ? 14 : 6)));
    const gr = ctx.createLinearGradient(0, L.y, 0, L.y + H * 0.5);
    gr.addColorStop(0, `rgba(255,70,110,${a})`);
    gr.addColorStop(1, "rgba(255,70,110,0)");
    ctx.save();
    roundRect(ctx, L.x - pad, L.y - pad, W + pad * 2, H * 0.5, rad);
    ctx.clip();
    ctx.fillStyle = gr;
    ctx.fillRect(L.x - pad, L.y - pad, W + pad * 2, H * 0.5);
    ctx.restore();
  }

  // 여기가 막히면 끝 — 생성 칸 ✕
  {
    const cx = L.x + SPAWN_COL * s + s / 2;
    const cy = L.y + s / 2;
    const k = s * 0.16;
    ctx.strokeStyle = danger >= CFG.danger.danger ? OWLIS.danger : "rgba(255,92,122,0.3)";
    ctx.lineWidth = Math.max(1.2, s * 0.05);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - k, cy - k);
    ctx.lineTo(cx + k, cy + k);
    ctx.moveTo(cx + k, cy - k);
    ctx.lineTo(cx - k, cy + k);
    ctx.stroke();
    ctx.lineCap = "butt";
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(L.x - 2, L.y - 2, W + 4, H + 4);
  ctx.clip();

  const b = f.board;
  const oy = L.y - HIDDEN * s;
  const clearing = f.phase === "clear";
  const prog = clearing ? 1 - f.timer / CFG.anim.clear : 0;

  // 같은 색끼리 이어진 다리 (그룹이 눈에 들어오게) — 둥근 알약
  const t = s * 0.22;
  for (let i = 0; i < CELLS; i++) {
    const v = b[i];
    if (v === 0 || v === GARBAGE || f.drop[i] > 0) continue;
    const c = i % COLS;
    const r = (i - c) / COLS;
    const x = L.x + c * s + s / 2;
    const y = oy + r * s + s / 2;
    ctx.fillStyle = `${OWLIS.block[v]}88`;
    if (c < COLS - 1 && b[i + 1] === v && f.drop[i + 1] === 0) {
      roundRect(ctx, x, y - t / 2, s, t, t / 2);
      ctx.fill();
    }
    if (i + COLS < CELLS && b[i + COLS] === v && f.drop[i + COLS] === 0) {
      roundRect(ctx, x - t / 2, y, t, s, t / 2);
      ctx.fill();
    }
  }

  // 블록
  for (let i = 0; i < CELLS; i++) {
    const v = b[i];
    if (v === 0) continue;
    const c = i % COLS;
    const r = (i - c) / COLS;
    const x = L.x + c * s;
    const y = oy + (r - f.drop[i]) * s;
    if (clearing && f.flash[i]) {
      // 하얗게 빛나며 오그라들어 사라진다 (크기는 MIN_CELL 아래로 줄이지 않고, 대신 투명해진다)
      const k = 1 - Math.max(0, prog - 0.5) / 0.5;
      const ss = Math.max(MIN_CELL, Math.round(s * (0.9 + 0.1 * Math.sin(prog * Math.PI)) * (0.4 + 0.6 * k)));
      ctx.globalAlpha = Math.max(0, k);
      drawCell(ctx, R, v, x + (s - ss) / 2, y + (s - ss) / 2, ss);
      ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.45 * Math.sin(prog * Math.PI)})`;
      roundRect(ctx, x + (s - ss) / 2 + 1, y + (s - ss) / 2 + 1, ss - 2, ss - 2, ss * 0.28);
      ctx.fill();
      ctx.globalAlpha = 1;
      continue;
    }
    drawCell(ctx, R, v, x, y, s);
  }

  // 조작 중인 블록 + 고스트
  const p = f.piece;
  if (p && f.phase === "active") {
    const frac = f.grounded ? 0 : Math.min(0.95, f.fallAcc);
    const cc = childC(p);
    const cr = childR(p);
    if (f.side === 0) {
      ghostCells(f, R.ghost);
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      for (let k = 0; k < 2; k++) {
        const gi = R.ghost[k];
        if (gi < 0) continue;
        const gc = gi % COLS;
        const gr = (gi - gc) / COLS;
        ctx.strokeStyle = `${OWLIS.block[k === 0 ? p.a : p.b]}aa`;
        roundRect(ctx, L.x + gc * s + 4, oy + gr * s + 4, s - 8, s - 8, s * 0.24);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    const px = L.x + p.c * s;
    const py = oy + (p.r + frac) * s;
    const qx = L.x + cc * s;
    const qy = oy + (cr + frac) * s;
    // 두 칸을 잇는 흰 알약
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = Math.max(2, s * 0.16);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(px + s / 2, py + s / 2);
    ctx.lineTo(qx + s / 2, qy + s / 2);
    ctx.stroke();
    ctx.lineCap = "butt";
    drawCell(ctx, R, p.a, px, py, s);
    drawCell(ctx, R, p.b, qx, qy, s);
    // 축 표시 (회전 중심) — 작은 흰 점
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(px + s / 2, py + s * 0.14, Math.max(1.5, s * 0.055), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // AI 재부팅 (KO 뒤)
  if (f.phase === "reboot") {
    ctx.save();
    roundRect(ctx, L.x - pad, L.y - pad, W + pad * 2, H + pad * 2, rad);
    ctx.fillStyle = "rgba(6,9,19,0.72)";
    ctx.fill();
    ctx.restore();
    ctx.font = font(800, Math.max(10, s * 0.55));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = color;
    ctx.fillText(labels.reboot, L.x + W / 2, L.y + H / 2 + Math.sin(R.t * 20) * 1.5);
    ctx.restore();
  }
  if (f.phase === "dead") {
    ctx.save();
    roundRect(ctx, L.x - pad, L.y - pad, W + pad * 2, H + pad * 2, rad);
    ctx.fillStyle = "rgba(6,9,19,0.6)";
    ctx.fill();
    ctx.restore();
  }

  drawIncoming(ctx, R, f, L);
}

/** 방해 블록 아이콘 한 개가 뜻하는 칸 수 — 큰 것부터 (5줄 · 한 줄 · 한 칸), 뿌요뿌요의 예고 아이콘처럼 */
const GARBAGE_UNITS = [COLS * 5, COLS, 1] as const;
const GARBAGE_ICONS_MAX = 6;

/**
 * 받을 방해 블록 예고 (필드 바로 위 한 줄) — 5줄 = 붉게 빛나는 큰 블록, 한 줄 = 큰 블록, 한 칸 = 작은 블록.
 * 아이콘은 여섯 개까지, 오른쪽 끝에 정확한 칸 수.
 */
function drawIncoming(ctx: CanvasRenderingContext2D, R: Renderer, f: Field, L: Rect): void {
  if (f.incoming <= 0) return;
  const s = L.cell;
  const gi = garbageIcon(s);
  const small = Math.max(MIN_CELL, Math.round(gi * 0.62));
  const y = L.y - framePad(s) - 5 - gi;
  const W = s * COLS;
  const txt = `${f.incoming}`;
  ctx.font = font(900, Math.round(gi * 0.9));
  const maxX = L.x + W - ctx.measureText(txt).width - 6;
  const pulse = 0.6 + 0.4 * Math.sin(R.t * 10);

  let left = f.incoming;
  let x = L.x;
  let n = 0;
  for (const u of GARBAGE_UNITS) {
    while (left >= u && n < GARBAGE_ICONS_MAX) {
      const size = u === 1 ? small : gi;
      if (x + size > maxX) break;
      if (u > COLS) {
        // 5줄짜리 — 붉은 네온 테두리가 맥동
        ctx.save();
        ctx.shadowColor = OWLIS.garbageCrack;
        ctx.shadowBlur = 12 * pulse;
        roundRect(ctx, x - 1, y - 1, size + 2, size + 2, size * 0.28);
        ctx.lineWidth = 2;
        ctx.strokeStyle = OWLIS.garbageCrack;
        ctx.stroke();
        ctx.restore();
      }
      drawCell(ctx, R, GARBAGE, x, y + (gi - size), size);
      x += size + Math.max(2, Math.round(gi * 0.18));
      left -= u;
      n++;
    }
  }
  ctx.save();
  ctx.font = font(900, Math.round(gi * 0.9));
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = OWLIS.garbageCrack;
  ctx.shadowBlur = 8;
  ctx.fillStyle = OWLIS.garbageCrack;
  ctx.fillText(txt, L.x + W, y + gi * 0.9);
  ctx.restore();
}

/* ── NEXT · HOLD · 게이지 ─────────────────────────────────────── */

/** 한 쌍 — 세로(축 a 가 아래) 또는 눕혀서(HOLD, a 가 왼쪽) */
function drawPair(ctx: CanvasRenderingContext2D, R: Renderer, a: number, b: number, x: number, y: number, s: number, dim = false, flat = false): void {
  ctx.globalAlpha = dim ? 0.4 : 1;
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = Math.max(1.5, s * 0.14);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x + s / 2, y + s / 2);
  if (flat) ctx.lineTo(x + s * 1.5, y + s / 2);
  else ctx.lineTo(x + s / 2, y + s * 1.5);
  ctx.stroke();
  ctx.lineCap = "butt";
  if (flat) {
    drawCell(ctx, R, a, x, y, s);
    drawCell(ctx, R, b, x + s, y, s);
  } else {
    drawCell(ctx, R, b, x, y, s);
    drawCell(ctx, R, a, x, y + s, s);
  }
  ctx.globalAlpha = 1;
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string | CanvasGradient,
  align: CanvasTextAlign = "left",
): void {
  ctx.font = font(800, size);
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** NEXT 상자 — NEXT 는 또렷하게, NEXT-NEXT 는 작고 흐리게 */
function drawNext(ctx: CanvasRenderingContext2D, R: Renderer, f: Field, slots: Rect[], text: string, color: string, ls: number, right: boolean): void {
  const n0 = slots[0];
  const n1 = slots[1];
  const nx = Math.min(n0.x, n1.x) - 8;
  const ny = n0.y - 8;
  const nw = Math.max(n0.x + n0.cell, n1.x + n1.cell) - nx + 8;
  const nh = Math.max(n0.y + n0.cell * 2, n1.y + n1.cell * 2) - ny + 8;
  label(ctx, text, right ? nx + nw - 2 : nx + 2, ny - 5, ls, color, right ? "right" : "left");
  neonFrame(ctx, nx, ny, nw, nh, 12, `${color}aa`, 10);
  for (let k = 0; k < Math.min(CFG.preview, slots.length); k++) {
    const slot = slots[k];
    const pr = peek(f, k);
    drawPair(ctx, R, pr.a, pr.b, slot.x, slot.y, slot.cell, k > 0);
  }
}

/** TIME — 이름(작게) + 시계(크게), 가운데 정렬 */
function drawTime(ctx: CanvasRenderingContext2D, g: Game, Lay: Layout, text: string): void {
  const ls = Lay.labelSize;
  const { x, y } = Lay.time;
  label(ctx, text, x, y + ls, ls, OWLIS.dim, "center");
  const s = Math.floor(g.t);
  const clock = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  ctx.save();
  ctx.shadowColor = GRAD.violet;
  ctx.shadowBlur = 10;
  label(ctx, clock, x, y + ls + 5 + Math.round(ls * 1.6), Math.round(ls * 1.6), OWLIS.text, "center");
  ctx.restore();
}

/** 필드 아래 줄 — 왼쪽 이름(작게) + 오른쪽 값(크게, 발광) */
function drawInfo(ctx: CanvasRenderingContext2D, I: Info, name: string, value: string, color: string): void {
  label(ctx, name, I.x, I.y, Math.max(10, Math.round(I.size * 0.55)), color);
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  label(ctx, value, I.x + I.w, I.y, I.size, OWLIS.text, "right");
  ctx.restore();
}

function drawRail(ctx: CanvasRenderingContext2D, R: Renderer, g: Game, Lay: Layout, labels: Labels): void {
  const f = g.player;
  const ls = Lay.labelSize;
  drawNext(ctx, R, f, Lay.next, labels.next, OWLIS.player, ls, false);
  if (Lay.aiNext) drawNext(ctx, R, g.ai, Lay.aiNext, labels.next, aiTone(g.diff.peak).line, ls, true);

  // HOLD — 뿌요뿌요에는 없는 규칙이라 작게: 이름 + 눕힌 한 쌍
  const h = Lay.hold;
  neonFrame(ctx, h.x - 7, h.y - 7, h.cell * 2 + 14, h.cell + 14, 10, `${OWLIS.ai}88`, 6);
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.font = font(800, Math.max(10, Math.round(ls * 0.9)));
  ctx.textAlign = "right";
  ctx.fillStyle = OWLIS.dim;
  ctx.fillText(labels.hold, h.x - 12, h.y + h.cell / 2);
  ctx.restore();
  if (f.hold) drawPair(ctx, R, f.hold.a, f.hold.b, h.x, h.y, h.cell, f.holdUsed, true);

  drawTime(ctx, g, Lay, labels.time);

  // 게이지 — ATTACK (시안 → 바이올렛) · FEVER (바이올렛 → 마젠타)
  const G = Lay.gauge;
  const bh = Math.max(6, ls * 0.7);
  const fever = g.fever.t > 0;
  let y = G.y;
  label(ctx, labels.attack, G.x, y, ls * 0.9, OWLIS.dim);
  y += 5;
  pill(ctx, G.x, y, G.w, bh, g.attackLive, GRAD.aqua, GRAD.violet, 10);
  y += bh + ls + 8;
  label(ctx, fever ? labels.feverOn : labels.fever, G.x, y, ls * 0.9, fever ? diag(ctx, G.x, 0, G.w * 0.6, 0, GRAD.violet, GRAD.magenta) : OWLIS.dim);
  y += 5;
  pill(ctx, G.x, y, G.w, bh, g.fever.gauge, GRAD.violet, GRAD.magenta, fever ? 18 + Math.sin(R.t * 8) * 6 : 10);
}

/* ── AI 부엉이 (§40, §41) — 그라데이션 링 안의 선화 ────────────────── */

type ConicCtx = CanvasRenderingContext2D & {
  createConicGradient?: (start: number, x: number, y: number) => CanvasGradient;
};

/** 레퍼런스의 무지개 링 — 시안 → 바이올렛 → 마젠타 원형 그라데이션 (지원 안 하면 대각선) */
function ringStroke(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, a: string, b: string, c: string, rot: number): CanvasGradient {
  const cc = ctx as ConicCtx;
  if (cc.createConicGradient) {
    const g = cc.createConicGradient(rot, cx, cy);
    g.addColorStop(0, a);
    g.addColorStop(0.33, b);
    g.addColorStop(0.66, c);
    g.addColorStop(1, a);
    return g;
  }
  return diag(ctx, cx - r, cy - r, r * 2, r * 2, a, b, c);
}

/**
 * AI 부엉이 (처음 버전의 네온) — 육각형 머리 + 귀를 네온 선으로, 둘레에 천천히 도는 무지개 링.
 * LEVEL 이 오를수록 몸이 어두워지고(DARK OWL), 눈빛·발광이 세지고, 눈썹이 사나워진다. 5+ 는 찢어진 잔상.
 */
export function drawOwl(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, d: number, t: number): void {
  const tone = aiTone(d);
  const corrupted = d >= 6;
  const R = size / 2;

  // 무지개 링 (레퍼런스의 원형 링)
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.98, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2, size * 0.04);
  ctx.strokeStyle = ringStroke(ctx, cx, cy, R, d < 3 ? GRAD.aqua : tone.a, GRAD.violet, tone.b, t * 0.6);
  ctx.shadowColor = tone.line;
  ctx.shadowBlur = 14 + tone.hot * 12;
  ctx.globalAlpha = 0.85;
  ctx.stroke();
  ctx.restore();

  const r = R * 0.62;
  const oy = cy + r * 0.08;
  ctx.save();
  if (corrupted) ctx.translate((Math.random() - 0.5) * 2, 0);
  ctx.shadowColor = tone.line;
  ctx.shadowBlur = 10 + tone.hot * 18;
  // 머리 (육각형) + 귀
  ctx.beginPath();
  const pts: [number, number][] = [
    [-0.78, -0.5],
    [-0.9, -1.02],
    [-0.4, -0.72],
    [0.4, -0.72],
    [0.9, -1.02],
    [0.78, -0.5],
    [0.84, 0.4],
    [0, 0.95],
    [-0.84, 0.4],
  ];
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * r, oy + y * r) : ctx.moveTo(cx + x * r, oy + y * r)));
  ctx.closePath();
  ctx.fillStyle = tone.body;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.07);
  ctx.strokeStyle = tone.line;
  ctx.stroke();
  // 눈 — LEVEL 이 오를수록 눈썹이 사나워지고 눈빛이 세진다
  const blink = Math.sin(t * 1.3) > 0.985 ? 0.15 : 1;
  const brow = Math.min(0.35, d * 0.07);
  for (const sx of [-1, 1]) {
    const ex = cx + sx * r * 0.38;
    const ey = oy - r * 0.12;
    ctx.beginPath();
    ctx.ellipse(ex, ey, r * 0.24, r * 0.24 * blink, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#050814";
    ctx.fill();
    ctx.strokeStyle = tone.line;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ex + sx * -r * 0.03, ey, r * (0.09 + tone.hot * 0.04) * blink, 0, Math.PI * 2);
    ctx.fillStyle = tone.eye;
    ctx.fill();
    // 눈썹
    ctx.beginPath();
    ctx.moveTo(ex - sx * r * 0.26, ey - r * 0.3 + brow * r * 0.4);
    ctx.lineTo(ex + sx * r * 0.22, ey - r * 0.3 - brow * r * 0.2 + brow * r * 0.5);
    ctx.lineWidth = Math.max(1.5, r * 0.06);
    ctx.stroke();
  }
  // 부리
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.1, oy + r * 0.2);
  ctx.lineTo(cx + r * 0.1, oy + r * 0.2);
  ctx.lineTo(cx, oy + r * 0.42);
  ctx.closePath();
  ctx.fillStyle = tone.eye;
  ctx.fill();
  ctx.restore();

  // 5+ 오염 — 가로로 찢어진 잔상
  if (corrupted) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = tone.line;
    for (let k = 0; k < 3; k++) {
      const y = cy - R + Math.random() * size;
      ctx.fillRect(cx - R + (Math.random() - 0.5) * R * 0.4, y, size, Math.max(1, Math.random() * 3));
    }
    ctx.restore();
  }
}

/* ── 한 프레임 ────────────────────────────────────────────────── */

function fieldCenter(L: Rect, cx: number, cy: number): { x: number; y: number } {
  return { x: L.x + cx * L.cell, y: L.y + (cy - HIDDEN) * L.cell };
}

/** 엔진이 쌓은 이펙트를 연출로 바꾼다 */
function consumeFx(R: Renderer, g: Game, Lay: Layout, labels: Labels): void {
  for (const e of g.fx) {
    if (e.k === "clear") {
      const L = e.side === 0 ? Lay.pf : Lay.af;
      const f = e.side === 0 ? g.player : g.ai;
      for (let i = 0; i < CELLS; i++) {
        if (!f.flash[i]) continue;
        const c = i % COLS;
        const r = (i - c) / COLS;
        const v = f.board[i];
        const color = v === GARBAGE ? OWLIS.garbageCrack : OWLIS.block[v] || "#fff";
        burst(R, L.x + (c + 0.5) * L.cell, L.y + (r - HIDDEN + 0.5) * L.cell, color, e.side === 0 ? 4 : 2, L.cell * 4);
      }
      const at = fieldCenter(L, e.x, e.y);
      const x0 = L.x;
      const x1 = L.x + L.cell * COLS;
      // 연쇄 팝업 — 터진 자리 위에 크게 ("3연쇄!"), 필드 밖으로 나가지 않게
      if (e.chain >= 2) {
        const size = Math.max(14, L.cell * (0.8 + Math.min(0.5, e.chain * 0.07)));
        R.popups.push({
          x: at.x,
          y: Math.max(L.y + size, at.y - L.cell * 0.4),
          x0,
          x1,
          text: labels.chain(e.chain),
          color: e.side === 0 ? OWLIS.player : aiTone(g.diff.peak).line,
          life: 1.1,
          max: 1.1,
          size,
          big: true,
        });
      }
      if (e.side === 0 && e.pts > 0) {
        R.popups.push({
          x: at.x,
          y: at.y + L.cell * 0.45,
          x0,
          x1,
          text: `+${e.pts.toLocaleString()}`,
          color: OWLIS.gold,
          life: 0.9,
          max: 0.9,
          size: L.cell * 0.42,
          big: false,
        });
      }
    } else if (e.k === "send") {
      const from = e.from === 0 ? Lay.pf : Lay.af;
      const to = e.from === 0 ? Lay.af : Lay.pf;
      R.beams.push({
        x0: from.x + (from.cell * COLS) / 2,
        y0: from.y + from.cell * 3,
        x1: to.x + to.cell * 1.2,
        y1: to.y - aboveH(to.cell) / 2,
        t: 0,
        color: e.from === 0 ? OWLIS.player : OWLIS.aiHot,
        big: e.cells >= COLS * 2,
      });
    } else if (e.k === "garbage") {
      if (e.side === 0) R.shake = Math.max(R.shake, Math.min(9, 2 + e.cells / 4));
    } else if (e.k === "ko") {
      R.ko = 1;
      const L = Lay.af;
      for (let k = 0; k < 40; k++) burst(R, L.x + Math.random() * L.cell * COLS, L.y + Math.random() * L.cell * VIS, OWLIS.gold, 1, L.cell * 6);
    }
  }
  g.fx.length = 0;
}

/** 배경 — 어두운 사이버 공간 + 흐르는 격자 (처음 버전) + 모서리에 옅게 번진 빛 */
function drawBackdrop(ctx: CanvasRenderingContext2D, g: Game, w: number, h: number, t: number, reduced: boolean): void {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, OWLIS.bg2);
  bg.addColorStop(1, OWLIS.bg);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const fever = g.fever.t > 0;
  const blooms: [number, number, number, string][] = [
    [0.12, 0.1, 0.5, fever ? "rgba(192,132,252,0.2)" : "rgba(167,139,250,0.1)"],
    [0.95, 0.9, 0.55, fever ? "rgba(232,121,249,0.18)" : "rgba(232,121,249,0.07)"],
  ];
  for (const [fx, fy, fr, col] of blooms) {
    const r = Math.max(w, h) * fr;
    const gr = ctx.createRadialGradient(w * fx, h * fy, 0, w * fx, h * fy, r);
    gr.addColorStop(0, col);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, w, h);
  }
  const gs = 36;
  const off = reduced ? 0 : (t * 10) % gs;
  ctx.strokeStyle = fever ? "rgba(192,132,252,0.12)" : OWLIS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -gs; x < w + gs; x += gs) {
    ctx.moveTo(x + off, 0);
    ctx.lineTo(x + off, h);
  }
  for (let y = -gs; y < h + gs; y += gs) {
    ctx.moveTo(0, y + off);
    ctx.lineTo(w, y + off);
  }
  ctx.stroke();
}

export function draw(
  ctx: CanvasRenderingContext2D,
  R: Renderer,
  g: Game,
  Lay: Layout,
  w: number,
  h: number,
  dt: number,
  labels: Labels,
  reduced: boolean,
): void {
  R.t += dt;
  consumeFx(R, g, Lay, labels);
  drawBackdrop(ctx, g, w, h, R.t, reduced);

  // 흔들림 (방해 블록 착지 · CRITICAL)
  R.shake = Math.max(0, R.shake - dt * 30);
  const crit = g.critical && !g.over;
  const sh = reduced ? 0 : R.shake + (crit ? 1.2 : 0);
  ctx.save();
  if (sh > 0) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);

  drawField(ctx, R, g, g.player, Lay.pf, labels);
  drawField(ctx, R, g, g.ai, Lay.af, labels);
  drawRail(ctx, R, g, Lay, labels);

  // 필드 아래 — 나: 이름 + 점수 / AI: AI LEVEL (뿌요뿌요의 점수 줄 자리)
  drawInfo(ctx, Lay.pInfo, labels.you, rawScore(g).toLocaleString(), OWLIS.player);
  drawInfo(ctx, Lay.aInfo, labels.aiLevel, levelLabel(g.diff.peak), aiTone(g.diff.peak).line);

  // AI 부엉이
  if (Lay.avatar.size > 0) drawOwl(ctx, Lay.avatar.x, Lay.avatar.y, Lay.avatar.size, g.diff.peak, R.t);

  // 공격 빔
  for (let k = R.beams.length - 1; k >= 0; k--) {
    const b = R.beams[k];
    b.t += dt / 0.45;
    if (b.t >= 1) {
      R.beams.splice(k, 1);
      continue;
    }
    const u = b.t;
    const mx = (b.x0 + b.x1) / 2;
    const my = Math.min(b.y0, b.y1) - 60;
    const bx = (1 - u) * (1 - u) * b.x0 + 2 * (1 - u) * u * mx + u * u * b.x1;
    const by = (1 - u) * (1 - u) * b.y0 + 2 * (1 - u) * u * my + u * u * b.y1;
    ctx.save();
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(bx, by, b.big ? 7 : 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = b.color;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(bx, by, b.big ? 11 : 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 파티클 — 작은 빛 점
  for (let k = R.parts.length - 1; k >= 0; k--) {
    const p = R.parts[k];
    p.life -= dt;
    if (p.life <= 0) {
      R.parts.splice(k, 1);
      continue;
    }
    p.vy += 600 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 팝업 — 색 발광 + 흰 글자
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let k = R.popups.length - 1; k >= 0; k--) {
    const p = R.popups[k];
    p.life -= dt;
    if (p.life <= 0) {
      R.popups.splice(k, 1);
      continue;
    }
    p.y -= dt * (p.big ? 22 : 34);
    ctx.globalAlpha = Math.min(1, p.life * 2.5);
    // 연쇄 팝업은 처음 0.14초 동안 크게 튀어나왔다가 제자리로
    const popIn = p.big ? Math.max(0, 1 - (p.max - p.life) / 0.14) : 0;
    const size = Math.max(10, Math.round(p.size * (1 + 0.4 * popIn)));
    ctx.font = font(900, size);
    const tw = ctx.measureText(p.text).width;
    const x = p.x1 - p.x0 > tw ? Math.min(p.x1 - tw / 2, Math.max(p.x0 + tw / 2, p.x)) : (p.x0 + p.x1) / 2;
    if (p.big) {
      // 어두운 외곽선 — 블록 위에서도 읽히게
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(3, size * 0.16);
      ctx.strokeStyle = `${OWLIS.bg}dd`;
      ctx.strokeText(p.text, x, p.y);
    }
    ctx.save();
    ctx.shadowColor = p.color;
    ctx.shadowBlur = p.big ? 20 : 14;
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, x, p.y);
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText(p.text, x, p.y - 0.5);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // KO 섬광
  if (R.ko > 0) {
    R.ko = Math.max(0, R.ko - dt * 2);
    const L = Lay.af;
    roundRect(ctx, L.x, L.y, L.cell * COLS, L.cell * VIS, Math.min(22, L.cell * 0.6));
    ctx.fillStyle = `rgba(253,230,138,${R.ko * 0.45})`;
    ctx.fill();
  }

  // CRITICAL — 붉은 가장자리 (§28)
  if (crit) {
    const a = 0.22 + 0.18 * Math.sin(R.t * 10);
    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    v.addColorStop(0, "rgba(255,40,80,0)");
    v.addColorStop(1, `rgba(255,40,80,${a})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }
  // FEVER — 화면 가장자리에 바이올렛 → 마젠타 → 시안 헤어라인 빛
  if (g.fever.t > 0) {
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.15 * Math.sin(R.t * 6);
    ctx.lineWidth = 3;
    roundRect(ctx, 5, 5, w - 10, h - 10, 20);
    ctx.strokeStyle = diag(ctx, 0, 0, w, h, GRAD.violet, GRAD.magenta, GRAD.aqua);
    ctx.shadowColor = OWLIS.fever;
    ctx.shadowBlur = 24;
    ctx.stroke();
    ctx.restore();
  }
}
