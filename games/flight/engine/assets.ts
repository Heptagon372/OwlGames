"use client";

// 외부 CC0 에셋 로더 (Kenney — public/assets/CREDITS.md 참고).
// 전부 그레이스케일이라 캔버스에서 원하는 색으로 틴팅해서 쓴다.
// 로딩 전에는 null을 돌려주고, 렌더는 도형 폴백으로 그린다.

const BASE = "/assets";

const SRC = {
  /** 벽 패널 (이음매 없는 1024² 그레이스케일) */
  panel: `${BASE}/kenney-prototype-textures/dark_texture_05.png`,
  panelRough: `${BASE}/kenney-prototype-textures/dark_texture_13.png`,
  /** 파티클 */
  spark: `${BASE}/kenney-particle-pack/spark_06.png`,
  star: `${BASE}/kenney-particle-pack/star_08.png`,
  glow: `${BASE}/kenney-particle-pack/circle_05.png`,
  trace: `${BASE}/kenney-particle-pack/trace_01.png`,
  smoke: `${BASE}/kenney-particle-pack/smoke_03.png`,
  flare: `${BASE}/kenney-particle-pack/flare_01.png`,
  /** 조명 마스크 (가로등 불빛) */
  cone: `${BASE}/kenney-light-masks/cone_a_blur.png`,
} as const;

export type TexName = keyof typeof SRC;

const images = new Map<TexName, HTMLImageElement>();
const ready = new Set<TexName>();
const tintCache = new Map<string, HTMLCanvasElement>();
const patternCache = new Map<string, CanvasPattern>();

export function preloadTextures(): void {
  if (typeof window === "undefined" || images.size) return;
  for (const name of Object.keys(SRC) as TexName[]) {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => ready.add(name);
    img.src = SRC[name];
    images.set(name, img);
  }
}

export function tex(name: TexName): HTMLImageElement | null {
  return ready.has(name) ? (images.get(name) ?? null) : null;
}

/** 그레이스케일 텍스처를 색으로 물들인 오프스크린 캔버스 (캐시) */
export function tinted(name: TexName, color: string, size = 128): HTMLCanvasElement | null {
  const img = tex(name);
  if (!img) return null;
  const key = `${name}|${color}|${size}`;
  const hit = tintCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const cx = c.getContext("2d");
  if (!cx) return null;
  cx.drawImage(img, 0, 0, size, size);
  cx.globalCompositeOperation = "source-in";
  cx.fillStyle = color;
  cx.fillRect(0, 0, size, size);
  tintCache.set(key, c);
  return c;
}

/** 벽면용 타일 패턴 (원본 1024²는 너무 커서 축소해서 캐시) */
export function texturePattern(
  ctx: CanvasRenderingContext2D,
  name: TexName,
  tile = 128,
): CanvasPattern | null {
  const img = tex(name);
  if (!img) return null;
  const key = `${name}|${tile}`;
  const hit = patternCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = tile;
  c.height = tile;
  const cx = c.getContext("2d");
  if (!cx) return null;
  cx.drawImage(img, 0, 0, tile, tile);
  const p = ctx.createPattern(c, "repeat");
  if (!p) return null;
  patternCache.set(key, p);
  return p;
}

/** 가산 합성으로 스프라이트를 그린다 (어두운 배경에서 빛나게) */
export function drawAdditive(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha = 1,
): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = alpha;
  ctx.drawImage(canvas, x - w / 2, y - h / 2, w, h);
  ctx.restore();
}

/* ── 아울러닝 2.0 스프라이트 (사용자 제공 리소스 시트, public/assets/owlrun) ───────────
 * `scripts/slice-owlrun-sheet.py` 가 시트에서 잘라 배경을 뺀 그림들이다.
 * 로딩 전에는 null → 렌더는 기존 도형 폴백으로 그린다 (에셋 없이도 게임이 돈다). */

const OWLRUN = "/assets/owlrun";

const SPRITE_NAMES = [
  // 캐릭터 시트 (scripts/slice-owlrun-character.py — 2배로 키워 둔 고해상도)
  "char/R",
  "char/B",
  "char/P",
  "char/trail-R",
  "char/trail-B",
  "char/trail-P",
  "char/phantom",
  "char/freeze",
  "char/fire",
  "char/golden",
  "char/fx-energy",
  "char/fx-score",
  "char/fx-turbo",
  "char/hit",
  "char/fall",
  "char/dead",
  "char/revive",
  "char/dizzy",
  "char/happy",
  "char/victory",
  // 리소스 시트 (scripts/slice-owlrun-sheet.py)
  "color-R",
  "color-B",
  "color-P",
  "text-perfect",
  "text-near",
  "text-combo",
  "text-fever",
  "wall-block",
  "wall-slab",
  "wall-moving",
  "spikes",
  "missile",
  "saw",
  "wave-zone",
  "glitch-block",
  "gate-fake",
  "turbo-arrows",
  "item-energy",
  "item-crystal",
  "item-rage",
  "item-shield",
  "item-feather",
  "item-star",
  "item-magnet",
  "item-phantom",
  "item-golden",
  "item-owl-energy",
  "item-size-S",
  "item-size-L",
  "item-box",
  "deco-cloud",
  "deco-moon",
  "bg-01",
  "bg-05",
  "bg-10",
  "bg-14",
  "bg-15",
] as const;

export type SpriteName = (typeof SPRITE_NAMES)[number];

/** DOM(HUD)에서 쓰는 그림 경로 */
export function spriteUrl(name: string): string {
  return `${OWLRUN}/${name}.webp`;
}

const sprites = new Map<SpriteName, HTMLImageElement>();
const spriteReady = new Set<SpriteName>();
const spritePatterns = new Map<string, CanvasPattern>();

export function preloadSprites(): void {
  if (typeof window === "undefined" || sprites.size) return;
  for (const name of SPRITE_NAMES) {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => spriteReady.add(name);
    img.src = spriteUrl(name);
    sprites.set(name, img);
  }
}

/** 로딩된 스프라이트 (아직이면 null → 도형 폴백) */
export function spr(name: SpriteName): HTMLImageElement | null {
  return spriteReady.has(name) ? (sprites.get(name) ?? null) : null;
}

/** 스프라이트를 (cx, cy) 가운데에 높이 h 로 그린다 (가로는 비율대로). 로딩 전이면 false */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  name: SpriteName,
  cx: number,
  cy: number,
  h: number,
  opts: { rot?: number; alpha?: number; flipY?: boolean; flipX?: boolean; additive?: boolean } = {},
): boolean {
  const img = spr(name);
  if (!img) return false;
  const w = (img.width / img.height) * h;
  ctx.save();
  ctx.translate(cx, cy);
  if (opts.rot) ctx.rotate(opts.rot);
  if (opts.flipY || opts.flipX) ctx.scale(opts.flipX ? -1 : 1, opts.flipY ? -1 : 1);
  if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
  if (opts.additive) ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
  return true;
}

/** 스프라이트를 폭 tileW 로 줄여 만든 반복 패턴 (돌벽 · 글리치 벽) */
export function spritePattern(ctx: CanvasRenderingContext2D, name: SpriteName, tileW: number): CanvasPattern | null {
  const img = spr(name);
  if (!img) return null;
  const key = `${name}|${tileW}`;
  const hit = spritePatterns.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = Math.round(tileW);
  c.height = Math.round((img.height / img.width) * tileW);
  const cx = c.getContext("2d");
  if (!cx) return null;
  cx.drawImage(img, 0, 0, c.width, c.height);
  const p = ctx.createPattern(c, "repeat");
  if (!p) return null;
  spritePatterns.set(key, p);
  return p;
}
