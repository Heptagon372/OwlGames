/** 캔버스를 부모 크기에 맞추고 DPR을 적용한다. 반환값은 CSS 픽셀 기준 크기 */
export function fitCanvas(canvas: HTMLCanvasElement): { w: number; h: number; dpr: number } {
  const parent = canvas.parentElement;
  const w = Math.max(1, Math.round(parent?.clientWidth ?? canvas.clientWidth));
  const h = Math.max(1, Math.round(parent?.clientHeight ?? canvas.clientHeight));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext("2d");
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h, dpr };
}

/** 리사이즈 · 모바일 키보드(visualViewport) 대응 구독 */
export function onResize(handler: () => void): () => void {
  window.addEventListener("resize", handler);
  window.addEventListener("orientationchange", handler);
  window.visualViewport?.addEventListener("resize", handler);
  return () => {
    window.removeEventListener("resize", handler);
    window.removeEventListener("orientationchange", handler);
    window.visualViewport?.removeEventListener("resize", handler);
  };
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 시드 고정 난수 (연출용 — 점수에는 영향 없음) */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const COLORS = {
  night: "#0b1020",
  panel: "#141b33",
  panel2: "#1b2444",
  line: "rgba(120,150,220,0.25)",
  neon: "#ffb020",
  neonSoft: "#ffd27a",
  aqua: "#3dd9eb",
  alert: "#ff5c7a",
  ok: "#6bf0a0",
  ink: "#e8ecf8",
  mute: "#8d97ba",
} as const;

let cachedMono: string | null = null;

/** next/font가 생성한 JetBrains Mono 패밀리명 (canvas는 CSS 변수를 못 읽는다) */
export function monoFamily(): string {
  if (cachedMono) return cachedMono;
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-jetbrains").trim();
  cachedMono = v ? `${v}, ui-monospace, monospace` : "ui-monospace, monospace";
  return cachedMono;
}

export function font(weight: number, size: number): string {
  return `${weight} ${size}px ${monoFamily()}`;
}
