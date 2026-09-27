// 2.0 연출 — 레이저 · 미사일 · 튀어나오는 점수 · 구역 · 화면 효과 (렌더 전용, 로직 없음)
import { font } from "@/games/core/canvas";
import { CFG } from "../config";
import type { ZoneKind } from "../types";
import type { Game } from "./game";
import { laserCountdown, laserState } from "./hazards";
import { drawSprite, spr, type SpriteName } from "./assets";

const W = CFG.view.w;
const H = CFG.view.h;
const OWL_X = CFG.physics.owlX;

/* ───────────────────────── 구역 ───────────────────────── */

export function drawZone(ctx: CanvasRenderingContext2D, g: Game, kind: ZoneKind, x: number, w: number): void {
  ctx.save();
  if (kind === "wave" && spr("wave-zone")) {
    // 리소스 시트 파동 구역 — 보라 물결 띠가 흐른다
    const img = spr("wave-zone")!;
    const th = 46;
    const tw = (img.width / img.height) * th;
    for (let row = 0; row < 4; row++) {
      const y = 60 + row * 140 + Math.sin(g.time * 3 + row) * 8;
      const shift = ((g.time * 90 + row * 40) % tw) - tw;
      ctx.globalAlpha = 0.32;
      for (let px = Math.max(x, -tw) + shift; px < Math.min(x + w, W + tw); px += tw) {
        ctx.drawImage(img, px, y - th / 2, tw, th);
      }
    }
    ctx.globalAlpha = 1;
  } else if (kind === "wave") {
    // 물결 무늬
    ctx.strokeStyle = "rgba(61,217,235,0.18)";
    ctx.lineWidth = 2;
    for (let row = 0; row < 7; row++) {
      ctx.beginPath();
      const y0 = 50 + row * 72;
      for (let px = Math.max(x, -20); px <= Math.min(x + w, W + 20); px += 16) {
        const y = y0 + Math.sin(px * 0.03 + g.time * 4 + row) * 10;
        if (px === Math.max(x, -20)) ctx.moveTo(px, y);
        else ctx.lineTo(px, y);
      }
      ctx.stroke();
    }
  } else {
    // 중력 반전 — 보라 띠 + 위 화살표
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "rgba(168,85,247,0.22)");
    grd.addColorStop(1, "rgba(168,85,247,0.04)");
    ctx.fillStyle = grd;
    ctx.fillRect(x, 0, w, H);
    ctx.strokeStyle = "rgba(205,168,255,0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
    ctx.fillStyle = "rgba(205,168,255,0.5)";
    ctx.font = font(900, 26);
    ctx.textAlign = "center";
    const label = kind === "flip" ? "↑" : "⇅";
    for (let px = x + 60; px < x + w; px += 180) {
      for (let py = 90; py < H; py += 150) {
        ctx.fillText(label, px, py - ((g.time * 60) % 40));
      }
    }
  }
  ctx.restore();
}

/* ───────────────────────── 레이저 · 미사일 ───────────────────────── */

