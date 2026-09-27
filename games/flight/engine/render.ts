// 렌더 — 레이어: 배경(패럴랙스) → 스피드라인 → 장애물 → 아이템 → 부엉이 → 파티클 → 화면 효과
// 로직은 game.ts에만 있고 여기서는 상태를 읽어 그리기만 한다 (기획서 §14).
//
// 장애물 모티브: 파이프 벽(플래피/마리오) · 전격 자퍼(젯팩 조이라이드) · 벽돌 블록(마리오) ·
//               ? 블록(마리오) · 가시 테두리(지오메트리 대시) · 드론(슈팅류)
import { CFG, COLOR_INFO, type Color, type SizeKey } from "../config";
import type { Entity, ItemKind } from "../types";
import { drawAdditive, texturePattern, tinted } from "./assets";
import { BEAM_W, bugY, gapCenter, SHIFT_SEC } from "./collision";
import { spriteRadius } from "./owl";
import { gateColor, gateGlitching, isBreaker, isPhantom, type Game } from "./game";
import { drawHazards, drawOverlay, drawPopups, drawZone } from "./overlay";
import {
  drawBackdrop,
  drawClouds,
  drawItemSprite,
  drawMoon,
  drawOwlSprite,
  drawOwlTrail,
  drawPickups,
  drawStoneBand,
  drawStoneWall,
  drawSwap,
} from "./sprites";
import { drawSprite } from "./assets";
import type { Fx } from "./fx";
import type { SpawnedEntity } from "./spawner";

const W = CFG.view.w;
const H = CFG.view.h;
const OWL_X = CFG.physics.owlX;

/** 버프류는 ? 블록 안에 들어 있다 (마리오 모티브) */
const MYSTERY: ItemKind[] = ["shield", "rainbow", "efficiency"];

const STARS = Array.from({ length: 70 }, (_, i) => ({
  x: (i * 173) % W,
  y: (i * 97) % (H - 140),
  r: (i % 3) * 0.6 + 0.8,
}));

const SKYLINE_FAR = Array.from({ length: 30 }, (_, i) => ({
  x: i * 120,
  w: 70 + ((i * 41) % 60),
  h: 90 + ((i * 67) % 150),
}));

const CITY = Array.from({ length: 26 }, (_, i) => ({
  x: i * 92,
  w: 54 + ((i * 37) % 46),
  h: 70 + ((i * 53) % 130),
  lights: (i * 7) % 6,
}));

const FOREGROUND = Array.from({ length: 14 }, (_, i) => ({
  x: i * 190,
  w: 22 + ((i * 29) % 26),
  h: 46 + ((i * 83) % 70),
}));

export function render(ctx: CanvasRenderingContext2D, g: Game, fx: Fx, reducedMotion: boolean): void {
  // 팬텀 월드는 어두운 배경 + 윤곽 발광 (옛 NIGHT FLIGHT 연출을 재활용)
  const night = g.phantomWorldT > 0;
  ctx.save();
  // 그림을 줄여 그릴 때 계단·뭉개짐이 없게
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // 🌊 파동 — 화면 자체가 출렁인다
  if (g.wave > 0.02 && !reducedMotion) {
    ctx.translate(W / 2, H / 2);
    ctx.rotate(Math.sin(g.time * 2.3) * 0.014 * g.wave);
    ctx.translate(-W / 2, -H / 2 + Math.sin(g.time * 5.5) * 7 * g.wave);
  }

  // 터보 줌 + 흔들림
  if (fx.zoom !== 1) {
    ctx.translate(OWL_X, H / 2);
    ctx.scale(fx.zoom, fx.zoom);
    ctx.translate(-OWL_X, -H / 2);
  }
  if (g.shake > 0 && !reducedMotion) {
    const s = g.shake * 10;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  }

  drawBackground(ctx, g, fx, night);
  drawSpeedLines(ctx, fx, night);

  for (const s of g.spawner.entities) {
    if (s.gone || s.e.t !== "zone") continue;
    const x = s.x - g.worldX;
    if (x > W + 90 || x + s.w < -90) continue;
    drawZone(ctx, g, s.e.kind, x, s.w);
  }
  for (const s of g.spawner.entities) {
    if (s.gone || s.e.t === "zone" || s.e.t === "trigger") continue;
    const x = s.x - g.worldX;
    if (x > W + 90 || x + s.w < -90) continue;
    if (s.e.t === "item") drawItem(ctx, s, x, g.time, night);
    else drawObstacle(ctx, g, s, x, night);
  }

  drawHazards(ctx, g, reducedMotion);
  drawOwl(ctx, g, fx);
  drawSwap(ctx, g);
  drawPickups(ctx, g);
  drawParticles(ctx, g);
  drawDust(ctx, fx);
  drawTurboRings(ctx, g, fx);
  drawPopups(ctx, g);
  ctx.restore();

  drawScreenEffects(ctx, g, fx, reducedMotion);
  drawOverlay(ctx, g, reducedMotion);
}

/* ───────────────────────── 배경 ───────────────────────── */

