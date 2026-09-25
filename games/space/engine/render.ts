// 🚀 아울스페이스 — 렌더 (기획서 §9 · §13)
//
// 탄 900발을 매 프레임 arc() 로 그리면 즉사한다. **오프스크린 프리렌더 후 drawImage** 만 쓴다.
// 내 탄(가늘고 긴 사이안)과 적 탄(둥근 구체 + 외곽선)은 절대 같아 보이면 안 된다.

import { CFG } from "../config";
import { alpha, neon, stageTint, type SpaceTheme } from "../theme";
import type { World } from "./world";

const sprites = new Map<string, HTMLCanvasElement>();

export function resetSprites(): void {
  sprites.clear();
}

function make(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const hit = sprites.get(key);
  if (hit) return hit;
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(w);
  cv.height = Math.ceil(h);
  const c = cv.getContext("2d");
  if (c) {
    c.translate(cv.width / 2, cv.height / 2);
    draw(c);
  }
  sprites.set(key, cv);
  return cv;
}

/** 적 탄 — 둥근 구체 + 외곽선 2px (절대 원칙, §9) */
function eBulletSprite(t: SpaceTheme, r: number): HTMLCanvasElement {
  const pad = t.glow ? 10 : 4;
  return make(`eb:${t.id}:${r}`, (r + pad) * 2, (r + pad) * 2, (c) => {
    c.save();
    neon(c, t, t.enemyBullet, 10);
    c.fillStyle = t.enemyBullet;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.lineWidth = 2;
    c.strokeStyle = t.enemyBulletEdge;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.stroke();
  });
}

/** 내 탄 — 가늘고 긴 형태 */
function pBulletSprite(t: SpaceTheme, look: number): HTMLCanvasElement {
  const w = look === 1 ? 10 : look === 4 ? 12 : 6;
  const h = look === 1 ? 44 : look === 2 ? 16 : 20;
  return make(`pb:${t.id}:${look}`, w + 16, h + 16, (c) => {
    c.save();
    neon(c, t, t.myBullet, 10);
    c.fillStyle = t.myBullet;
    if (look === 2) {
      c.beginPath();
      c.moveTo(0, -h / 2);
      c.lineTo(w / 2, h / 2);
      c.lineTo(-w / 2, h / 2);
      c.closePath();
      c.fill();
    } else {
      c.fillRect(-w / 2, -h / 2, w, h);
    }
    c.restore();
    if (!t.glow) {
      c.lineWidth = 1.5;
      c.strokeStyle = "rgba(20,27,51,0.5)";
      c.strokeRect(-w / 2, -h / 2, w, h);
    }
  });
}

function polygon(c: CanvasRenderingContext2D, sides: number, r: number): void {
  c.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = (Math.PI * 2 * i) / sides - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.closePath();
}

function enemySprite(t: SpaceTheme, sides: number, r: number, rank: number): HTMLCanvasElement {
  const color = rank === 2 ? t.boss : rank === 1 ? t.warn : t.enemy;
  const pad = t.glow ? 14 : 6;
  return make(`e:${t.id}:${sides}:${r}:${rank}`, (r + pad) * 2, (r + pad) * 2, (c) => {
    c.save();
    neon(c, t, color, rank === 2 ? 20 : 10);
    c.fillStyle = alpha(color, t.glow ? 0.92 : 1);
    polygon(c, sides, r);
    c.fill();
    c.restore();
    c.lineWidth = 2;
    c.strokeStyle = t.glow ? alpha(color, 0.9) : "rgba(20,27,51,0.6)";
    polygon(c, sides, r);
    c.stroke();
    if (rank === 2) {
      c.fillStyle = alpha(t.text, 0.9);
      c.beginPath();
      c.arc(0, 0, r * 0.22, 0, Math.PI * 2);
      c.fill();
    }
  });
}

/** 기체 — 삼각형 + 부엉이 눈 2점 (§9) */
function shipSprite(t: SpaceTheme): HTMLCanvasElement {
  const r = CFG.player.radius;
  const pad = t.glow ? 16 : 8;
  return make(`ship:${t.id}`, (r + pad) * 2, (r + pad) * 2, (c) => {
    c.save();
    neon(c, t, t.player, 16);
    c.fillStyle = t.player;
    c.beginPath();
    c.moveTo(0, -r * 1.3);
    c.lineTo(r, r * 0.9);
    c.lineTo(0, r * 0.5);
    c.lineTo(-r, r * 0.9);
    c.closePath();
    c.fill();
    c.restore();
    if (!t.glow) {
      c.lineWidth = 2;
      c.strokeStyle = "rgba(20,27,51,0.7)";
      c.stroke();
    }
    c.fillStyle = t.bg;
    c.beginPath();
    c.arc(-r * 0.32, -r * 0.2, r * 0.2, 0, Math.PI * 2);
    c.arc(r * 0.32, -r * 0.2, r * 0.2, 0, Math.PI * 2);
    c.fill();
  });
}