export function drawHazards(ctx: CanvasRenderingContext2D, g: Game, reduced: boolean): void {
  for (const l of g.lasers) {
    const st = laserState(l);
    if (st === "done") continue;
    ctx.save();
    if (st === "fire") {
      // 발사 — 굵고 하얀 심 + 붉은 발광
      const jitter = reduced ? 0 : (Math.random() - 0.5) * 3;
      ctx.lineCap = "round";
      ctx.shadowColor = "#FF4D4D";
      ctx.shadowBlur = 30;
      ctx.strokeStyle = l.big ? "rgba(255,60,60,0.8)" : "rgba(255,77,77,0.9)";
      ctx.lineWidth = l.thick;
      ctx.beginPath();
      ctx.moveTo(l.x1, l.y1 + jitter);
      ctx.lineTo(l.x2, l.y2 + jitter);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,245,245,0.95)";
      ctx.lineWidth = Math.max(4, l.thick * 0.3);
      ctx.beginPath();
      ctx.moveTo(l.x1, l.y1 + jitter);
      ctx.lineTo(l.x2, l.y2 + jitter);
      ctx.stroke();
    } else {
      // 경고 — 반투명 띠 + 깜빡이는 가장자리 선, 발사가 가까울수록 빨라진다
      const left = laserCountdown(l);
      const waiting = st === "wait";
      const blink = Math.floor(g.time * (left < 0.6 ? 16 : 7)) % 2 === 0;
      ctx.globalAlpha = waiting ? 0.35 : 1;
      ctx.strokeStyle = "rgba(255,77,77,0.14)";
      ctx.lineWidth = l.thick;
      ctx.beginPath();
      ctx.moveTo(l.x1, l.y1);
      ctx.lineTo(l.x2, l.y2);
      ctx.stroke();
      ctx.strokeStyle = blink ? "rgba(255,77,77,0.95)" : "rgba(255,77,77,0.45)";
      ctx.lineWidth = 2;
      ctx.setLineDash([14, 10]);
      ctx.lineDashOffset = -g.time * 120;
      ctx.beginPath();
      ctx.moveTo(l.x1, l.y1);
      ctx.lineTo(l.x2, l.y2);
      ctx.stroke();
      ctx.setLineDash([]);
      // 오른쪽 끝: 카운트다운 · 폭격 순번
      const ex = Math.min(W - 28, Math.max(l.x1, l.x2) - 30);
      const ey = l.x1 > l.x2 ? l.y1 : l.y2;
      if (ey > 10 && ey < H - 10 && !l.big) {
        ctx.fillStyle = "#FF4D4D";
        ctx.font = font(900, 18);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(l.order ? `${l.order}` : `${Math.ceil(left * 2)}`, ex, ey);
        ctx.font = font(900, 11);
        ctx.fillText("⚠", ex - 22, ey);
      }
    }
    ctx.restore();
  }

  for (const m of g.missiles) {
    ctx.save();
    if (m.state === "lock") {
      if (m.t < m.delay) {
        ctx.restore();
        continue;
      }
      // LOCK ON 조준경 — 조준이 고정되면(피할 순간) 빨갛게 멈춘다
      const k = m.t - m.delay;
      const frozen = k >= CFG.missile.lockSec - CFG.missile.freezeSec;
      const r = 34 - Math.min(1, k / CFG.missile.lockSec) * 12;
      const color = frozen ? "#FF4D4D" : "#FFB020";
      ctx.translate(OWL_X, m.aimY);
      ctx.fillStyle = color;
      ctx.font = font(900, 11);
      ctx.textAlign = "center";
      ctx.fillText("LOCK ON", 0, -r - 10);
      ctx.rotate(frozen ? 0 : g.time * 3);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(r - 8, 0);
        ctx.lineTo(r + 8, 0);
        ctx.stroke();
      }
      ctx.restore();
      // 화면 오른쪽 가장자리 경고 화살표
      ctx.save();
      ctx.fillStyle = frozen ? "#FF4D4D" : "rgba(255,176,32,0.8)";
      ctx.beginPath();
      ctx.moveTo(W - 8, m.aimY);
      ctx.lineTo(W - 30, m.aimY - 14);
      ctx.lineTo(W - 30, m.aimY + 14);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      continue;
    }
    // 🚀 날아오는 미사일 — 리소스 시트 로켓 (코가 오른쪽 위 ≈ -35° → 왼쪽을 보게 돌린다) + 불꽃
    const tilt = Math.max(-0.35, Math.min(0.35, (g.y - m.y) * 0.004));
    if (spr("missile")) {
      ctx.translate(m.x, m.y);
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i ? "rgba(255,210,122,0.5)" : "rgba(255,120,60,0.55)";
        ctx.beginPath();
        ctx.arc(18 + i * 9 + Math.random() * 4, (Math.random() - 0.5) * 6, 6 - i * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      drawSprite(ctx, "missile", m.x, m.y, 40, { rot: ((215 * Math.PI) / 180) - tilt });
      continue;
    }
    ctx.translate(m.x, m.y);
    const flame = 14 + Math.random() * 10;
    ctx.fillStyle = "rgba(255,176,32,0.9)";
    ctx.beginPath();
    ctx.moveTo(14, -5);
    ctx.lineTo(14 + flame, 0);
    ctx.lineTo(14, 5);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = "#FF5C7A";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#E9EDFB";
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(-6, -7);
    ctx.lineTo(14, -7);
    ctx.lineTo(14, 7);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#FF5C7A";
    ctx.fillRect(4, -7, 5, 14);
    ctx.restore();
  }
}

/* ───────────────────────── 튀어나오는 점수 ───────────────────────── */

