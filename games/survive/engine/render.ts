// 🦉 아울 서바이버즈 v2 — 렌더 (기획서 §10.3)
//
// 도형 기반 미니멀. 매 프레임 path 를 그리지 않고 **오프스크린에 미리 그려 둔 뒤 drawImage** 한다.
// 다크는 네온(발광), 라이트는 외곽선 — 두 테마가 같은 코드로 그려지면 라이트가 죽는다 (§10.1).

import { CFG } from "../config";
import { alpha, neon, stageAccent, type Theme } from "../theme";
import { HZ } from "./skills";
import type { World } from "./world";

/* ── 스프라이트 캐시 ────────────────────────────────────────── */

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

/** 적 — 등급이 올라갈수록 변이 많아진다 (§10.3) */
function enemySprite(t: Theme, sides: number, r: number, rank: number): HTMLCanvasElement {
  const color = rank >= 2 ? t.boss : rank === 1 ? t.accent : t.enemy;
  const pad = t.glow ? 14 : 6;
  return make(`e:${t.id}:${sides}:${r}:${rank}`, (r + pad) * 2, (r + pad) * 2, (c) => {
    c.save();
    neon(c, t, color, rank >= 2 ? 22 : 12);
    c.fillStyle = alpha(color, t.glow ? 0.9 : 1);
    polygon(c, sides, r);
    c.fill();
    c.restore();
    if (!t.glow) {
      c.lineWidth = 2;
      c.strokeStyle = "rgba(20,27,51,0.6)";
      polygon(c, sides, r);
      c.stroke();
    }
    if (rank >= 2) {
      // 보스는 코어가 하나 더 있다
      c.fillStyle = alpha(t.text, 0.85);
      c.beginPath();
      c.arc(0, 0, r * 0.28, 0, Math.PI * 2);
      c.fill();
    }
  });
}

/** 플레이어 = 원 + 삼각 귀 */
function owlSprite(t: Theme): HTMLCanvasElement {
  const r = CFG.player.radius;
  const pad = t.glow ? 18 : 8;
  return make(`owl:${t.id}`, (r + pad) * 2, (r + pad) * 2, (c) => {
    c.save();
    neon(c, t, t.player, 18);
    c.fillStyle = t.player;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fill();
    // 귀
    c.beginPath();
    c.moveTo(-r * 0.9, -r * 0.5); c.lineTo(-r * 0.35, -r * 1.5); c.lineTo(-r * 0.05, -r * 0.6);
    c.moveTo(r * 0.9, -r * 0.5); c.lineTo(r * 0.35, -r * 1.5); c.lineTo(r * 0.05, -r * 0.6);
    c.fill();
    c.restore();
    if (!t.glow) {
      c.lineWidth = 2;
      c.strokeStyle = "rgba(20,27,51,0.7)";
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.stroke();
    }
    // 눈
    c.fillStyle = t.bg;
    c.beginPath();
    c.arc(-r * 0.36, -r * 0.1, r * 0.26, 0, Math.PI * 2);
    c.arc(r * 0.36, -r * 0.1, r * 0.26, 0, Math.PI * 2);
    c.fill();
  });
}

function bulletSprite(t: Theme, look: number): HTMLCanvasElement {
  const color =
    look === 7 ? t.danger : look === 3 ? t.accent : look === 1 || look === 2 ? t.xp : t.player;
  const size = look === 6 ? 12 : look === 3 ? 10 : look === 1 ? 9 : 7;
  const pad = t.glow ? 12 : 4;
  return make(`b:${t.id}:${look}`, (size + pad) * 2, (size + pad) * 2, (c) => {
    c.save();
    neon(c, t, color, 14);
    c.fillStyle = color;
    if (look === 1 || look === 2) {
      c.fillRect(-size, -3, size * 2, 6);
    } else if (look === 0) {
      // 깃털
      c.beginPath();
      c.ellipse(0, 0, size, size * 0.5, 0, 0, Math.PI * 2);
      c.fill();
    } else {
      c.beginPath();
      c.arc(0, 0, size * 0.8, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    if (!t.glow) {
      c.lineWidth = 1.5;
      c.strokeStyle = "rgba(20,27,51,0.5)";
      c.beginPath();
      c.arc(0, 0, size * 0.8, 0, Math.PI * 2);
      c.stroke();
    }
  });
}

function orbSprite(t: Theme, kind: number): HTMLCanvasElement {
  const color = kind === 1 ? t.hp : t.xp;
  const pad = t.glow ? 10 : 4;
  return make(`o:${t.id}:${kind}`, (6 + pad) * 2, (6 + pad) * 2, (c) => {
    c.save();
    neon(c, t, color, 10);
    c.fillStyle = color;
    c.beginPath();
    c.arc(0, 0, 5, 0, Math.PI * 2);
    c.fill();
    c.restore();
  });
}

/* ── 배경 ───────────────────────────────────────────────────── */

function drawFloor(ctx: CanvasRenderingContext2D, w: World, camX: number, camY: number): void {
  const t = w.theme;
  const accent = stageAccent(w.stage);
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, CFG.view.w, CFG.view.h);

  const step = 64;
  const ox = -(camX % step);
  const oy = -(camY % step);
  ctx.strokeStyle = t.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = ox; x <= CFG.view.w; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CFG.view.h);
  }
  for (let y = oy; y <= CFG.view.h; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(CFG.view.w, y);
  }
  ctx.stroke();

  // 스테이지 액센트 — 바닥에 옅게 깔아 스테이지를 구분한다
  ctx.fillStyle = alpha(accent, t.glow ? 0.05 : 0.08);
  ctx.fillRect(0, 0, CFG.view.w, CFG.view.h);

  // 아레나 경계
  const l = -camX;
  const tp = -camY;
  ctx.strokeStyle = alpha(accent, 0.55);
  ctx.lineWidth = 3;
  ctx.strokeRect(l, tp, CFG.arena.w, CFG.arena.h);
}