function chipSprite(t: SpaceTheme): HTMLCanvasElement {
  return make(`chip:${t.id}`, 22, 22, (c) => {
    c.save();
    neon(c, t, t.chip, 8);
    c.fillStyle = t.chip;
    c.beginPath();
    c.moveTo(0, -6); c.lineTo(6, 0); c.lineTo(0, 6); c.lineTo(-6, 0);
    c.closePath();
    c.fill();
    c.restore();
  });
}

/* ── 배경 (§2 달리는 느낌) ──────────────────────────────────── */

type Star = { x: number; y: number; z: number };
let stars: Star[] = [];

export function resetStars(rand: () => number): void {
  stars = [];
  for (let i = 0; i < 90; i++) {
    stars.push({ x: rand() * CFG.screen.w, y: rand() * CFG.screen.h, z: rand() });
  }
}

function drawBackground(ctx: CanvasRenderingContext2D, w: World): void {
  const t = w.theme;
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, CFG.screen.w, CFG.screen.h);

  // 성운 (60px/s)
  const tint = stageTint(w.stage);
  const ny = (w.scrollY * (CFG.scroll.bg / CFG.scroll.fore)) % (CFG.screen.h + 400);
  ctx.fillStyle = alpha(tint, t.glow ? 0.1 : 0.14);
  for (let k = -1; k < 2; k++) {
    const y = ny + k * (CFG.screen.h + 400);
    ctx.beginPath();
    ctx.ellipse(CFG.screen.w * 0.3, y - 200, 260, 160, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(CFG.screen.w * 0.75, y + 320, 200, 130, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 중간 별 (240px/s) + 전경 속도선 (600px/s)
  for (const s of stars) {
    const fore = s.z > 0.6;
    const speed = fore ? CFG.scroll.fore : CFG.scroll.mid;
    const y = (s.y + w.scrollY * (speed / CFG.scroll.fore)) % (CFG.screen.h + 40);
    if (fore && !w.lowSpec) {
      ctx.strokeStyle = alpha(t.streak, 0.5 + s.z * 0.4);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(s.x, y);
      ctx.lineTo(s.x, y - CFG.scroll.streakPx * w.scrollMul);
      ctx.stroke();
    } else {
      ctx.fillStyle = alpha(t.star, 0.6 + s.z * 0.4);
      ctx.fillRect(s.x, y, 2, 2);
    }
  }
}

/* ── 본체 ───────────────────────────────────────────────────── */

const PARTICLE_COLORS = ["player", "myBullet", "chip", "enemy", "boss"] as const;

export function render(ctx: CanvasRenderingContext2D, w: World): void {
  const t = w.theme;

  let sx = 0;
  let sy = 0;
  if (w.shake > 0 && !w.reduced) {
    sx = (Math.random() - 0.5) * w.shakePx * 2;
    sy = (Math.random() - 0.5) * w.shakePx * 2;
  }

  ctx.save();
  ctx.translate(sx, sy);
  drawBackground(ctx, w);

  // 장애물
  const o = w.obstacles;
  for (let i = 0; i < o.cap; i++) {
    if (!o.alive[i]) continue;
    ctx.fillStyle = o.flash[i] > 0 ? "#FFFFFF" : alpha(t.dim, 0.45);
    ctx.fillRect(o.x[i] - o.w[i] / 2, o.y[i] - o.h[i] / 2, o.w[i], o.h[i]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = alpha(t.text, t.glow ? 0.25 : 0.4);
    ctx.strokeRect(o.x[i] - o.w[i] / 2, o.y[i] - o.h[i] / 2, o.w[i], o.h[i]);
  }

  // 칩
  const c = w.chips;
  const chip = chipSprite(t);
  for (let i = 0; i < c.cap; i++) {
    if (!c.alive[i]) continue;
    ctx.drawImage(chip, c.x[i] - chip.width / 2, c.y[i] - chip.height / 2);
  }

  // 내 탄
  const pb = w.pbullets;
  for (let i = 0; i < pb.cap; i++) {
    if (!pb.alive[i]) continue;
    const s = pBulletSprite(t, pb.look[i]);
    ctx.drawImage(s, pb.x[i] - s.width / 2, pb.y[i] - s.height / 2);
  }

  // 적
  const e = w.enemies;
  for (let i = 0; i < e.cap; i++) {
    if (!e.alive[i]) continue;
    const s = enemySprite(t, e.sides[i], e.r[i], e.rank[i]);
    ctx.drawImage(s, e.x[i] - s.width / 2, e.y[i] - s.height / 2);
    if (e.flash[i] > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, e.flash[i] / CFG.feedback.flashSec);
      ctx.fillStyle = "#FFFFFF";
      ctx.translate(e.x[i], e.y[i]);
      polygon(ctx, e.sides[i], e.r[i]);
      ctx.fill();
      ctx.restore();
    }
  }

  // 레이저 — 예고선 먼저 (§14-4)
  const l = w.lasers;
  for (let i = 0; i < l.cap; i++) {
    if (!l.alive[i]) continue;
    const a = l.angle[i] * (Math.PI / 180);
    const ex = l.x[i] + Math.sin(a) * 1400;
    const ey = l.y[i] + Math.cos(a) * 1400;
    if (l.warn[i] > 0) {
      ctx.save();
      ctx.setLineDash([10, 8]);
      ctx.strokeStyle = alpha(t.warn, 0.55);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(l.x[i], l.y[i]);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.save();
      neon(ctx, t, t.enemyBullet, 18);
      ctx.strokeStyle = t.enemyBullet;
      ctx.lineWidth = l.width[i];
      ctx.beginPath();
      ctx.moveTo(l.x[i], l.y[i]);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = t.enemyBulletEdge;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // 적 탄 — 가장 위에 그린다 (절대 가려지면 안 된다)
  const b = w.ebullets;
  for (let i = 0; i < b.cap; i++) {
    if (!b.alive[i]) continue;
    const s = eBulletSprite(t, b.r[i]);
    ctx.drawImage(s, b.x[i] - s.width / 2, b.y[i] - s.height / 2);
  }

  // 파티클
  const q = w.particles;
  for (let i = 0; i < q.cap; i++) {
    if (!q.alive[i]) continue;
    ctx.globalAlpha = Math.max(0, q.life[i] / q.max[i]);
    ctx.fillStyle = t[PARTICLE_COLORS[q.color[i]] ?? "player"] as string;
    ctx.fillRect(q.x[i] - q.r[i] / 2, q.y[i] - q.r[i] / 2, q.r[i], q.r[i]);
  }
  ctx.globalAlpha = 1;

  // 🦉 페이크 아울 분신
  const p = w.player;
  if (p.decoyT > 0) {
    const ship = shipSprite(t);
    ctx.globalAlpha = 0.45;
    ctx.drawImage(ship, p.decoyX - ship.width / 2, p.decoyY - ship.height / 2);
    ctx.globalAlpha = 1;
  }

  // 기체
  if (p.alive) {
    const ship = shipSprite(t);
    const tilt = Math.max(-1, Math.min(1, (p.x - p.lastX) * 0.6)) * 3 * (Math.PI / 180);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(tilt);
    if (p.iframe > 0 && Math.floor(w.t * 20) % 2 === 0) ctx.globalAlpha = 0.35;

    // 추진 불꽃 — 스크롤 속도에 연동 (§2)
    const flame = 14 + w.scrollMul * 16;
    ctx.fillStyle = alpha(t.player, 0.55);
    ctx.beginPath();
    ctx.moveTo(-5, CFG.player.radius * 0.8);
    ctx.lineTo(0, CFG.player.radius * 0.8 + flame);
    ctx.lineTo(5, CFG.player.radius * 0.8);
    ctx.closePath();
    ctx.fill();

    ctx.drawImage(ship, -ship.width / 2, -ship.height / 2);
    ctx.restore();
    ctx.globalAlpha = 1;

    // 🛡️ 오빗 실드
    for (let k = 0; k < p.orbits; k++) {
      const a = w.t * 3 + (Math.PI * 2 * k) / Math.max(1, p.orbits);
      ctx.fillStyle = alpha(t.myBullet, 0.9);
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(a) * 34, p.y + Math.sin(a) * 34, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // 🧱 포인트 배리어
    if (p.barrier > 0) {
      ctx.strokeStyle = alpha(t.myBullet, 0.5);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x - 28, p.y - 30);
      ctx.lineTo(p.x + 28, p.y - 30);
      ctx.stroke();
    }
    // 🛡️ 나노 실드
    if (p.shield) {
      ctx.strokeStyle = alpha(t.chip, 0.7);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, CFG.player.radius + 9, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 판정점 — 항상 보이고, 정밀 모드에서 확대 (§14-2)
    const hr = w.stats.hitboxR;
    ctx.save();
    neon(ctx, t, t.myBullet, p.precise ? 16 : 8);
    ctx.fillStyle = p.precise ? "#FFFFFF" : t.myBullet;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.precise ? hr + 3 : hr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (p.precise) {
      ctx.strokeStyle = alpha(t.myBullet, 0.6);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, w.stats.grazeRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.restore();

  /* ── 화면 효과 ── */
  const lowLife = p.lives <= 1 ? 0.22 + Math.sin(w.t * 6) * 0.08 : 0;
  const vig = Math.max(w.vignette * 0.5, lowLife);
  if (vig > 0.01) {
    const g = ctx.createRadialGradient(
      CFG.screen.w / 2, CFG.screen.h / 2, CFG.screen.w * 0.3,
      CFG.screen.w / 2, CFG.screen.h / 2, CFG.screen.h * 0.7,
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, alpha(t.danger, vig));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CFG.screen.w, CFG.screen.h);
  }

  if (w.reduced && w.shake > 0) {
    ctx.strokeStyle = alpha(t.danger, Math.min(0.9, w.shake * 3));
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, CFG.screen.w - 8, CFG.screen.h - 8);
  }

  if (w.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.5, w.flash)})`;
    ctx.fillRect(0, 0, CFG.screen.w, CFG.screen.h);
  }

  // 🌑 엔드리스 '시야 제한'
  if (w.info.rule === "dark") {
    const g = ctx.createRadialGradient(p.x, p.y, 70, p.x, p.y, 300);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.82)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CFG.screen.w, CFG.screen.h);
  }
}
