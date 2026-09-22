// 렌더 — 레이어: 배경 → 장애물 → 아이템 → 부엉이 → 파티클 (기획서 §14)
// 로직은 game.ts에만 있고 여기서는 상태를 읽어 그리기만 한다.
import { CFG, COLOR_INFO, type Color, type SizeKey } from "../config";
import type { Entity, ItemKind } from "../types";
import { bugY } from "./collision";
import { spriteRadius } from "./owl";
import type { Game } from "./game";
import type { SpawnedEntity } from "./spawner";

const W = CFG.view.w;
const H = CFG.view.h;
const OWL_X = CFG.physics.owlX;

const ITEM_EMOJI: Record<ItemKind, string> = {
  feather: "🪶",
  bigFeather: "⭐",
  grow: "🟢",
  shrink: "🔵",
  shield: "🛡️",
  efficiency: "⚡",
  rainbow: "🌈",
  gem: "💎",
  star: "🎯",
};

const STARS = Array.from({ length: 60 }, (_, i) => ({
  x: (i * 173) % W,
  y: (i * 97) % (H - 120),
  r: (i % 3) * 0.6 + 0.8,
}));

const CITY = Array.from({ length: 26 }, (_, i) => ({
  x: i * 92,
  w: 54 + ((i * 37) % 46),
  h: 70 + ((i * 53) % 130),
  lights: (i * 7) % 6,
}));