/* ── 본체 ───────────────────────────────────────────────────── */

const PARTICLE_COLORS = ["player", "enemy", "obstacle", "boss", "accent", "xp", "danger"] as const;

export function render(ctx: CanvasRenderingContext2D, w: World): void {
  const t = w.theme;
  const camX = w.cam.x - CFG.view.w / 2;
  const camY = w.cam.y - CFG.view.h / 2;

  let sx = 0;
  let sy = 0;
  if (w.shake > 0 && !w.reduced) {
    sx = (Math.random() - 0.5) * w.shakePx * 2;
    sy = (Math.random() - 0.5) * w.shakePx * 2;
  }

  ctx.save();
  ctx.translate(sx, sy);
  drawFloor(ctx, w, camX, camY);

  const vx = (x: number) => x - camX;
  const vy = (y: number) => y - camY;

  // 장판
  const h = w.hazards;
  for (let i = 0; i < h.cap; i++) {
    if (!h.alive[i]) continue;
    const x = vx(h.x[i]);
    const y = vy(h.y[i]);
    if (x < -200 || x > CFG.view.w + 200 || y < -200 || y > CFG.view.h + 200) continue;
    const kind = h.kind[i];
    const color =
      kind === HZ.enemy ? t.danger : kind === HZ.pull ? t.boss : kind === HZ.burn ? t.accent : kind === HZ.honey ? t.hp : t.xp;
    const life = h.life[i] / Math.max(0.001, h.max[i]);
    ctx.save();
    neon(ctx, t, color, 16);
    ctx.fillStyle = alpha(color, 0.16 + 0.1 * life);
    ctx.beginPath();
    ctx.arc(x, y, h.r[i], 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = alpha(color, 0.7);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // 장애물
  const o = w.obstacles;
  for (let i = 0; i < o.cap; i++) {
    if (!o.alive[i]) continue;
    const x = vx(o.x[i]) - o.w[i] / 2;
    const y = vy(o.y[i]) - o.h[i] / 2;
    if (x < -120 || x > CFG.view.w + 120 || y < -120 || y > CFG.view.h + 120) continue;
    const hurt = o.hp[i] / o.maxHp[i];
    ctx.fillStyle = o.flash[i] > 0 ? "#FFFFFF" : alpha(t.obstacle, 0.5 + hurt * 0.5);
    ctx.fillRect(x, y, o.w[i], o.h[i]);
    ctx.strokeStyle = alpha(t.text, t.glow ? 0.18 : 0.35);
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, o.w[i], o.h[i]);
    if (o.kind[i] === 2) {
      ctx.fillStyle = alpha(t.danger, 0.8);
      ctx.fillRect(x + o.w[i] / 2 - 3, y + 4, 6, o.h[i] - 8);
    }
  }

  // XP·체력 조각
  const orbs = w.orbs;
  for (let i = 0; i < orbs.cap; i++) {
    if (!orbs.alive[i]) continue;
    const x = vx(orbs.x[i]);
    const y = vy(orbs.y[i]);
    if (x < -20 || x > CFG.view.w + 20 || y < -20 || y > CFG.view.h + 20) continue;
    const s = orbSprite(t, orbs.kind[i]);
    ctx.drawImage(s, x - s.width / 2, y - s.height / 2);
  }

  // 투사체 (잔상 포함)
  const b = w.bullets;
  for (let i = 0; i < b.cap; i++) {
    if (!b.alive[i]) continue;
    const x = vx(b.x[i]);
    const y = vy(b.y[i]);
    if (x < -60 || x > CFG.view.w + 60 || y < -60 || y > CFG.view.h + 60) continue;
    const s = bulletSprite(t, b.look[i]);
    if (!w.reduced && (b.vx[i] !== 0 || b.vy[i] !== 0)) {
      ctx.globalAlpha = 0.25;
      ctx.drawImage(s, x - b.vx[i] * 0.02 - s.width / 2, y - b.vy[i] * 0.02 - s.height / 2);
      ctx.globalAlpha = 0.5;
      ctx.drawImage(s, x - b.vx[i] * 0.01 - s.width / 2, y - b.vy[i] * 0.01 - s.height / 2);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(s, x - s.width / 2, y - s.height / 2);
  }

  // 적
  const e = w.enemies;
  for (let i = 0; i < e.cap; i++) {
    if (!e.alive[i]) continue;
    const x = vx(e.x[i]);
    const y = vy(e.y[i]);
    if (x < -80 || x > CFG.view.w + 80 || y < -80 || y > CFG.view.h + 80) continue;

    if (e.hideT[i] > 0) {
      ctx.globalAlpha = 0.25;
    }

    const s = enemySprite(t, e.sides[i], e.r[i], e.rank[i]);
    ctx.drawImage(s, x - s.width / 2, y - s.height / 2);

    // 피격 백색 플래시 — 타격감의 90%가 여기서 나온다 (§10.3)
    if (e.flash[i] > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, e.flash[i] / CFG.feedback.hitFlashSec);
      ctx.fillStyle = "#FFFFFF";
      ctx.translate(x, y);
      ctx.beginPath();
      for (let k = 0; k < e.sides[i]; k++) {
        const a = (Math.PI * 2 * k) / e.sides[i] - Math.PI / 2;
        const px = Math.cos(a) * e.r[i];
        const py = Math.sin(a) * e.r[i];
        if (k) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // 상태이상 표시
    if (e.slowT[i] > 0 || e.burnT[i] > 0 || e.stunT[i] > 0 || e.markT[i] > 0) {
      ctx.strokeStyle = e.burnT[i] > 0 ? t.accent : e.stunT[i] > 0 ? t.dim : e.markT[i] > 0 ? t.danger : t.xp;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, e.r[i] + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 엘리트·보스 체력 바
    if (e.rank[i] >= 1) {
      const bw = e.r[i] * 2.2;
      const ratio = Math.max(0, e.hp[i] / e.maxHp[i]);
      ctx.fillStyle = alpha(t.text, 0.25);
      ctx.fillRect(x - bw / 2, y - e.r[i] - 14, bw, 5);
      ctx.fillStyle = e.rank[i] >= 2 ? t.boss : t.danger;
      ctx.fillRect(x - bw / 2, y - e.r[i] - 14, bw * ratio, 5);
    }
  }

  // 플레이어
  const p = w.player;
  if (p.alive || w.t % 0.2 < 0.1) {
    const s = owlSprite(t);
    const px = vx(p.x);
    const py = vy(p.y);
    if (p.iframe > 0 || p.invuln > 0) ctx.globalAlpha = 0.55;
    ctx.drawImage(s, px - s.width / 2, py - s.height / 2);
    ctx.globalAlpha = 1;

    if (p.invuln > 0) {
      ctx.strokeStyle = alpha(t.hp, 0.9);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, py, CFG.player.radius + 10 + Math.sin(w.t * 18) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (p.shield) {
      ctx.strokeStyle = alpha(t.xp, 0.8);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, CFG.player.radius + 7, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // 파티클
  const q = w.particles;
  for (let i = 0; i < q.cap; i++) {
    if (!q.alive[i]) continue;
    const key = PARTICLE_COLORS[q.color[i]] ?? "player";
    ctx.globalAlpha = Math.max(0, q.life[i] / q.max[i]);
    ctx.fillStyle = t[key as keyof Theme] as string;
    ctx.fillRect(vx(q.x[i]) - q.r[i] / 2, vy(q.y[i]) - q.r[i] / 2, q.r[i], q.r[i]);
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  /* ── 화면 효과 ── */

  // 체력 30% 이하 — 가장자리 적색 맥동 (§9.1)
  const hpRatio = p.hp / Math.max(1, p.maxHp);
  const low = hpRatio <= CFG.feedback.lowHpRatio ? 0.25 + Math.sin(w.t * 6) * 0.1 : 0;
  const vig = Math.max(w.vignette * 0.5, low);
  if (vig > 0.01) {
    const g = ctx.createRadialGradient(
      CFG.view.w / 2, CFG.view.h / 2, CFG.view.h * 0.25,
      CFG.view.w / 2, CFG.view.h / 2, CFG.view.h * 0.75,
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, alpha(t.danger, vig));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CFG.view.w, CFG.view.h);
  }

  // reduced-motion 이면 흔들림 대신 테두리 플래시 (§9.1)
  if (w.reduced && w.shake > 0) {
    ctx.strokeStyle = alpha(t.danger, Math.min(0.9, w.shake * 3));
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, CFG.view.w - 8, CFG.view.h - 8);
  }

  if (w.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.5, w.flash)})`;
    ctx.fillRect(0, 0, CFG.view.w, CFG.view.h);
  }

  // 🌑 무한 구간 '시야 제한'
  if (w.info.rule === "dark") {
    const g = ctx.createRadialGradient(
      vx(p.x), vy(p.y), 60, vx(p.x), vy(p.y), 320,
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.85)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CFG.view.w, CFG.view.h);
  }
}