function drawBackground(ctx: CanvasRenderingContext2D, g: Game, fx: Fx, night: boolean): void {
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  if (night) {
    grd.addColorStop(0, "#03050c");
    grd.addColorStop(1, "#070b18");
  } else {
    grd.addColorStop(0, "#0a0e1e");
    grd.addColorStop(0.55, "#101733");
    grd.addColorStop(1, "#151d3a");
  }
  ctx.fillStyle = grd;
  ctx.fillRect(-60, -60, W + 120, H + 120);
  // 단계별 하늘 (리소스 시트 "배경 & 환경") — 단계가 바뀌면 천천히 겹쳐 바뀐다
  drawBackdrop(ctx, g, fx, night);

  // 별
  ctx.fillStyle = night ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.55)";
  for (const s of STARS) {
    const x = mod(s.x - g.worldX * 0.05, W + 40);
    ctx.fillRect(x - 20, s.y, s.r, s.r);
  }

  // 달 (그림이 있으면 그림)
  if (!night && !drawMoon(ctx)) {
    ctx.save();
    ctx.shadowColor = "rgba(255,226,170,0.55)";
    ctx.shadowBlur = 40;
    ctx.fillStyle = "rgba(255,232,190,0.95)";
    ctx.beginPath();
    ctx.arc(W - 130, 86, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#0a0e1e";
    ctx.beginPath();
    ctx.arc(W - 148, 74, 30, 0, Math.PI * 2);
    ctx.fill();
  }
  if (!night) drawClouds(ctx, g);

  // 먼 스카이라인
  ctx.fillStyle = night ? "#060a15" : "#0c1226";
  for (const b of SKYLINE_FAR) {
    const x = mod(b.x - g.worldX * 0.1, SKYLINE_FAR.length * 120) - 60;
    if (x > W + 80) continue;
    ctx.fillRect(x, H - 90 - b.h, b.w, b.h + 90);
  }

  // 가까운 도시 + 창문
  for (const b of CITY) {
    const x = mod(b.x - g.worldX * 0.24, CITY.length * 92) - 60;
    if (x > W + 80) continue;
    const y = H - b.h;
    ctx.fillStyle = night ? "#080d1c" : "#0f1730";
    ctx.fillRect(x, y, b.w, b.h);
    ctx.fillStyle = night ? "rgba(255,176,32,0.14)" : "rgba(255,176,32,0.3)";
    for (let i = 0; i < b.lights; i++) {
      ctx.fillRect(x + 10 + (i % 3) * 16, y + 14 + Math.floor(i / 3) * 20, 7, 9);
    }
  }

  // 전경 실루엣 (빠르게 지나가서 속도감을 만든다)
  ctx.fillStyle = night ? "#04070f" : "#070b16";
  for (const f of FOREGROUND) {
    const x = mod(f.x - g.worldX * 0.62, FOREGROUND.length * 190) - 80;
    if (x > W + 60) continue;
    ctx.fillRect(x, H - f.h, f.w, f.h);
  }

  // 바닥 라인 + 대시 (속도에 비례해 빠르게 흐른다)
  ctx.strokeStyle = "rgba(61,217,235,0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-40, H - 1);
  ctx.lineTo(W + 40, H - 1);
  ctx.stroke();
  ctx.fillStyle = `rgba(61,217,235,${0.12 + fx.speedT * 0.22})`;
  const dashW = 34 + fx.speedT * 46;
  for (let x = -mod(g.worldX * 0.9, 70); x < W + 70; x += 70) ctx.fillRect(x, H - 9, dashW, 3);
}