export function drawPopups(ctx: CanvasRenderingContext2D, g: Game): void {
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  for (const p of g.popups) {
    const k = p.life / p.max;
    // 처음 0.12초 동안 튀어 오르듯 커진다
    const age = p.max - p.life;
    const pop = age < 0.12 ? 0.6 + (age / 0.12) * 0.6 : 1.2 - Math.min(0.2, (age - 0.12) * 1.2);
    if (p.art && drawArtPopup(ctx, p, k, age)) continue;
    const size = (p.big ? 20 : 14) * pop;
    ctx.globalAlpha = Math.min(1, k * 2.2);
    ctx.font = font(900, size);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(6,9,15,0.85)";
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = p.color;
    if (p.big) {
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
    }
    ctx.fillText(p.text, p.x, p.y);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

const ART: Record<NonNullable<Game["popups"][number]["art"]>, SpriteName> = {
  perfect: "text-perfect",
  near: "text-near",
  combo: "text-combo",
  fever: "text-fever",
};

/**
 * 문구 그림 팝업 — 0 → 1.35 → 1 로 튕기며 커지고, 살짝 흔들리다 위로 흩어진다.
 * 뒤에 같은 색 빛 번짐 + 첫 순간 흰 섬광. COMBO 는 그림 옆에 ×n 을 같은 결로 쓴다.
 */
function drawArtPopup(ctx: CanvasRenderingContext2D, p: Game["popups"][number], k: number, age: number): boolean {
  const name = ART[p.art!];
  const img = spr(name);
  if (!img) return false;
  const t = Math.min(1, age / 0.18);
  const bounce = t < 1 ? 1.35 * Math.sin((t * Math.PI) / 2) : 1 + 0.35 * Math.max(0, 1 - (age - 0.18) * 6);
  const scale = Math.max(0.2, bounce);
  const rot = Math.sin(age * 22) * 0.1 * Math.max(0, 1 - age * 2.2);
  const h = 30 * scale;
  const w = (img.width / img.height) * h;
  const cx = p.x + w / 2;
  ctx.save();
  ctx.globalAlpha = Math.min(1, k * 2.4);
  // 빛 번짐
  ctx.globalCompositeOperation = "lighter";
  const glow = ctx.createRadialGradient(cx, p.y, 2, cx, p.y, w * 0.7);
  glow.addColorStop(0, `${p.color}66`);
  glow.addColorStop(1, `${p.color}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(cx - w, p.y - w * 0.6, w * 2, w * 1.2);
  ctx.globalCompositeOperation = "source-over";
  ctx.translate(cx, p.y);
  ctx.rotate(rot);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  // 첫 순간 흰 섬광
  if (age < 0.1) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = (1 - age / 0.1) * 0.7;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = Math.min(1, k * 2.4);
  }
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  if (p.art === "combo" && p.n) {
    const size = 24 * scale;
    ctx.font = font(900, size);
    ctx.textAlign = "left";
    const grd = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
    grd.addColorStop(0, "#FFE0F0");
    grd.addColorStop(0.5, "#FF5CA8");
    grd.addColorStop(1, "#C21E6B");
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#2a0616";
    ctx.strokeText(`×${p.n}`, w / 2 + 2, 1);
    ctx.fillStyle = grd;
    ctx.fillText(`×${p.n}`, w / 2 + 2, 1);
  }
  if (p.text) {
    ctx.font = font(900, 13);
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(6,9,15,0.85)";
    ctx.strokeText(p.text, 0, h / 2 + 9);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, 0, h / 2 + 9);
  }
  ctx.restore();
  return true;
}

/* ───────────────────────── 화면 효과 ───────────────────────── */

export function drawOverlay(ctx: CanvasRenderingContext2D, g: Game, reduced: boolean): void {
  // 🟣 팬텀 월드 · 🔵 FREEZE · 🔥 FEVER — 화면 가장자리 색
  if (g.phantomWorldT > 0) edge(ctx, "168,85,247", 0.4);
  if (g.skill === "freeze") {
    ctx.fillStyle = "rgba(120,200,255,0.12)";
    ctx.fillRect(0, 0, W, H);
    edge(ctx, "170,235,255", 0.45);
  }
  if (g.feverT > 0) edge(ctx, "255,140,40", 0.35 + (reduced ? 0 : Math.sin(g.time * 10) * 0.08));

  // 🔴 LASER WARNING — 화면 전체가 붉게 맥동 + 3·2·1 FIRE!
  if (g.redAlert > 0) {
    const big = g.lasers.find((l) => l.big);
    const pulse = reduced ? 0.5 : 0.5 + Math.sin(g.time * 14) * 0.5;
    ctx.fillStyle = `rgba(255,40,40,${0.08 + pulse * 0.1})`;
    ctx.fillRect(0, 0, W, H);
    if (big) {
      const left = laserCountdown(big);
      const st = laserState(big);
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = font(900, st === "fire" ? 64 : 84);
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(6,9,15,0.8)";
      const text = st === "fire" ? "FIRE!" : `${Math.max(1, Math.ceil((left / big.warn) * 3))}`;
      ctx.strokeText(text, W / 2 + 80, H / 2);
      ctx.fillStyle = "#FF4D4D";
      ctx.fillText(text, W / 2 + 80, H / 2);
      ctx.restore();
    }
  }

  // ⚡ 터보 · 오버드라이브 — 리소스 시트 화살표가 화면을 가로질러 흐른다
  const arrows = spr("turbo-arrows");
  if (arrows && (g.turboT > 0 || g.overdrive) && !reduced) {
    const th = 34;
    const tw = (arrows.width / arrows.height) * th;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const [lane, speed, a] of [
      [70, 1400, 0.35],
      [H - 70, 1700, 0.35],
      [H / 2, 1100, 0.14],
    ] as const) {
      const shift = (g.time * speed) % (tw * 2.2);
      ctx.globalAlpha = a;
      for (let x = W + tw - shift; x > -tw * 2; x -= tw * 2.2) ctx.drawImage(arrows, x, lane - th / 2, tw, th);
    }
    ctx.restore();
  }

  // 🔥 OVERDRIVE — 위아래 경고 띠
  if (g.overdrive) {
    ctx.save();
    const off = reduced ? 0 : (g.time * 160) % 40;
    for (const y of [0, H - 14]) {
      ctx.fillStyle = "rgba(255,92,50,0.85)";
      ctx.fillRect(0, y, W, 14);
      ctx.fillStyle = "rgba(6,9,15,0.7)";
      for (let x = -40 + off; x < W + 40; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 18, y);
        ctx.lineTo(x + 32, y + 14);
        ctx.lineTo(x + 14, y + 14);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ↕ 중력이 곧 바뀐다 — 부엉이 옆 큰 화살표
  if (g.gravWarn > 0 && Math.floor(g.time * 10) % 2 === 0) {
    ctx.save();
    ctx.fillStyle = "#CDA8FF";
    ctx.font = font(900, 34);
    ctx.textAlign = "center";
    ctx.fillText(g.gravNext === -1 ? "⬆" : "⬇", OWL_X - 60, g.y + 12);
    ctx.restore();
  }

  // 🌪 폭풍 — 바람 방향 화살표
  if (g.windT > 0) {
    ctx.save();
    ctx.strokeStyle = "rgba(200,220,255,0.35)";
    ctx.lineWidth = 2;
    const dir = Math.sign(g.wind) || 1;
    for (let i = 0; i < 18; i++) {
      const x = (i * 131 + g.time * 900) % (W + 100) - 50;
      const y = ((i * 71 + g.time * 300 * dir) % H + H) % H;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 40, y - dir * 18);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(200,220,255,0.8)";
    ctx.font = font(900, 30);
    ctx.textAlign = "center";
    ctx.fillText(dir > 0 ? "⇩" : "⇧", OWL_X, dir > 0 ? H - 30 : 40);
    ctx.restore();
  }
}

function edge(ctx: CanvasRenderingContext2D, rgb: string, a: number): void {
  const grd = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
  grd.addColorStop(0, `rgba(${rgb},0)`);
  grd.addColorStop(1, `rgba(${rgb},${a})`);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);
}

/**
 * 📺 SCREEN GLITCH — 화면 조각을 옆으로 어긋나게 복사한다 (보이는 것만, 판정은 그대로).
 * 캔버스 픽셀 좌표에서 동작하므로 index.tsx 가 변환을 초기화한 뒤 부른다.
 */
export function applyGlitch(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, g: Game): void {
  if (g.glitchT <= 0) return;
  const cw = canvas.width;
  const ch = canvas.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const slices = 5 + Math.floor(Math.random() * 5);
  for (let i = 0; i < slices; i++) {
    const h = Math.max(4, Math.floor(ch * (0.02 + Math.random() * 0.07)));
    const y = Math.floor(Math.random() * (ch - h));
    const dx = Math.floor((Math.random() - 0.5) * cw * 0.08);
    ctx.drawImage(canvas, 0, y, cw, h, dx, y, cw, h);
  }
  // 색 번짐 띠
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,0,80,0.12)" : "rgba(0,220,255,0.12)";
  ctx.fillRect(0, Math.random() * ch, cw, ch * 0.05);
  ctx.restore();
}