export function render(ctx: CanvasRenderingContext2D, g: Game, reducedMotion: boolean): void {
  const night = g.special?.kind === "night";
  ctx.save();

  if (g.shake > 0 && !reducedMotion) {
    const s = g.shake * 10;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  }

  drawBackground(ctx, g, night);

  for (const s of g.spawner.entities) {
    if (s.gone) continue;
    const x = s.x - g.worldX;
    if (x > W + 80 || x + s.w < -80) continue;
    if (s.e.t === "item") drawItem(ctx, s, x, night);
    else drawObstacle(ctx, g, s, x, night);
  }

  drawOwl(ctx, g);
  drawParticles(ctx, g);

  if (g.flash > 0 && !reducedMotion) {
    ctx.fillStyle = `rgba(255,92,122,${g.flash * 0.6})`;
    ctx.fillRect(-40, -40, W + 80, H + 80);
  }
  // 에너지 20% 이하 비네트
  if (g.energy.value <= g.energy.max * CFG.energy.lowRatio) {
    const grd = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
    grd.addColorStop(0, "rgba(255,80,80,0)");
    grd.addColorStop(1, `rgba(255,60,60,${g.status === "falling" ? 0.5 : 0.32})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, g: Game, night: boolean): void {
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  if (night) {
    grd.addColorStop(0, "#04060f");
    grd.addColorStop(1, "#070b18");
  } else {
    grd.addColorStop(0, "#0b1020");
    grd.addColorStop(1, "#141b33");
  }
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  // 별 (패럴랙스)
  ctx.fillStyle = night ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.6)";
  for (const s of STARS) {
    const x = mod(s.x - g.worldX * 0.06, W + 20);
    ctx.fillRect(x, s.y, s.r, s.r);
  }

  // 달
  if (!night) {
    ctx.fillStyle = "rgba(255,226,170,0.92)";
    ctx.beginPath();
    ctx.arc(W - 120, 92, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0b1020";
    ctx.beginPath();
    ctx.arc(W - 136, 80, 30, 0, Math.PI * 2);
    ctx.fill();
  }

  // 도시 실루엣
  ctx.fillStyle = night ? "#070c1a" : "#0f1730";
  for (const b of CITY) {
    const x = mod(b.x - g.worldX * 0.22, CITY.length * 92);
    if (x > W + 60) continue;
    const y = H - b.h;
    ctx.fillRect(x, y, b.w, b.h);
    ctx.fillStyle = night ? "rgba(255,176,32,0.18)" : "rgba(255,176,32,0.32)";
    for (let i = 0; i < b.lights; i++) {
      ctx.fillRect(x + 10 + (i % 3) * 16, y + 14 + Math.floor(i / 3) * 20, 7, 9);
    }
    ctx.fillStyle = night ? "#070c1a" : "#0f1730";
  }

  // 바닥 라인
  ctx.strokeStyle = "rgba(61,217,235,0.28)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, H - 1);
  ctx.lineTo(W, H - 1);
  ctx.stroke();
}

function glow(ctx: CanvasRenderingContext2D, color: string, blur: number): void {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}

function drawObstacle(ctx: CanvasRenderingContext2D, g: Game, s: SpawnedEntity, x: number, night: boolean): void {
  const e = s.e as Entity;
  ctx.save();
  // NIGHT FLIGHT: 배경만 어둡고 장애물은 윤곽 발광 (기획서 §10 / v1 대비 개선 9)
  const stroke = night ? "#7FE8FF" : "rgba(61,217,235,0.5)";
  const fill = night ? "rgba(10,16,32,0.75)" : "#232e55";
  if (night) glow(ctx, "#7FE8FF", 12);
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.lineWidth = night ? 2.5 : 1.5;

  switch (e.t) {
    case "pillar": {
      const top = e.gapY - e.gapH / 2;
      const bottom = e.gapY + e.gapH / 2;
      const w = CFG.entity.pillarW;
      rect(ctx, x, -20, w, top + 20, true);
      rect(ctx, x, bottom, w, H - bottom + 20, true);
      // 가로등 불빛
      ctx.fillStyle = "rgba(255,176,32,0.95)";
      ctx.beginPath();
      ctx.arc(x + w / 2, top - 4, 7, 0, Math.PI * 2);
      ctx.fill();
      if (!night) {
        ctx.fillStyle = "rgba(255,176,32,0.10)";
        ctx.beginPath();
        ctx.moveTo(x + w / 2, top);
        ctx.lineTo(x - 30, top + 90);
        ctx.lineTo(x + w + 30, top + 90);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case "wire": {
      ctx.strokeStyle = night ? "#FF9AB0" : "rgba(255,92,122,0.85)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x, e.y);
      ctx.quadraticCurveTo(x + e.w / 2, e.y + 10, x + e.w, e.y);
      ctx.stroke();
      break;
    }
    case "gate": {
      const info = COLOR_INFO[e.color];
      ctx.fillStyle = hexA(info.hex, s.judged ? 0.1 : 0.22);
      ctx.fillRect(x, e.y, CFG.entity.gateW, e.h);
      ctx.strokeStyle = info.hex;
      ctx.lineWidth = 3;
      glow(ctx, info.hex, 16);
      ctx.strokeRect(x, e.y, CFG.entity.gateW, e.h);
      // 큰 도형 실루엣 (색각 이상 대응 — 기획서 §4)
      ctx.globalAlpha = 0.85;
      drawShape(ctx, info.shape, x + CFG.entity.gateW / 2, e.y + e.h / 2, Math.min(46, e.h / 3), info.hex);
      ctx.globalAlpha = 1;
      break;
    }
    case "narrow": {
      const band = CFG.entity.narrowBand;
      rect(ctx, x, e.y - band, e.w, band, true);
      rect(ctx, x, e.y + e.h, e.w, band, true);
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = "#6BF0A0";
      ctx.strokeRect(x, e.y, e.w, e.h);
      ctx.setLineDash([]);
      ctx.fillStyle = "#6BF0A0";
      ctx.font = "700 20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("S", x + e.w / 2, e.y + e.h / 2 + 7);
      break;
    }
    case "wall": {
      ctx.fillStyle = night ? "rgba(10,16,32,0.8)" : "#3a2c52";
      ctx.strokeStyle = "#CDA8FF";
      rect(ctx, x, e.y, CFG.entity.wallW, e.h, true);
      ctx.fillStyle = "#CDA8FF";
      ctx.font = "700 20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("L", x + CFG.entity.wallW / 2, e.y + e.h / 2 + 7);
      break;
    }
    case "bug": {
      const y = bugY(e, (OWL_X + g.worldX - s.chunkX) / s.chunkScroll);
      ctx.font = "30px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("🐛", x + CFG.entity.bugR, y + 10);
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

function drawItem(ctx: CanvasRenderingContext2D, s: SpawnedEntity, x: number, night: boolean): void {
  if (s.e.t !== "item") return;
  ctx.save();
  if (night) glow(ctx, "#FFD27A", 14);
  ctx.font = "30px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(ITEM_EMOJI[s.e.kind], x + CFG.entity.itemR, s.e.y + 10);
  ctx.restore();
}

function drawOwl(ctx: CanvasRenderingContext2D, g: Game): void {
  const info = COLOR_INFO[g.color];
  const { rx, ry } = spriteRadius(g.size);
  const tween = 0.85 + 0.15 * g.sizeTween;
  ctx.save();
  ctx.translate(OWL_X, g.y);
  ctx.rotate(Math.max(-0.5, Math.min(0.9, g.vy / 900)));
  ctx.scale(tween, tween);
  if (g.iFrame > 0 && Math.floor(g.iFrame * 20) % 2 === 0) ctx.globalAlpha = 0.45;

  // 무지개 오라
  if (g.rainbow > 0) {
    const grd = ctx.createLinearGradient(-rx, 0, rx, 0);
    grd.addColorStop(0, "#FF6FD8");
    grd.addColorStop(0.5, "#FFB020");
    grd.addColorStop(1, "#3DD9EB");
    ctx.strokeStyle = grd;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx + 9, ry + 9, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 쉴드
  if (g.shield) {
    ctx.strokeStyle = "rgba(61,217,235,0.9)";
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx + 14, ry + 14, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 날개
  ctx.fillStyle = "#2a3665";
  ctx.beginPath();
  ctx.ellipse(-5, g.vy < 0 ? -9 : 7, rx * 0.55, ry * 0.35, g.vy < 0 ? -0.6 : 0.5, 0, Math.PI * 2);
  ctx.fill();
  // 몸통 — 현재 색으로 발광 (기획서 §4)
  ctx.shadowColor = info.hex;
  ctx.shadowBlur = 18;
  ctx.fillStyle = info.hex;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(11,16,32,0.55)";
  ctx.beginPath();
  ctx.ellipse(0, 2, rx * 0.82, ry * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  // 귀깃
  ctx.fillStyle = info.hex;
  tri(ctx, -rx * 0.55, -ry * 0.7, -rx * 0.25, -ry * 1.5, -rx * 0.05, -ry * 0.7);
  tri(ctx, rx * 0.55, -ry * 0.7, rx * 0.25, -ry * 1.5, rx * 0.05, -ry * 0.7);
  // 눈
  ctx.fillStyle = "#0b1020";
  circle(ctx, -rx * 0.28, -ry * 0.15, rx * 0.28);
  circle(ctx, rx * 0.28, -ry * 0.15, rx * 0.28);
  ctx.fillStyle = "#FFE6A6";
  circle(ctx, -rx * 0.26, -ry * 0.15, rx * 0.13);
  circle(ctx, rx * 0.26, -ry * 0.15, rx * 0.13);
  // 부리
  ctx.fillStyle = "#FFB020";
  tri(ctx, rx * 0.72, 0, rx * 1.18, ry * 0.18, rx * 0.72, ry * 0.36);
  // 꼬리 도형 (색+도형 병기)
  drawShape(ctx, info.shape, -rx * 1.05, ry * 0.2, rx * 0.3, info.hex);
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, g: Game): void {
  for (const p of g.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.r, p.r);
  }
  ctx.globalAlpha = 1;
}

export function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: "circle" | "square" | "triangle",
  cx: number,
  cy: number,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (shape === "circle") ctx.arc(cx, cy, r, 0, Math.PI * 2);
  else if (shape === "square") ctx.rect(cx - r, cy - r, r * 2, r * 2);
  else {
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy + r * 0.85);
    ctx.lineTo(cx - r, cy + r * 0.85);
    ctx.closePath();
  }
  ctx.fill();
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, stroke: boolean): void {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.fill();
  if (stroke) ctx.stroke();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function tri(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.fill();
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function mod(v: number, m: number): number {
  return ((v % m) + m) % m;
}

export type { SizeKey, Color };