function drawSpeedLines(ctx: CanvasRenderingContext2D, fx: Fx, night: boolean): void {
  if (!fx.lines.length) return;
  ctx.save();
  ctx.lineCap = "round";
  const trace = tinted("trace", night ? "#7EE8FF" : "#B4CDFF", 128);
  for (const l of fx.lines) {
    if (trace && l.w > 1) {
      drawAdditive(ctx, trace, l.x + l.len / 2, l.y, l.len, 14, l.a * 0.9);
      continue;
    }
    const grad = ctx.createLinearGradient(l.x, 0, l.x + l.len, 0);
    const c = night ? "126,232,255" : "180,205,255";
    grad.addColorStop(0, `rgba(${c},0)`);
    grad.addColorStop(0.5, `rgba(${c},${l.a})`);
    grad.addColorStop(1, `rgba(${c},0)`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = l.w;
    ctx.beginPath();
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(l.x + l.len, l.y);
    ctx.stroke();
  }
  ctx.restore();
}

/* ───────────────────────── 장애물 ───────────────────────── */

function drawObstacle(ctx: CanvasRenderingContext2D, g: Game, s: SpawnedEntity, x: number, night: boolean): void {
  const e = s.e as Entity;
  switch (e.t) {
    case "pillar": {
      const top = e.gapY - e.gapH / 2;
      const bottom = e.gapY + e.gapH / 2;
      const w = CFG.entity.pillarW;
      if (top > -10) drawPipeWall(ctx, x, -30, w, top + 30, "down", night);
      if (bottom < H + 10) drawPipeWall(ctx, x, bottom, w, H - bottom + 30, "up", night);
      break;
    }
    case "wire":
      drawZapper(ctx, x, e.y, e.w, g.time, night);
      break;
    case "gate": {
      const glitching = gateGlitching(s, x, g.scroll);
      drawGate(ctx, s, x, e.y, e.h, gateColor(s, x, g.scroll), g.time, glitching);
      break;
    }
    case "narrow":
      drawTube(ctx, x, e.y, e.w, e.h, night);
      break;
    case "wall":
      drawBrickWall(ctx, x, e.y, CFG.entity.wallW, e.h, night);
      break;
    case "bug": {
      const by = bugY(e, (OWL_X + g.worldX - s.chunkX) / s.chunkScroll);
      // 회전하는 가시 톱니 (리소스 시트) — 없으면 순찰 드론
      if (!drawSprite(ctx, "saw", x + CFG.entity.bugR, by, CFG.entity.bugR * 2.9, { rot: g.time * 7 })) {
        drawDrone(ctx, x + CFG.entity.bugR, by, g.time, night);
      }
      break;
    }
    case "mover":
    case "shifter": {
      const t = (OWL_X + g.worldX - s.chunkX) / s.chunkScroll;
      const gapY = gapCenter(e, t);
      const top = gapY - e.gapH / 2;
      const bottom = gapY + e.gapH / 2;
      const w = CFG.entity.pillarW;
      drawPipeWall(ctx, x, -30, w, top + 30, "down", night, e.t === "shifter");
      drawPipeWall(ctx, x, bottom, w, H - bottom + 30, "up", night, e.t === "shifter");
      // 움직이는 벽 — 궤도 점선 / 가짜 틈 — 바뀌기 직전 붉게 깜빡이며 방향을 알려준다
      ctx.save();
      if (e.t === "mover") {
        ctx.strokeStyle = "rgba(255,210,122,0.8)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x + w / 2, e.gapY0 - e.gapH / 2);
        ctx.lineTo(x + w / 2, e.gapY1 + e.gapH / 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        const until = e.switchT - t;
        if (until > -SHIFT_SEC && until < 0.6 && Math.floor(g.time * 14) % 2 === 0) {
          ctx.fillStyle = "rgba(255,77,77,0.35)";
          ctx.fillRect(x - 6, -10, w + 12, H + 20);
          ctx.fillStyle = "#FF4D4D";
          ctx.font = "900 22px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(e.gapB < e.gapA ? "▲" : "▼", x + w / 2, gapY + 8);
        }
      }
      ctx.restore();
      break;
    }
    case "beam":
      drawBeam(ctx, x, e.y0, e.y1, g.time, x < OWL_X + g.scroll * 1.0);
      break;
    default:
      break;
  }
}

/** 세로 레이저 기둥 — 멀리서는 점선 경고, 가까워지면 켜진다 */
function drawBeam(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, time: number, lit: boolean): void {
  ctx.save();
  const cx = x + BEAM_W / 2;
  // 양 끝 발사기
  ctx.fillStyle = "#3a1830";
  ctx.strokeStyle = "#FF4D4D";
  ctx.lineWidth = 2;
  for (const y of [y0, y1]) {
    if (y <= 0 || y >= H) continue;
    ctx.beginPath();
    ctx.rect(cx - 14, y - 8, 28, 16);
    ctx.fill();
    ctx.stroke();
  }
  if (lit) {
    ctx.shadowColor = "#FF4D4D";
    ctx.shadowBlur = 24;
    ctx.fillStyle = "rgba(255,77,77,0.85)";
    ctx.fillRect(cx - BEAM_W / 2, y0, BEAM_W, y1 - y0);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,240,240,0.95)";
    ctx.fillRect(cx - 2 + Math.sin(time * 60) * 1.5, y0, 4, y1 - y0);
  } else {
    ctx.strokeStyle = Math.floor(time * 8) % 2 ? "rgba(255,77,77,0.9)" : "rgba(255,77,77,0.4)";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(cx, y0);
    ctx.lineTo(cx, y1);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/** 파이프형 벽 — 몸통(벽돌 패턴) + 입구 캡 + 네온 림 + 톱니 테두리 */
function drawPipeWall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  mouth: "up" | "down",
  night: boolean,
  glitch = false,
): void {
  // 리소스 시트 돌벽이 있으면 그걸로
  if (drawStoneWall(ctx, x, y, w, h, mouth, night, glitch)) return;
  ctx.save();
  // 몸통
  const body = ctx.createLinearGradient(x, 0, x + w, 0);
  if (night) {
    body.addColorStop(0, "rgba(8,14,28,0.85)");
    body.addColorStop(1, "rgba(8,14,28,0.85)");
  } else {
    body.addColorStop(0, "#28345e");
    body.addColorStop(0.35, "#1b2547");
    body.addColorStop(1, "#131b38");
  }
  ctx.fillStyle = body;
  ctx.fillRect(x, y, w, h);

  // 외부 CC0 패널 텍스처 (Kenney prototype textures)
  const panel = texturePattern(ctx, "panel", 128);
  if (panel) {
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = night ? 0.25 : 0.55;
    ctx.translate(x, y);
    ctx.fillStyle = panel;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // 벽돌 패턴
  ctx.strokeStyle = night ? "rgba(126,232,255,0.16)" : "rgba(160,190,255,0.10)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let by = y + 22; by < y + h; by += 22) {
    ctx.moveTo(x + 2, by);
    ctx.lineTo(x + w - 2, by);
  }
  let row = 0;
  for (let by = y; by < y + h; by += 22, row++) {
    const sx = x + (row % 2 ? w / 2 : 0);
    ctx.moveTo(sx, by);
    ctx.lineTo(sx, Math.min(by + 22, y + h));
  }
  ctx.stroke();

  // 좌우 베벨
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(x + 2, y, 3, h);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(x + w - 5, y, 3, h);

  // 외곽선
  ctx.strokeStyle = night ? "#7FE8FF" : "rgba(61,217,235,0.45)";
  ctx.lineWidth = night ? 2.5 : 1.5;
  if (night) {
    ctx.shadowColor = "#7FE8FF";
    ctx.shadowBlur = 14;
  }
  ctx.strokeRect(x, y, w, h);
  ctx.shadowBlur = 0;

  // 입구 캡 (플래피·마리오 파이프)
  const capH = 20;
  const capY = mouth === "down" ? y + h - capH : y;
  const capX = x - 8;
  const capW = w + 16;
  const cap = ctx.createLinearGradient(capX, 0, capX + capW, 0);
  cap.addColorStop(0, night ? "rgba(12,20,38,0.9)" : "#33406f");
  cap.addColorStop(0.4, night ? "rgba(12,20,38,0.9)" : "#242f57");
  cap.addColorStop(1, night ? "rgba(12,20,38,0.9)" : "#1a2244");
  ctx.fillStyle = cap;
  ctx.fillRect(capX, capY, capW, capH);
  ctx.strokeStyle = night ? "#7FE8FF" : "rgba(61,217,235,0.5)";
  ctx.strokeRect(capX, capY, capW, capH);

  // 입구 쪽 네온 림 + 톱니(지오메트리 대시 모티브 — 실루엣은 그대로 유지)
  const rimY = mouth === "down" ? capY + capH : capY;
  ctx.strokeStyle = "#FFB020";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#FFB020";
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.moveTo(capX + 2, rimY + (mouth === "down" ? -1.5 : 1.5));
  ctx.lineTo(capX + capW - 2, rimY + (mouth === "down" ? -1.5 : 1.5));
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 가로등 불빛 — 외부 CC0 라이트 마스크
  const cone = tinted("cone", "#FFB020", 256);
  if (cone) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = night ? 0.22 : 0.38;
    ctx.translate(capX + capW / 2, rimY);
    if (mouth === "up") ctx.rotate(Math.PI);
    ctx.drawImage(cone, -70, 0, 140, 150);
    ctx.restore();
  }

  ctx.fillStyle = "rgba(255,176,32,0.55)";
  const teeth = 5;
  const tw = capW / teeth;
  for (let i = 0; i < teeth; i++) {
    const tx = capX + i * tw;
    ctx.beginPath();
    if (mouth === "down") {
      ctx.moveTo(tx + 2, rimY - 1);
      ctx.lineTo(tx + tw / 2, rimY - 11);
      ctx.lineTo(tx + tw - 2, rimY - 1);
    } else {
      ctx.moveTo(tx + 2, rimY + 1);
      ctx.lineTo(tx + tw / 2, rimY + 11);
      ctx.lineTo(tx + tw - 2, rimY + 1);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** 전격 자퍼 (젯팩 조이라이드 모티브) — 양끝 노드 + 지지직거리는 빔 */
function drawZapper(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, time: number, night: boolean): void {
  ctx.save();
  // 노드
  for (const nx of [x, x + w]) {
    ctx.fillStyle = night ? "rgba(12,20,38,0.9)" : "#2a3350";
    ctx.strokeStyle = "rgba(255,176,32,0.8)";
    ctx.lineWidth = 2;
    rr(ctx, nx - 7, y - 13, 14, 26, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#FF5C7A";
    ctx.beginPath();
    ctx.arc(nx, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // 빔 (프레임마다 지글거리는 폴리라인)
  const seg = Math.max(3, Math.round(w / 26));
  const pts: [number, number][] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const jitter = i === 0 || i === seg ? 0 : Math.sin(time * 40 + i * 2.7) * 5 + (Math.random() - 0.5) * 3;
    pts.push([x + w * t, y + jitter]);
  }
  const stroke = (color: string, width: number, blur: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke();
  };
  stroke("rgba(61,217,235,0.45)", 9, 18);
  stroke("#9BEBFF", 3.5, 12);
  stroke("#FFFFFF", 1.5, 0);
  ctx.restore();
}

/** S 전용 통로 — 위아래 파이프 띠 + 개구부 (마리오 파이프 모티브) */
function drawTube(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, night: boolean): void {
  const band = CFG.entity.narrowBand;
  if (drawStoneBand(ctx, x, y - band, w, band) && drawStoneBand(ctx, x, y + h, w, band)) {
    // S 전용 틈 — 초록 안내 빛
    ctx.save();
    ctx.fillStyle = "rgba(107,240,160,0.12)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(107,240,160,0.7)";
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    ctx.fillStyle = "#6BF0A0";
    ctx.font = "900 14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("S", x + 14, y + h / 2 + 5);
    ctx.restore();
    return;
  }
  ctx.save();
  for (const [by, mouth] of [
    [y - band, "down"],
    [y + h, "up"],
  ] as const) {
    const grad = ctx.createLinearGradient(0, by, 0, by + band);
    if (night) {
      grad.addColorStop(0, "rgba(8,20,16,0.85)");
      grad.addColorStop(1, "rgba(8,20,16,0.85)");
    } else {
      grad.addColorStop(0, "#1d5a44");
      grad.addColorStop(0.5, "#14402f");
      grad.addColorStop(1, "#0e2f23");
    }
    ctx.fillStyle = grad;
    ctx.fillRect(x, by, w, band);
    ctx.strokeStyle = "rgba(107,240,160,0.65)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, by, w, band);
    // 개구부 쪽 립
    const lipY = mouth === "down" ? by + band - 9 : by;
    ctx.fillStyle = "rgba(107,240,160,0.25)";
    ctx.fillRect(x - 5, lipY, w + 10, 9);
    ctx.strokeRect(x - 5, lipY, w + 10, 9);
  }

  // 통로
  ctx.setLineDash([9, 7]);
  ctx.strokeStyle = "#6BF0A0";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#6BF0A0";
  ctx.shadowBlur = 12;
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#6BF0A0";
  ctx.font = "800 20px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("S", x + w / 2, y + h / 2 + 7);
  ctx.restore();
}

/** L 전용 파괴 벽 — 벽돌 블록 (마리오 모티브) */
function drawBrickWall(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, night: boolean): void {
  ctx.save();
  ctx.fillStyle = night ? "rgba(26,14,10,0.85)" : "#6b3c26";
  ctx.fillRect(x, y, w, h);
  const rough = texturePattern(ctx, "panelRough", 96);
  if (rough) {
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = 0.5;
    ctx.translate(x, y);
    ctx.fillStyle = rough;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  // 벽돌
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  let row = 0;
  for (let by = y; by < y + h; by += 18, row++) {
    ctx.moveTo(x, by);
    ctx.lineTo(x + w, by);
    const sx = x + (row % 2 ? w / 2 : 0);
    ctx.moveTo(sx, by);
    ctx.lineTo(sx, Math.min(by + 18, y + h));
  }
  ctx.stroke();
  // 하이라이트 + 균열
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(x + 2, y + 2, w - 4, 3);
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.3, y + h * 0.2);
  ctx.lineTo(x + w * 0.55, y + h * 0.42);
  ctx.lineTo(x + w * 0.38, y + h * 0.62);
  ctx.lineTo(x + w * 0.62, y + h * 0.85);
  ctx.stroke();
  // 테두리 + L 배지
  ctx.strokeStyle = "#CDA8FF";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#CDA8FF";
  ctx.shadowBlur = night ? 14 : 8;
  ctx.strokeRect(x, y, w, h);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(11,16,32,0.75)";
  rr(ctx, x + w / 2 - 13, y + h / 2 - 13, 26, 26, 6);
  ctx.fill();
  ctx.strokeStyle = "#CDA8FF";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#CDA8FF";
  ctx.font = "800 17px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("L", x + w / 2, y + h / 2 + 6);
  ctx.restore();
}

/** 색 게이트 — 색 면 + 큰 도형 실루엣 + 스캔 셔머 */
function drawGate(
  ctx: CanvasRenderingContext2D,
  s: SpawnedEntity,
  x: number,
  y: number,
  h: number,
  color: Color,
  time: number,
  glitching = false,
): void {
  const info = COLOR_INFO[color];
  const w = CFG.entity.gateW;
  ctx.save();
  if (glitching) {
    // 글리치 — 조각이 어긋나고 GLITCH 가 번쩍인다 (진짜 색이 드러나기 직전)
    ctx.translate((Math.random() - 0.5) * 8, 0);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "900 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    if (Math.floor(time * 16) % 2 === 0) ctx.fillText("GLITCH", x + w / 2, y + 22);
  }
  ctx.fillStyle = hexA(info.hex, s.judged ? 0.08 : 0.2);
  ctx.fillRect(x, y, w, h);

  // 스캔 라인
  ctx.fillStyle = hexA(info.hex, 0.25);
  const scan = ((time * 120) % (h + 60)) - 30;
  ctx.fillRect(x, y + scan, w, 14);

  ctx.strokeStyle = info.hex;
  ctx.lineWidth = 3;
  ctx.shadowColor = info.hex;
  ctx.shadowBlur = 18;
  ctx.strokeRect(x, y, w, h);
  ctx.shadowBlur = 0;

  // 상·하 클램프
  ctx.fillStyle = info.hex;
  ctx.fillRect(x - 5, y - 6, w + 10, 6);
  ctx.fillRect(x - 5, y + h, w + 10, 6);

  ctx.globalAlpha = 0.9;
  const iconH = Math.min(46, h / 3) * 1.9;
  if (!drawSprite(ctx, `color-${color}`, x + w / 2, y + h / 2, iconH)) {
    drawShape(ctx, info.shape, x + w / 2, y + h / 2, Math.min(46, h / 3), info.hex);
  }
  if (glitching) drawSprite(ctx, "gate-fake", x + w / 2, y + h / 2, iconH * 1.2, { alpha: 0.85 });
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** 🐛 → 순찰 드론 */
function drawDrone(ctx: CanvasRenderingContext2D, cx: number, cy: number, time: number, night: boolean): void {
  const r = CFG.entity.bugR;
  ctx.save();
  ctx.translate(cx, cy);
  // 로터
  ctx.strokeStyle = "rgba(61,217,235,0.6)";
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * (r - 2), -4);
    ctx.lineTo(side * (r + 9), -10);
    ctx.stroke();
    ctx.beginPath();
    const a = time * 22 * side;
    ctx.ellipse(side * (r + 9), -10, 9, 2.5, a, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 몸체
  ctx.fillStyle = night ? "rgba(14,10,22,0.9)" : "#2b1f3f";
  ctx.strokeStyle = "#FF5C7A";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#FF5C7A";
  ctx.shadowBlur = night ? 16 : 10;
  rr(ctx, -r, -r + 2, r * 2, r * 1.7, 7);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  // 스캐너 아이
  const eye = 0.55 + 0.45 * Math.sin(time * 7);
  ctx.fillStyle = `rgba(255,92,122,${eye})`;
  ctx.beginPath();
  ctx.arc(0, 2, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ───────────────────────── 아이템 ───────────────────────── */

function drawItem(ctx: CanvasRenderingContext2D, s: SpawnedEntity, x: number, time: number, night: boolean): void {
  if (s.e.t !== "item") return;
  const kind = s.e.kind;
  const cx = x + CFG.entity.itemR;
  const cy = (s.fy ?? s.e.y) + (s.fy === undefined ? Math.sin(time * 3 + x * 0.02) * 4 : 0);
  ctx.save();

  // 리소스 시트 아이템 그림 (전설은 빛살을 먼저 깐다)
  if (kind === "rage" || kind === "phantom" || kind === "golden") drawLegendRays(ctx, cx, cy, time);
  if (drawItemSprite(ctx, kind, cx, cy, time)) {
    ctx.restore();
    return;
  }

  if (MYSTERY.includes(kind)) {
    drawMysteryBlock(ctx, cx, cy, time);
    ctx.restore();
    return;
  }

  // 전설 — 회전하는 빛살
  if (kind === "rage" || kind === "phantom" || kind === "crown" || kind === "golden") drawLegendRays(ctx, cx, cy, time);

  // 공통 후광 — 외부 CC0 파티클 텍스처
  const glowColor =
    kind === "gem" ? "#3DD9EB" : kind === "owlEnergy" ? "#9BEBFF" : kind === "phantom" ? "#CDA8FF" : "#FFE2AA";
  const glow = tinted("glow", glowColor, 128);
  if (glow) drawAdditive(ctx, glow, cx, cy, kind === "owlEnergy" ? 88 : 64, kind === "owlEnergy" ? 88 : 64, 0.55);

  switch (kind) {
    case "feather":
      drawFeather(ctx, cx, cy, 1, "#FFD27A");
      break;
    case "bigFeather":
      drawFeather(ctx, cx, cy, 1.45, "#FFB020");
      break;
    case "star":
      drawStar(ctx, cx, cy, 12, "#FFE08A");
      break;
    case "gem":
      drawGem(ctx, cx, cy, time);
      break;
    case "owlEnergy":
      drawOwlEnergy(ctx, cx, cy, time);
      break;
    case "grow":
      drawSizeOrb(ctx, cx, cy, "#6BF0A0", "+");
      break;
    case "shrink":
      drawSizeOrb(ctx, cx, cy, "#7FA6FF", "−");
      break;
    case "magnet":
      drawMagnet(ctx, cx, cy);
      break;
    case "double":
      drawBadge(ctx, cx, cy, "#FFB020", "×2");
      break;
    case "rage":
      drawBadge(ctx, cx, cy, "#FF4D4D", "🔥");
      break;
    case "phantom":
      drawBadge(ctx, cx, cy, "#A855F7", "👻");
      break;
    case "crown":
      drawBadge(ctx, cx, cy, "#FFB020", "👑");
      break;
    case "golden":
      drawGoldenOwl(ctx, cx, cy, time);
      break;
    default:
      break;
  }
  ctx.restore();
  void night;
}

/** 전설 아이템 뒤에서 도는 빛살 */
function drawLegendRays(ctx: CanvasRenderingContext2D, cx: number, cy: number, time: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(time * 1.6);
  ctx.fillStyle = "rgba(255,176,32,0.22)";
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-6, -40);
    ctx.lineTo(6, -40);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** 희귀·전설 아이템 배지 — 동그란 메달 + 글자/이모지 */
function drawBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string, label: string): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.fillStyle = "#0b1020";
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = /^[×0-9a-z]+$/i.test(label) ? "900 13px system-ui, sans-serif" : "15px system-ui, sans-serif";
  ctx.fillText(label, cx, cy + 1);
  ctx.restore();
}

/** 🧲 자석 — 말굽 모양 */
function drawMagnet(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.save();
  ctx.shadowColor = "#FF5C7A";
  ctx.shadowBlur = 14;
  ctx.lineWidth = 7;
  ctx.lineCap = "butt";
  ctx.strokeStyle = "#FF5C7A";
  ctx.beginPath();
  ctx.arc(cx, cy - 2, 10, Math.PI, 0, true);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#E9EDFB";
  ctx.fillRect(cx - 13.5, cy - 2, 7, 7);
  ctx.fillRect(cx + 6.5, cy - 2, 7, 7);
  ctx.restore();
}

/** 🟡 황금 부엉이 */
function drawGoldenOwl(ctx: CanvasRenderingContext2D, cx: number, cy: number, time: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  const k = 1 + Math.sin(time * 6) * 0.06;
  ctx.scale(k, k);
  ctx.shadowColor = "#FFB020";
  ctx.shadowBlur = 26;
  ctx.fillStyle = "#FFC940";
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  tri(ctx, -11, -9, -6, -20, -2, -10);
  tri(ctx, 11, -9, 6, -20, 2, -10);
  ctx.fillStyle = "#3a2600";
  circle(ctx, -5, -2, 4.5);
  circle(ctx, 5, -2, 4.5);
  ctx.fillStyle = "#FFF6D6";
  circle(ctx, -5, -2, 2);
  circle(ctx, 5, -2, 2);
  ctx.fillStyle = "#E07B00";
  tri(ctx, -3, 3, 3, 3, 0, 8);
  ctx.restore();
}

function drawMysteryBlock(ctx: CanvasRenderingContext2D, cx: number, cy: number, time: number): void {
  const s = 15;
  const pulse = 0.75 + 0.25 * Math.sin(time * 5);
  ctx.shadowColor = "#FFB020";
  ctx.shadowBlur = 18 * pulse;
  const grad = ctx.createLinearGradient(cx - s, cy - s, cx + s, cy + s);
  grad.addColorStop(0, "#FFC64D");
  grad.addColorStop(1, "#C77A00");
  ctx.fillStyle = grad;
  rr(ctx, cx - s, cy - s, s * 2, s * 2, 5);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(60,30,0,0.8)";
  ctx.lineWidth = 2;
  ctx.stroke();
  // 모서리 리벳
  ctx.fillStyle = "rgba(60,30,0,0.75)";
  for (const [dx, dy] of [
    [-s + 5, -s + 5],
    [s - 5, -s + 5],
    [-s + 5, s - 5],
    [s - 5, s - 5],
  ]) {
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#3a2200";
  ctx.font = "900 19px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("?", cx, cy + 7);
}

function drawFeather(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number, color: string): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.4);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.ellipse(0, 0, 6, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(11,16,32,0.65)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(0, 14);
  ctx.stroke();
  for (let i = -9; i < 10; i += 5) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(4.5, i + 3);
    ctx.moveTo(0, i);
    ctx.lineTo(-4.5, i + 3);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.45 : r;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGem(ctx: CanvasRenderingContext2D, cx: number, cy: number, time: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.sin(time * 2) * 0.25);
  const g = ctx.createLinearGradient(-12, -12, 12, 12);
  g.addColorStop(0, "#BFF6FF");
  g.addColorStop(0.5, "#3DD9EB");
  g.addColorStop(1, "#1179A8");
  ctx.fillStyle = g;
  ctx.shadowColor = "#3DD9EB";
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(12, -3);
  ctx.lineTo(0, 15);
  ctx.lineTo(-12, -3);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-12, -3);
  ctx.lineTo(12, -3);
  ctx.moveTo(0, -14);
  ctx.lineTo(0, 15);
  ctx.stroke();
  ctx.restore();
}

/** 🦉 아울 에너지 — 회전하는 링 안의 부엉이 얼굴 */
function drawOwlEnergy(ctx: CanvasRenderingContext2D, cx: number, cy: number, time: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  // 회전 링
  ctx.rotate(time * 1.6);
  ctx.strokeStyle = "#3DD9EB";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#3DD9EB";
  ctx.shadowBlur = 18;
  ctx.setLineDash([9, 7]);
  ctx.beginPath();
  ctx.arc(0, 0, 17, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.rotate(-time * 1.6);
  // 부엉이 얼굴
  ctx.fillStyle = "#0b1020";
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#FFB020";
  ctx.beginPath();
  ctx.arc(-4.5, -2, 4, 0, Math.PI * 2);
  ctx.arc(4.5, -2, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0b1020";
  ctx.beginPath();
  ctx.arc(-4.5, -2, 1.8, 0, Math.PI * 2);
  ctx.arc(4.5, -2, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFB020";
  tri(ctx, 0, 2, 3, 6, -3, 6);
  ctx.restore();
}

function drawSizeOrb(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string, sign: string): void {
  ctx.save();
  ctx.fillStyle = "rgba(11,16,32,0.8)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(cx, cy, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.font = "900 18px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(sign, cx, cy + 6);
  ctx.restore();
}

/* ───────────────────────── 부엉이 ───────────────────────── */

function drawOwl(ctx: CanvasRenderingContext2D, g: Game, fx: Fx): void {
  const info = COLOR_INFO[g.color];
  const { rx, ry } = spriteRadius(g.size);

  // 잔상 — 그림이 있으면 색별 혜성 꼬리
  const trailArt = drawOwlTrail(ctx, g, fx);
  for (let i = fx.trail.length - 1; i >= 2 && !trailArt; i -= 2) {
    const a = (1 - i / fx.trail.length) * 0.22 * (0.3 + fx.speedT);
    if (a <= 0.01) continue;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = info.hex;
    ctx.beginPath();
    ctx.ellipse(OWL_X - i * 7, fx.trail[i], rx * (1 - i * 0.03), ry * (1 - i * 0.03), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const tween = 0.85 + 0.15 * g.sizeTween;
  const stretch = 1 + fx.speedT * 0.14;

  // 상태 오라 — FEVER(불꽃) · BREAKER(붉은 가시) · FREEZE(서리)
  ctx.save();
  ctx.translate(OWL_X, g.y);
  if (g.feverT > 0) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + g.time * 4;
      const r = rx + 12 + Math.sin(g.time * 18 + i * 1.7) * 5;
      ctx.fillStyle = i % 2 ? "rgba(255,176,32,0.55)" : "rgba(255,92,50,0.5)";
      circle(ctx, Math.cos(a) * r, Math.sin(a) * r * 0.85, 5 + Math.sin(g.time * 12 + i) * 2);
    }
  }
  if (isBreaker(g)) {
    ctx.strokeStyle = "rgba(255,77,77,0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2 + g.time * 6;
      const r = rx + (i % 2 ? 8 : 20);
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  if (g.skill === "freeze") {
    ctx.strokeStyle = "rgba(170,235,255,0.85)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (rx + 6), Math.sin(a) * (ry + 6));
      ctx.lineTo(Math.cos(a) * (rx + 18), Math.sin(a) * (ry + 18));
      ctx.stroke();
    }
  }
  ctx.restore();

  ctx.save();
  ctx.translate(OWL_X, g.y);
  ctx.rotate(Math.max(-0.5, Math.min(0.9, (g.vy * g.grav) / 900)) * g.grav);
  // 중력 반전이면 거꾸로 매달린다
  ctx.scale(tween * stretch, (tween / (1 + fx.speedT * 0.05)) * g.grav);
  if (g.iFrame > 0 && Math.floor(g.iFrame * 20) % 2 === 0) ctx.globalAlpha = 0.45;
  if (isPhantom(g)) ctx.globalAlpha = 0.5 + Math.sin(g.time * 10) * 0.12;

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
  for (let i = 0; i < g.shields; i++) {
    ctx.strokeStyle = "rgba(61,217,235,0.9)";
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx + 14 + i * 7, ry + 14 + i * 7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 날갯짓·활공 스프라이트 (없으면 아래 도형 부엉이)
  if (drawOwlSprite(ctx, g)) {
    ctx.restore();
    return;
  }
  // 날개
  ctx.fillStyle = "#2a3665";
  ctx.beginPath();
  ctx.ellipse(-5, g.vy < 0 ? -9 : 7, rx * 0.55, ry * 0.35, g.vy < 0 ? -0.6 : 0.5, 0, Math.PI * 2);
  ctx.fill();
  // 몸통
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

/* ───────────────────────── 이펙트 ───────────────────────── */

function drawParticles(ctx: CanvasRenderingContext2D, g: Game): void {
  for (const p of g.particles) {
    const a = Math.max(0, p.life / p.max);
    const sprite = tinted("spark", p.color, 64);
    if (sprite) {
      drawAdditive(ctx, sprite, p.x, p.y, 16 + p.r * 5, 16 + p.r * 5, a);
    } else {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.r, p.r);
      ctx.globalAlpha = 1;
    }
  }
  ctx.globalAlpha = 1;
}

function drawDust(ctx: CanvasRenderingContext2D, fx: Fx): void {
  for (const d of fx.dust) {
    ctx.globalAlpha = d.a;
    ctx.fillStyle = "rgba(190,215,255,0.9)";
    ctx.fillRect(d.x, d.y, d.r * 2, d.r);
  }
  ctx.globalAlpha = 1;
}

function drawTurboRings(ctx: CanvasRenderingContext2D, g: Game, fx: Fx): void {
  if (!fx.rings.length) return;
  ctx.save();
  for (const r of fx.rings) {
    ctx.strokeStyle = `rgba(255,176,32,${Math.max(0, r.a)})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(OWL_X, g.y, r.r * 0.55, r.r, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawScreenEffects(ctx: CanvasRenderingContext2D, g: Game, fx: Fx, reduced: boolean): void {
  // 속도 비네트
  if (fx.speedT > 0.05 && !reduced) {
    const v = ctx.createRadialGradient(OWL_X + 120, H / 2, H * 0.35, OWL_X + 120, H / 2, H * 0.95);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, `rgba(0,0,0,${0.18 + fx.speedT * 0.3})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }
  if (g.flash > 0 && !reduced) {
    ctx.fillStyle = hexA(g.flashColor, Math.min(0.6, g.flash * 0.55));
    ctx.fillRect(0, 0, W, H);
  }
  // 에너지 20% 이하 붉은 비네트
  if (g.energy.value <= g.energy.max * CFG.energy.lowRatio) {
    const grd = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.78);
    grd.addColorStop(0, "rgba(255,80,80,0)");
    grd.addColorStop(1, `rgba(255,60,60,${g.status === "falling" ? 0.5 : 0.32})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
  }
}

/* ───────────────────────── 도형 유틸 ───────────────────────── */

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

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export function tri(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.fill();
}

export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function mod(v: number, m: number): number {
  return ((v % m) + m) % m;
}

export type { SizeKey, Color };
