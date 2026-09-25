// 렌더 — Canvas 2D 단일 캔버스, DOM 금지 (기획서 §12).
// 스프라이트는 오프스크린 캔버스에 미리 그려두고 매 프레임 drawImage만 한다.
import { CFG } from "../config";
import { BULLET_KINDS, ENEMY_KINDS, type World } from "./world";

const W = CFG.view.w;
const H = CFG.view.h;

/** 파티클 색 인덱스 → 색 */
const PARTICLE_COLORS = ["#FFD27A", "#6BF0A0", "#FF5C7A", "#3DD9EB", "#CDA8FF"];

type Sprites = {
  player: HTMLCanvasElement;
  enemies: HTMLCanvasElement[];
  bullets: HTMLCanvasElement[];
  orb: HTMLCanvasElement;
};

let sprites: Sprites | null = null;

function makeSprite(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.translate(size / 2, size / 2);
    draw(ctx, size);
  }
  return c;
}

function circleSprite(size: number, fill: string, stroke: string, glow = 10): HTMLCanvasElement {
  return makeSprite(size, (ctx) => {
    const r = size / 2 - 3;
    ctx.shadowColor = glow > 0 ? stroke : "transparent";
    ctx.shadowBlur = glow;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

function buildSprites(): Sprites {
  // 적 — 종류별 색·모양 (§7)
  const enemies = ENEMY_KINDS.map((kind) => {
    switch (kind) {
      case "bug":
        return circleSprite(26, "#3a2c52", "#CDA8FF", 8);
      case "worm":
        return makeSprite(26, (ctx) => {
          ctx.fillStyle = "#1d5a44";
          ctx.strokeStyle = "#6BF0A0";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(0, 0, 10, 6, 0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      case "trojan":
        return makeSprite(40, (ctx) => {
          ctx.fillStyle = "#4a2f16";
          ctx.strokeStyle = "#FFB020";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(0, -14);
          ctx.lineTo(14, 8);
          ctx.lineTo(-14, 8);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        });
      case "botnet":
        return circleSprite(20, "#20304f", "#7FA6FF", 6);
      case "ransom":
        return makeSprite(44, (ctx) => {
          ctx.fillStyle = "#3a1020";
          ctx.strokeStyle = "#FF5C7A";
          ctx.lineWidth = 3;
          ctx.shadowColor = "#FF5C7A";
          ctx.shadowBlur = 12;
          ctx.fillRect(-13, -13, 26, 26);
          ctx.strokeRect(-13, -13, 26, 26);
        });
      case "elite":
        return makeSprite(66, (ctx) => {
          ctx.fillStyle = "#2b1f3f";
          ctx.strokeStyle = "#FFD27A";
          ctx.lineWidth = 3;
          ctx.shadowColor = "#FFD27A";
          ctx.shadowBlur = 18;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i - Math.PI / 2;
            const x = Math.cos(a) * 24;
            const y = Math.sin(a) * 24;
            if (i) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        });
      default:
        return makeSprite(150, (ctx) => {
          ctx.fillStyle = "#1a0b12";
          ctx.strokeStyle = "#FF5C7A";
          ctx.lineWidth = 5;
          ctx.shadowColor = "#FF5C7A";
          ctx.shadowBlur = 30;
          ctx.beginPath();
          ctx.arc(0, 0, 58, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.fillStyle = "#FF5C7A";
          ctx.beginPath();
          ctx.arc(-20, -12, 9, 0, Math.PI * 2);
          ctx.arc(20, -12, 9, 0, Math.PI * 2);
          ctx.fill();
        });
    }
  });

  const bullets = BULLET_KINDS.map((kind) => {
    switch (kind) {
      case "laser":
        return makeSprite(30, (ctx) => {
          ctx.fillStyle = "#9BEBFF";
          ctx.shadowColor = "#3DD9EB";
          ctx.shadowBlur = 14;
          ctx.fillRect(-13, -3, 26, 6);
        });
      case "orbit":
        return circleSprite(24, "#FFE08A", "#FFB020", 14);
      case "ddos":
        return circleSprite(14, "#FFFFFF", "#7FA6FF", 10);
      case "explosion":
        return circleSprite(60, "rgba(255,176,32,0.25)", "#FFB020", 20);
      case "spike":
        return makeSprite(22, (ctx) => {
          ctx.fillStyle = "#6BF0A0";
          ctx.shadowColor = "#6BF0A0";
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.moveTo(0, -9);
          ctx.lineTo(7, 7);
          ctx.lineTo(-7, 7);
          ctx.closePath();
          ctx.fill();
        });
      default:
        return makeSprite(18, (ctx) => {
          ctx.fillStyle = "#FFD27A";
          ctx.shadowColor = "#FFB020";
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.ellipse(0, 0, 7, 3, 0, 0, Math.PI * 2);
          ctx.fill();
        });
    }
  });

  const player = makeSprite(44, (ctx) => {
    ctx.shadowColor = "#FFB020";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#3a4a86";
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // 귀깃
    ctx.fillStyle = "#2a3665";
    ctx.beginPath();
    ctx.moveTo(-11, -9);
    ctx.lineTo(-6, -19);
    ctx.lineTo(-2, -10);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(11, -9);
    ctx.lineTo(6, -19);
    ctx.lineTo(2, -10);
    ctx.closePath();
    ctx.fill();
    // 눈
    ctx.fillStyle = "#0b1020";
    ctx.beginPath();
    ctx.arc(-5, -2, 5, 0, Math.PI * 2);
    ctx.arc(5, -2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#FFE6A6";
    ctx.beginPath();
    ctx.arc(-5, -2, 2.4, 0, Math.PI * 2);
    ctx.arc(5, -2, 2.4, 0, Math.PI * 2);
    ctx.fill();
    // 부리
    ctx.fillStyle = "#FFB020";
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(4, 8);
    ctx.lineTo(-4, 8);
    ctx.closePath();
    ctx.fill();
  });

  const orb = circleSprite(14, "#6BF0A0", "#B6FFD6", 10);
  return { player, enemies, bullets, orb };
}

export function render(ctx: CanvasRenderingContext2D, w: World, reduced: boolean): void {
  if (!sprites) sprites = buildSprites();
  const s = sprites;
  const camX = w.player.x - W / 2;
  const camY = w.player.y - H / 2;

  ctx.save();
  if (w.shake > 0 && !reduced) {
    ctx.translate((Math.random() - 0.5) * w.shake * 14, (Math.random() - 0.5) * w.shake * 14);
  }

  // 배경 + 구역 톤
  ctx.fillStyle = CFG.zones[w.zone].tone;
  ctx.fillRect(-40, -40, W + 80, H + 80);
  drawGrid(ctx, camX, camY);

  // 장판
  const hz = w.hazards;
  for (let i = 0; i < hz.cap; i++) {
    if (!hz.alive[i]) continue;
    const x = hz.x[i] - camX;
    const y = hz.y[i] - camY;
    ctx.fillStyle = hz.owner[i] === 0 ? "rgba(61,217,235,0.14)" : "rgba(255,92,122,0.18)";
    ctx.strokeStyle = hz.owner[i] === 0 ? "rgba(61,217,235,0.5)" : "rgba(255,92,122,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, hz.r[i], 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // XP 조각
  const o = w.orbs;
  for (let i = 0; i < o.cap; i++) {
    if (!o.alive[i]) continue;
    ctx.drawImage(s.orb, o.x[i] - camX - 7, o.y[i] - camY - 7);
  }

  // 적
  const e = w.enemies;
  for (let i = 0; i < e.cap; i++) {
    if (!e.alive[i]) continue;
    const x = e.x[i] - camX;
    const y = e.y[i] - camY;
    if (x < -80 || x > W + 80 || y < -80 || y > H + 80) continue;
    const sprite = s.enemies[e.kind[i]];
    if (e.flash[i] > 0) {
      ctx.globalAlpha = 0.85;
      ctx.globalCompositeOperation = "lighter";
    }
    ctx.drawImage(sprite, x - sprite.width / 2, y - sprite.height / 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    e.flash[i] = Math.max(0, e.flash[i] - 1 / 60);
    // 엘리트·보스 체력바
    if (e.maxHp[i] >= 300) {
      const ratio = Math.max(0, e.hp[i] / e.maxHp[i]);
      const bw = e.r[i] * 2.4;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x - bw / 2, y - e.r[i] - 14, bw, 5);
      ctx.fillStyle = "#FF5C7A";
      ctx.fillRect(x - bw / 2, y - e.r[i] - 14, bw * ratio, 5);
    }
  }

  // 투사체
  const b = w.bullets;
  for (let i = 0; i < b.cap; i++) {
    if (!b.alive[i]) continue;
    const x = b.x[i] - camX;
    const y = b.y[i] - camY;
    if (x < -60 || x > W + 60 || y < -60 || y > H + 60) continue;
    const sprite = s.bullets[b.kind[i]];
    const angle = Math.atan2(b.vy[i], b.vx[i]);
    ctx.save();
    ctx.translate(x, y);
    if (b.vx[i] || b.vy[i]) ctx.rotate(angle);
    const scale = b.r[i] > 0 ? Math.max(0.6, (b.r[i] * 2) / sprite.width) : 1;
    ctx.scale(scale, scale);
    ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
    ctx.restore();
  }

  // 플레이어
  const p = w.player;
  const px = W / 2;
  const py = H / 2;
  if (p.iframe > 0 && Math.floor(p.iframe * 20) % 2 === 0) ctx.globalAlpha = 0.5;
  ctx.drawImage(s.player, px - s.player.width / 2, py - s.player.height / 2);
  ctx.globalAlpha = 1;

  // 파티클
  const q = w.parts;
  for (let i = 0; i < q.cap; i++) {
    if (!q.alive[i]) continue;
    ctx.globalAlpha = Math.max(0, q.life[i] / q.max[i]);
    ctx.fillStyle = PARTICLE_COLORS[q.color[i] % PARTICLE_COLORS.length];
    ctx.fillRect(q.x[i] - camX, q.y[i] - camY, q.r[i], q.r[i]);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  if (w.flash > 0 && !reduced) {
    ctx.fillStyle = `rgba(255,92,122,${w.flash * 0.5})`;
    ctx.fillRect(0, 0, W, H);
  }
  // 체력 낮을 때 비네트
  if (w.player.hp <= w.player.maxHp * 0.3) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8);
    g.addColorStop(0, "rgba(255,60,60,0)");
    g.addColorStop(1, "rgba(255,60,60,0.35)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
  const step = 80;
  ctx.strokeStyle = "rgba(120,150,220,0.07)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  const ox = -(camX % step);
  const oy = -(camY % step);
  for (let x = ox; x < W; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = oy; y < H; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
}

/** 테스트·핫리로드에서 스프라이트를 다시 만들 때 */
export function resetSprites(): void {
  sprites = null;
}
