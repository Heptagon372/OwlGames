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
