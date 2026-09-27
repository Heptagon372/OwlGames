// 🦉 아울 서바이버즈 — 렌더 (기획서 §10.3)
//
// 몬스터는 **네온 튜브** 도형이다: 어두운 속 + 빛나는 테두리 + 가운데 코어.
// 오프스크린에 미리 그려 두고, 매 프레임에는 회전·호흡·잔상·등장·피격 찌그러짐만 변환으로 얹는다.
// 보스는 크기가 변하고(구각형 포식) 돌아가서 매 프레임 path 로 그린다 — 한 마리뿐이라 괜찮다.
// 다크는 네온(발광), 라이트는 외곽선 — 두 테마가 같은 코드로 그려지면 라이트가 죽는다 (§10.1).
//
// 색의 역할 (theme.ts): 내 공격 = 차가운 파랑·가늘고 길다 / 적 공격 = 뜨거운 빨강·둥근 구체 + 외곽선 /
// 경험치 = 금색 보석 / 얼음 = 서리색(반투명). 두 계열이 같아 보이면 안 된다.

import { CFG } from "../config";
import { ACTIVES, auraRadius } from "../data/skills";
import { ENEMY_KINDS, ENEMY_SPEC, MOB_KINDS } from "../data/stages";
import { alpha, neon, stageAccent, type Theme } from "../theme";
import { MOB_ART, MOVE_FRAMES, mobArt, owl, type MobArt, type OwlSprite } from "./assets";
import { chronoGrowth } from "./bosses/chrono";
import { LOOK } from "./skills";
import { BEAM, FX, HZ, HZ_LETHAL, PC, type World } from "./world";

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

/** 변 수 0 = 원 */
function shape(c: CanvasRenderingContext2D, sides: number, r: number, rot = -Math.PI / 2): void {
  c.beginPath();
  if (sides === 0) {
    c.arc(0, 0, r, 0, Math.PI * 2);
    return;
  }
  for (let i = 0; i < sides; i++) {
    const a = (Math.PI * 2 * i) / sides + rot;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.closePath();
}

/** 파티클·이펙트 색 번호 → 테마 색 */
function paint(t: Theme, idx: number): string {
  if (idx >= PC.mob) return t.mobs[MOB_KINDS[idx - PC.mob]] ?? t.enemy;
  switch (idx) {
    case PC.mine: return t.mine;
    case PC.enemy: return t.enemy;
    case PC.obstacle: return t.obstacle;
    case PC.boss: return t.boss;
    case PC.mineAlt: return t.mineAlt;
    case PC.ice: return t.ice;
    case PC.danger: return t.danger;
    case PC.hp: return t.hp;
    case PC.xp: return t.xp;
    case PC.text: return t.text;
    case PC.foe: return t.foe;
    default: return t.text;
  }
}

/* ── 몬스터 (네온 튜브) ─────────────────────────────────────── */

const MOB_PAD = 18;

function mobSprite(t: Theme, sides: number, r: number, color: string, special: boolean): HTMLCanvasElement {
  const R = Math.round(r);
  return make(`m:${t.id}:${sides}:${R}:${color}:${special ? 1 : 0}`, (R + MOB_PAD) * 2, (R + MOB_PAD) * 2, (c) => {
    if (t.glow) {
      // 속은 어둡게, 테두리는 빛나게 — 네온 튜브
      c.fillStyle = alpha(color, 0.16);
      shape(c, sides, R);
      c.fill();
      c.save();
      neon(c, t, color, 16);
      c.strokeStyle = color;
      c.lineWidth = 3;
      shape(c, sides, R);
      c.stroke();
      c.restore();
      c.strokeStyle = "rgba(255,255,255,0.7)";
      c.lineWidth = 1;
      shape(c, sides, R - 0.5);
      c.stroke();
      // 안쪽 결 (한 겹 더)
      c.strokeStyle = alpha(color, 0.45);
      c.lineWidth = 1;
      shape(c, sides, R * 0.62);
      c.stroke();
    } else {
      c.fillStyle = color;
      shape(c, sides, R);
      c.fill();
      c.strokeStyle = "rgba(20,27,51,0.7)";
      c.lineWidth = 2;
      shape(c, sides, R);
      c.stroke();
      c.strokeStyle = "rgba(255,255,255,0.55)";
      c.lineWidth = 1;
      shape(c, sides, R * 0.62);
      c.stroke();
    }
    // 코어 — 뒤집힌 같은 도형
    c.save();
    neon(c, t, color, 10);
    c.fillStyle = t.glow ? color : "#FFFFFF";
    shape(c, sides === 0 ? 0 : sides, R * 0.3, Math.PI / 2);
    c.fill();
    c.restore();
    // 특수 몬스터 — 바깥 점선 고리
    if (special) {
      c.save();
      c.setLineDash([3, 4]);
      c.strokeStyle = t.glow ? alpha(color, 0.8) : "rgba(20,27,51,0.6)";
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(0, 0, R + 6, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }
  });
}

/** 피격 플래시용 흰 실루엣 */
function flashSprite(sides: number, r: number): HTMLCanvasElement {
  const R = Math.round(r);
  return make(`f:${sides}:${R}`, (R + MOB_PAD) * 2, (R + MOB_PAD) * 2, (c) => {
    c.fillStyle = "#FFFFFF";
    shape(c, sides, R + 1);
    c.fill();
  });
}

/** 도형별 회전 방식 — 뾰족한 추적자는 가는 쪽을 보고, 나머지는 돈다 */
const SPIN: Record<string, number> = {
  square: 0.9, circle: 1.6, hepta: 1.1, octa: 0.5, hendeca: -0.7, dodeca: 0.35, tetradeca: 0.25,
};
const FACES_MOTION = new Set(["tri", "penta", "deca"]);
const FAST = new Set(["circle", "deca"]);

function easeOutBack(k: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (k - 1) ** 3 + c1 * (k - 1) ** 2;
}

/** 몬스터 그림은 판정 원보다 이만큼 크게 보인다 (얼굴이 읽혀야 한다) */
const ART_VIS = 1.4;
const BOSS_VIS = 1.2;

/**
 * 네온 도형 그림 한 장을 (0,0) 중심으로 그린다 — 호출부가 translate/rotate/scale 을 걸어 둔다.
 * 라이트 테마에서는 빛이 밝은 바탕에 묻히므로 뒤에 어두운 배지를 깐다.
 */
function drawArt(
  ctx: CanvasRenderingContext2D, t: Theme, img: HTMLImageElement, kind: MobArt, r: number, vis: number,
  flash: number, badgeSides: number,
): void {
  const art = MOB_ART[kind];
  const wdt = (2 * r * vis) / art.body;
  const hgt = wdt * (img.naturalHeight / img.naturalWidth);
  if (!t.glow) {
    ctx.fillStyle = "rgba(16,24,50,0.92)";
    shape(ctx, badgeSides, r * vis * 0.98, badgeSides === 3 ? -Math.PI / 2 : badgeSides === 0 ? 0 : -Math.PI / 2 + Math.PI / Math.max(3, badgeSides));
    ctx.fill();
  }
  ctx.drawImage(img, -wdt * art.cx, -hgt * art.cy, wdt, hgt);
  if (flash > 0) {
    // 맞으면 같은 그림을 더해서 하얗게 달아오른다
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(1, flash);
    ctx.drawImage(img, -wdt * art.cx, -hgt * art.cy, wdt, hgt);
    ctx.drawImage(img, -wdt * art.cx, -hgt * art.cy, wdt, hgt);
    ctx.restore();
  }
}

function drawMob(ctx: CanvasRenderingContext2D, w: World, i: number, x: number, y: number): void {
  const t = w.theme;
  const e = w.enemies;
  const kind = ENEMY_KINDS[e.kind[i]];
  const spec = ENEMY_SPEC[kind];
  const color = t.mobs[kind as keyof Theme["mobs"]] ?? t.enemy;
  const sprite = mobSprite(t, e.sides[i], e.r[i], color, spec.special);

  const speed = Math.hypot(e.vx[i], e.vy[i]);
  const dashing = e.dashT[i] < 0;
  const velA = speed > 1 ? Math.atan2(e.vy[i], e.vx[i]) : e.phase[i];

  // 회전
  let rot: number;
  if (FACES_MOTION.has(kind)) {
    const face = e.dashT[i] > 0 ? Math.atan2(e.dirY[i], e.dirX[i]) : velA;
    rot = face + Math.PI / 2;
  } else {
    rot = e.phase[i] + (w.frozen > 0 ? 0 : w.t) * (SPIN[kind] ?? 0.6);
  }

  // 크기 — 등장(커지며 나타남) · 호흡 · 피격 찌그러짐
  let s = 1;
  if (e.age[i] < 0.32) s *= 0.25 + 0.75 * easeOutBack(Math.min(1, e.age[i] / 0.32));
  if (!w.reduced) s *= 1 + Math.sin(w.t * 5 + e.phase[i]) * 0.045;
  let sx = s;
  let sy = s;
  if (e.flash[i] > 0) { sx *= 1.14; sy *= 0.86; }
  // 빠른 몬스터는 진행 방향으로 늘어난다
  const stretch = !w.reduced && (FAST.has(kind) || dashing) && speed > 60;
  if (stretch) { sx *= 1.18; sy *= 0.88; }

  // 🔶 돌진 준비 — 떨린다
  let jx = 0;
  if (e.dashT[i] > 0 && !w.reduced) jx = Math.sin(w.t * 60) * 1.5;

  const art = mobArt(kind);
  if (art) {
    // 얼굴이 있는 그림이라 돌리지 않고 가는 쪽으로 살짝 기울인다
    const lean = w.reduced ? 0 : Math.max(-0.28, Math.min(0.28, e.vx[i] / 400)) + Math.sin(w.t * 4 + e.phase[i]) * 0.05;
    const flash = e.flash[i] > 0 ? e.flash[i] / CFG.feedback.hitFlashSec : 0;
    if (stretch) {
      for (let k = 2; k >= 1; k--) {
        ctx.save();
        ctx.globalAlpha = k === 1 ? 0.3 : 0.14;
        ctx.translate(x - e.vx[i] * 0.028 * k, y - e.vy[i] * 0.028 * k);
        ctx.rotate(velA);
        ctx.scale(sx, sy);
        ctx.rotate(lean - velA);
        drawArt(ctx, t, art, kind as MobArt, e.r[i], ART_VIS, 0, e.sides[i]);
        ctx.restore();
      }
    }
    ctx.save();
    ctx.translate(x + jx, y);
    ctx.rotate(velA);
    ctx.scale(sx, sy);
    ctx.rotate(lean - velA);
    drawArt(ctx, t, art, kind as MobArt, e.r[i], ART_VIS, flash, e.sides[i]);
    ctx.restore();
  } else {
  // 잔상 (빠른 몬스터·돌진)
  if (stretch) {
    for (let k = 2; k >= 1; k--) {
      ctx.save();
      ctx.globalAlpha = k === 1 ? 0.28 : 0.13;
      ctx.translate(x - e.vx[i] * 0.028 * k, y - e.vy[i] * 0.028 * k);
      ctx.rotate(velA);
      ctx.scale(sx, sy);
      ctx.rotate(rot - velA);
      ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
      ctx.restore();
    }
  }

  ctx.save();
  ctx.translate(x + jx, y);
  ctx.rotate(velA);
  ctx.scale(sx, sy);
  ctx.rotate(rot - velA);
  ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
  if (e.flash[i] > 0) {
    ctx.globalAlpha = Math.min(1, e.flash[i] / CFG.feedback.hitFlashSec) * 0.85;
    const f = flashSprite(e.sides[i], e.r[i]);
    ctx.drawImage(f, -f.width / 2, -f.height / 2);
  }
  ctx.restore();
  }

  // ⬡ 십일각형 — 소환이 가까워지면 고리가 조여 든다
  if (kind === "hendeca" && e.shootCd[i] < 1.2) {
    const k = 1 - Math.max(0, e.shootCd[i]) / 1.2;
    ctx.strokeStyle = alpha(color, 0.3 + 0.6 * k);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, e.r[i] + 28 * (1 - k) + 6, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 🟨 칠각형 — 쏘기 직전 4방향 조준점
  if (kind === "hepta" && e.shootCd[i] < 0.6) {
    const base = Math.atan2(w.player.y - e.y[i], w.player.x - e.x[i]);
    ctx.fillStyle = alpha(t.foeAlt, 0.9);
    for (let k = 0; k < 4; k++) {
      const a = base + (Math.PI / 2) * k;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * (e.r[i] + 5), y + Math.sin(a) * (e.r[i] + 5), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/* ── 부엉이 ─────────────────────────────────────────────────── */

/** 스프라이트를 찾기 전의 폴백 — 원 + 삼각 귀 (바라보는 쪽으로 눈이 쏠린다) */
function owlFallback(t: Theme, face: number): HTMLCanvasElement {
  const r = CFG.player.radius;
  const pad = t.glow ? 18 : 8;
  return make(`owl:${t.id}:${face}`, (r + pad) * 2, (r + pad) * 2, (c) => {
    c.save();
    neon(c, t, t.player, 18);
    c.fillStyle = t.player;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(-r * 0.9, -r * 0.5); c.lineTo(-r * 0.35, -r * 1.5); c.lineTo(-r * 0.05, -r * 0.6);
    c.moveTo(r * 0.9, -r * 0.5); c.lineTo(r * 0.35, -r * 1.5); c.lineTo(r * 0.05, -r * 0.6);
    c.fill();
    c.restore();
    if (face === 1) return; // 뒷모습 — 눈이 없다
    const ox = face === 2 ? -r * 0.3 : face === 3 ? r * 0.3 : 0;
    c.fillStyle = t.mineCore;
    c.beginPath();
    if (face === 0) {
      c.arc(-r * 0.36, -r * 0.1, r * 0.26, 0, Math.PI * 2);
      c.arc(r * 0.36, -r * 0.1, r * 0.26, 0, Math.PI * 2);
    } else {
      c.arc(ox, -r * 0.1, r * 0.3, 0, Math.PI * 2);
    }
    c.fill();
  });
}

/** 스프라이트 하나를 (x,y) 중심으로 높이 h 로 그린다. ax 는 가로 기준점(0~1) */
function drawOwl(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, h: number,
  flip = false, ax = 0.5, ay = 0.5,
): void {
  const wdt = (img.naturalWidth / img.naturalHeight) * h;
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, -wdt * ax, -h * ay, wdt, h);
  ctx.restore();
}

const OWL_H = 60;

function drawPlayer(ctx: CanvasRenderingContext2D, w: World, px: number, py: number): void {
  const t = w.theme;
  const p = w.player;

  // 발밑 그림자
  ctx.fillStyle = t.glow ? "rgba(0,0,0,0.35)" : "rgba(20,27,51,0.18)";
  ctx.beginPath();
  ctx.ellipse(px, py + OWL_H * 0.42, 16, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // 마법진 — 시작 카운트다운 · 진화 · 부활 무적
  const circle = owl("circle");
  if (circle && (w.countdown > 0 || w.freeze > 0 || p.invuln > 0.5)) {
    ctx.save();
    ctx.globalAlpha = w.countdown > 0 ? 0.95 : 0.7;
    const cw = w.countdown > 0 ? 190 : 150;
    ctx.translate(px, py + 8);
    ctx.rotate(w.reduced ? 0 : p.anim * 0.4);
    ctx.scale(1, 0.62);
    ctx.drawImage(circle, -cw / 2, -cw / 2, cw, cw);
    ctx.restore();
  }

  if (p.iframe > 0 && p.hitT <= 0 && p.alive) ctx.globalAlpha = 0.6;

  // 어떤 모습을 그릴까
  let name: OwlSprite;
  let flip = false;
  let h = OWL_H;
  let ax = 0.5;
  let bobY = 0;
  let squash = 1;
  if (!p.alive) {
    name = "dead";
    h = 36;
  } else if (p.lvlT > 0) {
    name = "levelup";
    h = OWL_H * 1.9;
  } else if (p.hitT > 0) {
    name = "hit";
    h = OWL_H * 0.92;
  } else if (p.moving && (p.face === 2 || p.face === 3)) {
    // 옆으로 날아간다 — 이동 애니메이션 (오른쪽 기준, 왼쪽은 뒤집는다)
    name = MOVE_FRAMES[Math.floor(p.anim * 12) % MOVE_FRAMES.length];
    flip = p.face === 2;
    h = OWL_H * 0.82;
    ax = 0.68;
  } else if (p.moving) {
    name = p.face === 1 ? "back" : "front";
    if (!w.reduced) bobY = Math.sin(p.anim * 14) * 1.8;
  } else if (p.face === 2 || p.face === 3) {
    name = p.face === 2 ? "left" : "right";
  } else if (p.emoteT > 0 && p.emote > 0) {
    name = p.emote === 1 ? "happy" : p.emote === 2 ? "angry" : "surprised";
    h = OWL_H * 0.96;
  } else if (p.hp / Math.max(1, p.maxHp) <= CFG.feedback.lowHpRatio) {
    name = "angry";
    h = OWL_H * 0.96;
  } else {
    name = "idle";
    h = OWL_H * 0.96;
    if (!w.reduced) squash = 1 + Math.sin(p.anim * 3) * 0.025;
  }

  const img = owl(name);
  if (img) {
    if (p.lvlT > 0) ctx.globalAlpha = Math.min(1, 0.4 + p.lvlT * 1.5);
    ctx.save();
    ctx.translate(px, py + bobY);
    ctx.scale(1, squash);
    drawOwl(ctx, img, 0, 0, h, flip, ax, name === "levelup" ? 0.56 : 0.5);
    ctx.restore();
  } else {
    const s = owlFallback(t, p.alive ? p.face : 0);
    ctx.drawImage(s, px - s.width / 2, py + bobY - s.height / 2);
  }
  ctx.globalAlpha = 1;

  if (p.invuln > 0 && p.alive) {
    ctx.strokeStyle = alpha(t.hp, 0.9);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(px, py, CFG.player.radius + 16 + Math.sin(w.t * 18) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (p.shield) {
    ctx.strokeStyle = alpha(t.mine, 0.8);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, CFG.player.radius + 12, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (p.slow > 0) {
    // 느려짐 — 서리 고리
    ctx.save();
    ctx.strokeStyle = alpha(t.ice, t.glow ? 0.7 : 1);
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, CFG.player.radius + 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/* ── 내 공격 · 적 공격 ──────────────────────────────────────── */

/** 적 탄 — 둥근 구체 + 어두운 외곽선 + 밝은 코어 (내 탄과 절대 같아 보이면 안 된다) */
function foeSprite(t: Theme, r: number, color: string): HTMLCanvasElement {
  const R = Math.max(4, Math.round(r));
  const pad = t.glow ? 12 : 4;
  return make(`foe:${t.id}:${R}:${color}`, (R + pad) * 2, (R + pad) * 2, (c) => {
    c.save();
    neon(c, t, color, 14);
    c.fillStyle = color;
    c.beginPath();
    c.arc(0, 0, R, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.lineWidth = 2;
    c.strokeStyle = t.glow ? "rgba(20,0,16,0.85)" : "rgba(20,27,51,0.8)";
    c.beginPath();
    c.arc(0, 0, R - 1, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = "rgba(255,255,255,0.85)";
    c.beginPath();
    c.arc(-R * 0.25, -R * 0.25, R * 0.35, 0, Math.PI * 2);
    c.fill();
  });
}

/** 내 탄 — 가늘고 긴 빛줄기 (진행 방향으로 그린다) */
function streak(ctx: CanvasRenderingContext2D, t: Theme, x: number, y: number, vx: number, vy: number, len: number, width: number, color: string): void {
  const sp = Math.hypot(vx, vy) || 1;
  const dx = (vx / sp) * len;
  const dy = (vy / sp) * len;
  ctx.save();
  ctx.lineCap = "round";
  neon(ctx, t, color, 12);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x - dx, y - dy);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = t.glow ? t.mineCore : "rgba(255,255,255,0.9)";
  ctx.lineWidth = Math.max(1, width * 0.4);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - dx * 0.6, y - dy * 0.6);
  ctx.lineTo(x, y);
  ctx.stroke();
}

function drawBullet(ctx: CanvasRenderingContext2D, w: World, i: number, x: number, y: number): void {
  const t = w.theme;
  const b = w.bullets;
  const look = b.look[i];

  if (b.hostile[i]) {
    const color = look === 9 ? t.foeAlt : t.foe;
    const s = foeSprite(t, b.r[i], color);
    ctx.drawImage(s, x - s.width / 2, y - s.height / 2);
    // 맥동하는 바깥 고리 — 적 탄의 표시
    if (!w.reduced) {
      ctx.strokeStyle = alpha(color, 0.5);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, b.r[i] + 4 + Math.sin(w.t * 12 + i) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (look === 8) {
      // ⏱️ 추적탄 — 시계 바늘
      const a = w.t * 8;
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * b.r[i] * 0.8, y + Math.sin(a) * b.r[i] * 0.8);
      ctx.stroke();
    }
    return;
  }

  switch (look) {
    case 0: {
      // 🪶 깃털 표창 — 부엉이 화살 스프라이트
      const img = owl("arrow1");
      const a = Math.atan2(b.vy[i], b.vx[i]);
      if (img) {
        if (!w.reduced) streak(ctx, t, x, y, b.vx[i], b.vy[i], 16, 2.5, alpha(t.mine, 0.6));
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        const hgt = 26;
        const wdt = (img.naturalWidth / img.naturalHeight) * hgt;
        ctx.drawImage(img, -wdt * 0.55, -hgt / 2, wdt, hgt);
        ctx.restore();
      } else {
        streak(ctx, t, x, y, b.vx[i], b.vy[i], 18, 4, t.mine);
      }
      break;
    }
    case 1:
      streak(ctx, t, x, y, b.vx[i], b.vy[i], 34, 5, t.mine);
      break;
    case 2:
      streak(ctx, t, x, y, b.vx[i], b.vy[i], 28, 4, t.mine);
      break;
    case 3: {
      // 🛰️ 위성 — 빛나는 고리
      ctx.save();
      neon(ctx, t, t.mine, 14);
      ctx.strokeStyle = t.mine;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = t.mineCore;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 4:
      streak(ctx, t, x, y, b.vx[i], b.vy[i], 14, 3, t.mineAlt);
      break;
    case 5: {
      // 🌀 부메랑 — 도는 초승달
      const a = w.t * 14 + i;
      ctx.save();
      neon(ctx, t, t.mine, 12);
      ctx.strokeStyle = t.mine;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(x, y, 9, a, a + Math.PI * 1.2);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 6: {
      // 💣 커널 봄 — 깜박이는 보라 구
      const blink = b.life[i] < 0.5 ? (Math.sin(w.t * 30) > 0 ? 1 : 0.4) : 1;
      ctx.save();
      neon(ctx, t, t.mineAlt, 16);
      ctx.globalAlpha = blink;
      ctx.fillStyle = t.mineAlt;
      ctx.beginPath();
      ctx.moveTo(x, y - 10);
      ctx.lineTo(x + 10, y);
      ctx.lineTo(x, y + 10);
      ctx.lineTo(x - 10, y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case LOOK.turret: {
      // 🗼 포탑 — 네모 받침 + 적을 향해 도는 포신, 남은 수명은 받침 둘레 호로
      const a = b.vx[i] === 0 && b.vy[i] === 0 ? -Math.PI / 2 : Math.atan2(b.vy[i], b.vx[i]);
      ctx.save();
      neon(ctx, t, t.mine, 12);
      ctx.fillStyle = alpha(t.mine, 0.25);
      ctx.strokeStyle = t.mine;
      ctx.lineWidth = 2;
      ctx.fillRect(x - 10, y - 10, 20, 20);
      ctx.strokeRect(x - 10, y - 10, 20, 20);
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * 16, y + Math.sin(a) * 16);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = t.mineCore;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case LOOK.mine: {
      // 🪤 지뢰 — 적 탄(둥근 구)과 헷갈리지 않게 마름모 + 십자선, 끝이 가까우면 빨리 깜박인다
      const s = b.r[i];
      const blink = Math.sin(w.t * (b.life[i] < 1.5 ? 24 : 6) + i) > 0 ? 1 : 0.45;
      ctx.save();
      neon(ctx, t, t.mineAlt, 10);
      ctx.strokeStyle = t.mineAlt;
      ctx.fillStyle = alpha(t.mineAlt, 0.22);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - s);
      ctx.lineTo(x + s, y);
      ctx.lineTo(x, y + s);
      ctx.lineTo(x - s, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = blink;
      ctx.fillStyle = t.mineCore;
      ctx.fillRect(x - 1.5, y - s * 0.6, 3, s * 1.2);
      ctx.fillRect(x - s * 0.6, y - 1.5, s * 1.2, 3);
      ctx.globalAlpha = 1;
      break;
    }
    case LOOK.disc: {
      // 💿 원반 — 도는 고리 + 살
      const r = b.r[i];
      const a = w.t * 9 + i;
      ctx.save();
      neon(ctx, t, t.mine, 14);
      ctx.fillStyle = alpha(t.mine, 0.12);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = t.mine;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = alpha(t.mineCore, 0.8);
      for (let k = 0; k < 3; k++) {
        const q = a + (Math.PI * 2 * k) / 3;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(q) * r * 0.2, y + Math.sin(q) * r * 0.2);
        ctx.lineTo(x + Math.cos(q) * r * 0.9, y + Math.sin(q) * r * 0.9);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case LOOK.worm: {
      // 🐛 웜 — 진행 방향으로 꿈틀대는 짧은 선
      const sp = Math.hypot(b.vx[i], b.vy[i]) || 1;
      const ux = b.vx[i] / sp;
      const uy = b.vy[i] / sp;
      const len = 16;
      ctx.save();
      neon(ctx, t, t.mineAlt, 10);
      ctx.strokeStyle = t.mineAlt;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let s = 0; s <= 4; s++) {
        const q = s / 4;
        const wig = Math.sin(w.t * 22 + q * 6 + i) * 3;
        const px = x - ux * len * q - uy * wig;
        const py = y - uy * len * q + ux * wig;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = t.mineCore;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case LOOK.sweep: {
      // 🧭 레이더 스윕 — 플레이어에서 뻗은 회전 레이저
      const a = b.aux[i];
      const ex = x + Math.cos(a) * b.r[i];
      const ey = y + Math.sin(a) * b.r[i];
      ctx.save();
      ctx.lineCap = "round";
      neon(ctx, t, t.mine, 16);
      ctx.strokeStyle = alpha(t.mine, 0.85);
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = t.glow ? t.mineCore : "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      break;
    }
    default:
      streak(ctx, t, x, y, b.vx[i], b.vy[i], 14, 3, t.mine);
  }
}

/* ── 경험치 · 체력 ──────────────────────────────────────────── */

function gemSprite(t: Theme, size: number): HTMLCanvasElement {
  const pad = t.glow ? 10 : 4;
  return make(`gem:${t.id}:${size}`, (size + pad) * 2, (size + pad) * 2, (c) => {
    c.save();
    neon(c, t, t.xp, 12);
    c.fillStyle = t.xp;
    c.beginPath();
    c.moveTo(0, -size * 1.25);
    c.lineTo(size, 0);
    c.lineTo(0, size * 1.25);
    c.lineTo(-size, 0);
    c.closePath();
    c.fill();
    c.restore();
    // 반짝이는 면
    c.fillStyle = "rgba(255,255,255,0.75)";
    c.beginPath();
    c.moveTo(0, -size * 1.25);
    c.lineTo(size * 0.45, -size * 0.1);
    c.lineTo(-size * 0.2, -size * 0.1);
    c.closePath();
    c.fill();
    if (!t.glow) {
      c.strokeStyle = "rgba(20,27,51,0.6)";
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(0, -size * 1.25);
      c.lineTo(size, 0);
      c.lineTo(0, size * 1.25);
      c.lineTo(-size, 0);
      c.closePath();
      c.stroke();
    }
  });
}

function heartSprite(t: Theme): HTMLCanvasElement {
  const pad = t.glow ? 10 : 4;
  return make(`heal:${t.id}`, (7 + pad) * 2, (7 + pad) * 2, (c) => {
    c.save();
    neon(c, t, t.hp, 12);
    c.fillStyle = t.hp;
    c.fillRect(-2.5, -7, 5, 14);
    c.fillRect(-7, -2.5, 14, 5);
    c.restore();
    if (!t.glow) {
      c.strokeStyle = "rgba(20,27,51,0.6)";
      c.lineWidth = 1;
      c.strokeRect(-2.5, -7, 5, 14);
      c.strokeRect(-7, -2.5, 14, 5);
    }
  });
}

/* ── 배경 ───────────────────────────────────────────────────── */

function drawFloor(ctx: CanvasRenderingContext2D, w: World, camX: number, camY: number): void {
  const t = w.theme;
  const accent = stageAccent(w.stage);
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, CFG.view.w, CFG.view.h);

  const step = 64;
  const ox = -(((camX % step) + step) % step);
  const oy = -(((camY % step) + step) % step);
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

  // 단계 액센트 — 바닥에 옅게 깔아 단계를 구분한다
  ctx.fillStyle = alpha(accent, t.glow ? 0.05 : 0.08);
  ctx.fillRect(0, 0, CFG.view.w, CFG.view.h);
}

/* ── 보스 ───────────────────────────────────────────────────── */

/** 십오각형 시계 바늘 — 역행 중엔 거꾸로, 정지 중엔 멈춘다 */
function clockHands(ctx: CanvasRenderingContext2D, w: World, x: number, y: number, r: number, color: string): void {
  const b = w.boss;
  let a: number;
  if (b.chTimeout >= 0) {
    const k = Math.min(1, b.chTimeout / CFG.chrono.timeoutSec);
    a = -Math.PI / 2 - (1 - k) * Math.PI * 1.5;
  } else if (b.chRewindT > 0) {
    a = -w.t * 9;
  } else {
    a = (b.t / Math.max(1, b.chLimit)) * Math.PI * 2 - Math.PI / 2;
  }
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78);
  ctx.stroke();
  const m = w.frozen > 0 ? a * 0.1 : w.t * 0.6;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(m) * r * 0.5, y + Math.sin(m) * r * 0.5);
  ctx.stroke();
  ctx.lineCap = "butt";
}

function drawBoss(ctx: CanvasRenderingContext2D, w: World, i: number, x: number, y: number, clone: boolean): void {
  const t = w.theme;
  const e = w.enemies;
  const b = w.boss;
  const r = e.r[i] * (w.reduced ? 1 : 1 + Math.sin(w.t * 3) * 0.02);
  const sides = e.sides[i];
  const rot = e.phase[i];
  const color = t.boss;

  // 🟥 십삼각형 즉사 — 몸이 둘로 갈라진다
  const split = !clone && b.kind === "trideca" && b.triDoomWarn > 0 ? (1 - b.triDoomWarn / CFG.trideca.doomWarn) * 26 : 0;

  const kindName = ENEMY_KINDS[e.kind[i]];
  const artName = (kindName === "clone" ? "chrono" : kindName) as MobArt;
  const art = mobArt(artName);
  if (art) {
    // 🔷 육각형은 레이저가 꼭짓점에서 나가므로 그림도 같이 돈다. 나머지는 똑바로 선다
    const turn = artName === "hexa" ? rot + Math.PI / 2 : w.reduced ? 0 : Math.sin(w.t * 1.5 + i) * 0.05;
    const flash = e.flash[i] > 0 ? e.flash[i] / CFG.feedback.hitFlashSec : 0;
    for (let half = 0; half < (split > 0 ? 2 : 1); half++) {
      ctx.save();
      const off = split > 0 ? (half === 0 ? -split : split) : 0;
      ctx.translate(x + off, y);
      if (split > 0) {
        ctx.beginPath();
        ctx.rect(half === 0 ? -r * 3 : 0, -r * 3, r * 3, r * 6);
        ctx.clip();
      }
      ctx.rotate(turn);
      drawArt(ctx, t, art, artName, r, BOSS_VIS, flash, sides);
      ctx.restore();
    }
  }

  for (let half = 0; half < (art ? 0 : split > 0 ? 2 : 1); half++) {
    ctx.save();
    const off = split > 0 ? (half === 0 ? -split : split) : 0;
    ctx.translate(x + off, y);
    if (split > 0) {
      ctx.beginPath();
      ctx.rect(half === 0 ? -r * 2 : 0, -r * 2, r * 2, r * 4);
      ctx.clip();
    }
    // 네온 튜브 — 어두운 속 + 빛나는 두꺼운 테두리 + 안쪽 결
    ctx.fillStyle = e.flash[i] > 0 ? "#FFFFFF" : t.glow ? alpha(color, 0.22) : color;
    shape(ctx, sides, r, rot);
    ctx.fill();
    ctx.save();
    neon(ctx, t, color, 28);
    ctx.strokeStyle = t.glow ? color : "rgba(20,27,51,0.7)";
    ctx.lineWidth = t.glow ? 4 : 2.5;
    shape(ctx, sides, r, rot);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = t.glow ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1.2;
    shape(ctx, sides, r * 0.7, -rot * 0.6);
    ctx.stroke();
    ctx.restore();
  }

  const kind = ENEMY_KINDS[e.kind[i]];
  if (art) {
    // 그림에 얼굴·시계가 이미 있다
  } else if (kind === "chrono" || kind === "clone") {
    ctx.fillStyle = alpha(t.bg, 0.75);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
    ctx.fill();
    for (let k = 0; k < 12; k++) {
      const a = (Math.PI * 2 * k) / 12 - Math.PI / 2;
      ctx.fillStyle = alpha(t.text, k % 3 === 0 ? 0.9 : 0.4);
      ctx.fillRect(x + Math.cos(a) * r * 0.54 - 1.5, y + Math.sin(a) * r * 0.54 - 1.5, 3, 3);
    }
    clockHands(ctx, w, x, y, r * 0.62, t.text);
  } else {
    ctx.save();
    neon(ctx, t, color, 14);
    ctx.fillStyle = t.glow ? color : alpha(t.text, 0.85);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (clone) return;

  // 🔵 포식 게이지 — 몸을 두르는 호
  if (b.kind === "nona") {
    const g = Math.min(1, b.nonaGauge / CFG.nona.gaugeMax);
    ctx.strokeStyle = alpha(t.danger, 0.9);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, r + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * g);
    ctx.stroke();
  }

  // 공격 가능한 방향 — 노란 임팩트 (구각형 약점 · 십오각형 12시/6시)
  if (b.gateOn) {
    const pulse = 0.65 + Math.sin(w.t * 10) * 0.25;
    ctx.save();
    neon(ctx, t, "#FACC15", 18);
    ctx.strokeStyle = alpha("#FACC15", pulse);
    ctx.lineWidth = 7;
    for (let k = 0; k < b.gateN; k++) {
      ctx.beginPath();
      ctx.arc(x, y, r + 4, b.gateA[k] - b.gateW, b.gateA[k] + b.gateW);
      ctx.stroke();
      ctx.fillStyle = alpha("#FACC15", pulse);
      ctx.beginPath();
      ctx.arc(x + Math.cos(b.gateA[k]) * r, y + Math.sin(b.gateA[k]) * r, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = alpha(t.text, 0.25);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r + 12, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (b.intro > 0 || b.shield > 0) {
    ctx.strokeStyle = alpha(t.boss, 0.5 + Math.sin(w.t * 20) * 0.3);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r + 16, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/* ── 스킬 이펙트 ────────────────────────────────────────────── */

function drawFx(ctx: CanvasRenderingContext2D, w: World, camX: number, camY: number): void {
  const t = w.theme;
  const f = w.fx;
  for (let i = 0; i < f.cap; i++) {
    if (!f.alive[i]) continue;
    const x = f.x[i] - camX;
    const y = f.y[i] - camY;
    if (x < -300 || x > CFG.view.w + 300 || y < -300 || y > CFG.view.h + 300) continue;
    const k = 1 - f.life[i] / Math.max(0.001, f.max[i]); // 0 → 1
    const color = paint(t, f.color[i]);

    switch (f.kind[i]) {
      case FX.ring:
      case FX.heal: {
        ctx.save();
        neon(ctx, t, color, 14);
        ctx.strokeStyle = alpha(color, (1 - k) * 0.9);
        ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(x, y, f.r[i] * (0.3 + 0.7 * k), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        if (f.kind[i] === FX.heal) {
          ctx.fillStyle = alpha(color, 1 - k);
          ctx.fillRect(x - 2, y - 14 - k * 16, 4, 12);
          ctx.fillRect(x - 6, y - 10 - k * 16, 12, 4);
        }
        break;
      }
      case FX.cone: {
        // ❄️ 서리 부채꼴 — 밝고 반투명 (경험치 금색과 절대 겹치지 않는다)
        const a = f.ang[i];
        const r = f.r[i] * (0.6 + 0.4 * k);
        ctx.save();
        ctx.globalAlpha = (1 - k) * (t.glow ? 0.55 : 0.75);
        const g = ctx.createRadialGradient(x, y, 4, x, y, r);
        g.addColorStop(0, alpha(t.ice, 0.9));
        g.addColorStop(1, alpha(t.ice, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, r, a - 0.52, a + 0.52);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = t.glow ? "rgba(255,255,255,0.8)" : alpha(t.mine, 0.8);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, r, a - 0.52, a + 0.52);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case FX.slash: {
        const img = owl("slash");
        const size = f.r[i] * 2.6;
        ctx.save();
        ctx.globalAlpha = 1 - k * 0.8;
        ctx.translate(x, y);
        ctx.rotate(f.ang[i]);
        ctx.scale(0.8 + k * 0.3, 0.8 + k * 0.3);
        if (img) {
          const hgt = (img.naturalHeight / img.naturalWidth) * size;
          ctx.drawImage(img, -size / 2, -hgt / 2, size, hgt);
        } else {
          neon(ctx, t, t.mine, 16);
          ctx.strokeStyle = t.mine;
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(0, 0, f.r[i], -1.1, 1.1);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case FX.strike: {
        // 하늘에서 떨어지는 빛기둥 → 링
        ctx.save();
        neon(ctx, t, color, 18);
        if (k < 0.35) {
          const q = k / 0.35;
          ctx.strokeStyle = alpha(color, 0.9);
          ctx.lineWidth = 6 * (1 - q) + 2;
          ctx.beginPath();
          ctx.moveTo(x, y - 160 * (1 - q) - 20);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        ctx.strokeStyle = alpha(color, 1 - k);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, f.r[i] * k, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case FX.chain: {
        // ⚡ 지그재그 번개
        const x2 = f.x2[i] - camX;
        const y2 = f.y2[i] - camY;
        const dx = x2 - x;
        const dy = y2 - y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        ctx.save();
        neon(ctx, t, color, 14);
        ctx.strokeStyle = alpha(color, 1 - k * 0.7);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s = 1; s < 6; s++) {
          const q = s / 6;
          const off = (((s * 7919 + i * 31) % 13) - 6) * 1.6;
          ctx.lineTo(x + dx * q + nx * off, y + dy * q + ny * off);
        }
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case FX.beam: {
        // 🔭 곧은 광선 — 저격·채찍·킬 스위치. r 이 선 굵기
        const x2 = f.x2[i] - camX;
        const y2 = f.y2[i] - camY;
        ctx.save();
        ctx.lineCap = "round";
        neon(ctx, t, color, 16);
        ctx.strokeStyle = alpha(color, (1 - k) * 0.9);
        ctx.lineWidth = f.r[i] * (1 - k * 0.6) + 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = alpha(t.glow ? t.mineCore : "#FFFFFF", 1 - k);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        break;
      }
      case FX.spawn: {
        ctx.strokeStyle = alpha(color, 1 - k);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, f.r[i] * (1.8 - k), 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case FX.death: {
        // 도형이 깨지며 퍼지는 네온 링 + 조각
        ctx.save();
        neon(ctx, t, color, 12);
        ctx.strokeStyle = alpha(color, (1 - k) * 0.9);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, f.r[i] * (1 + k * 1.6), 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = alpha(color, 1 - k);
        for (let s = 0; s < 4; s++) {
          const a = f.ang[i] + (Math.PI / 2) * s + k;
          const d = f.r[i] * (0.6 + k * 2.2);
          ctx.save();
          ctx.translate(x + Math.cos(a) * d, y + Math.sin(a) * d);
          ctx.rotate(a + k * 6);
          ctx.fillRect(-3, -1.5, 6, 3);
          ctx.restore();
        }
        ctx.restore();
        break;
      }
      default:
        break;
    }
  }
}

/* ── 본체 ───────────────────────────────────────────────────── */

export function render(ctx: CanvasRenderingContext2D, w: World): void {
  const t = w.theme;
  const camX = w.cam.x - CFG.view.w / 2;
  const camY = w.cam.y - CFG.view.h / 2;
  const b = w.boss;

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
  const onScreen = (x: number, y: number, m: number) => x > -m && x < CFG.view.w + m && y > -m && y < CFG.view.h + m;

  // 🟥 콜로세움 — 밖은 어둡게
  if (b.active && b.kind === "trideca") {
    const cx = vx(b.triArenaX);
    const cy = vy(b.triArenaY);
    ctx.save();
    ctx.fillStyle = alpha(t.danger, t.glow ? 0.12 : 0.1);
    ctx.beginPath();
    ctx.rect(-20, -20, CFG.view.w + 40, CFG.view.h + 40);
    ctx.arc(cx, cy, b.triArenaR, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
    neon(ctx, t, t.danger, 18);
    ctx.strokeStyle = alpha(t.danger, b.triDoomWarn > 0 ? 0.6 + Math.sin(w.t * 24) * 0.4 : 0.75);
    ctx.lineWidth = b.triDoomWarn > 0 ? 8 : 4;
    ctx.beginPath();
    ctx.arc(cx, cy, b.triArenaR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (b.triDoomWarn > 0) {
      ctx.fillStyle = alpha(t.danger, 0.1 + 0.25 * (1 - b.triDoomWarn / CFG.trideca.doomWarn));
      ctx.beginPath();
      ctx.arc(cx, cy, b.triArenaR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 🛡️ 방화벽 오라 — 늘 켜져 있는 내 장판 (파란 점선 고리)
  const aura = w.actives.find((s) => ACTIVES[s.id].arch === "aura");
  if (aura && w.player.alive) {
    const r = auraRadius(ACTIVES[aura.id], aura.lv, aura.evo !== null, w.stats);
    const px = vx(w.player.x);
    const py = vy(w.player.y);
    ctx.save();
    ctx.fillStyle = alpha(t.mine, t.glow ? 0.07 : 0.1);
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    neon(ctx, t, t.mine, 10);
    ctx.strokeStyle = alpha(t.mine, 0.55);
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = w.reduced ? 0 : -w.t * 30;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 장판
  const h = w.hazards;
  for (let i = 0; i < h.cap; i++) {
    if (!h.alive[i]) continue;
    const x = vx(h.x[i]);
    const y = vy(h.y[i]);
    if (!onScreen(x, y, h.r[i] + 40)) continue;
    const kind = h.kind[i];
    const life = h.life[i] / Math.max(0.001, h.max[i]);

    if (kind === HZ.warn) {
      const lethal = (h.flag[i] & HZ_LETHAL) !== 0;
      ctx.save();
      neon(ctx, t, t.danger, 14);
      ctx.fillStyle = alpha(t.danger, lethal ? 0.22 : 0.14);
      ctx.beginPath();
      ctx.arc(x, y, h.r[i], 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = alpha(t.danger, lethal ? 0.5 : 0.32);
      ctx.beginPath();
      ctx.arc(x, y, h.r[i] * (1 - life), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = alpha(t.danger, 0.9);
      ctx.lineWidth = lethal ? 3 : 2;
      ctx.beginPath();
      ctx.arc(x, y, h.r[i], 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      if (lethal) {
        ctx.fillStyle = alpha(t.text, 0.9);
        ctx.fillRect(x - 2, y - 12, 4, 14);
        ctx.fillRect(x - 2, y + 5, 4, 4);
      }
      continue;
    }
    if (kind === HZ.hole) {
      const warn = h.tick[i] > 0;
      ctx.save();
      if (warn) {
        ctx.setLineDash([10, 8]);
        ctx.strokeStyle = alpha(t.boss, 0.85);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, h.r[i], 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const g = ctx.createRadialGradient(x, y, 4, x, y, h.r[i]);
        g.addColorStop(0, "rgba(0,0,0,0.95)");
        g.addColorStop(0.5, alpha(t.boss, 0.45));
        g.addColorStop(1, alpha(t.boss, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, h.r[i], 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = alpha(t.boss, 0.8);
        ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) {
          const a = w.t * 3 + (Math.PI * 2 * k) / 3;
          ctx.beginPath();
          ctx.arc(x, y, h.r[i] * 0.6, a, a + 1.2);
          ctx.stroke();
        }
      }
      ctx.restore();
      continue;
    }

    // 내 장판은 차가운 색(파랑·보라·서리), 적 장판은 뜨거운 색
    const mine = kind === HZ.field || kind === HZ.honey || kind === HZ.pull || kind === HZ.stun || kind === HZ.burn;
    const color =
      kind === HZ.enemy || kind === HZ.red ? t.danger
        : kind === HZ.blue ? t.ice
          : kind === HZ.safe ? t.hp
            : kind === HZ.pull || kind === HZ.honey ? t.mineAlt
              : kind === HZ.stun ? t.ice
                : t.mine;
    ctx.save();
    neon(ctx, t, color, 16);
    const flick = kind === HZ.burn && !w.reduced ? 0.06 * Math.sin(w.t * 20 + i) : 0;
    ctx.fillStyle = alpha(color, kind === HZ.red ? 0.55 : kind === HZ.safe ? 0.2 : mine ? 0.13 + 0.08 * life + flick : 0.16 + 0.1 * life);
    ctx.beginPath();
    ctx.arc(x, y, h.r[i], 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = alpha(color, 0.8);
    ctx.lineWidth = kind === HZ.safe ? 3 : 2;
    if (mine) ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.restore();
  }

  // 장애물
  const o = w.obstacles;
  for (let i = 0; i < o.cap; i++) {
    if (!o.alive[i]) continue;
    const x = vx(o.x[i]) - o.w[i] / 2;
    const y = vy(o.y[i]) - o.h[i] / 2;
    if (!onScreen(x, y, 120)) continue;
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

  // 경험치 보석 · 체력
  const orbs = w.orbs;
  for (let i = 0; i < orbs.cap; i++) {
    if (!orbs.alive[i]) continue;
    const x = vx(orbs.x[i]);
    const y = vy(orbs.y[i]);
    if (!onScreen(x, y, 20)) continue;
    const s = orbs.kind[i] === 1 ? heartSprite(t) : gemSprite(t, orbs.value[i] >= 6 ? 7 : orbs.value[i] >= 3 ? 6 : 5);
    ctx.drawImage(s, x - s.width / 2, y - s.height / 2);
  }

  // 레이저 — 경고선 → 발사
  const bm = w.beams;
  for (let i = 0; i < bm.cap; i++) {
    if (!bm.alive[i]) continue;
    const x = vx(bm.x[i]);
    const y = vy(bm.y[i]);
    const ex = x + Math.cos(bm.ang[i]) * bm.len[i];
    const ey = y + Math.sin(bm.ang[i]) * bm.len[i];
    ctx.save();
    if (bm.warn[i] > 0) {
      if (bm.kind[i] === BEAM.telegraph) {
        ctx.setLineDash([14, 10]);
        ctx.strokeStyle = alpha(t.danger, 0.75);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = alpha(t.danger, 0.15);
        ctx.lineWidth = bm.width[i];
      } else {
        ctx.strokeStyle = alpha(t.danger, 0.25 + Math.sin(w.t * 30) * 0.12);
        ctx.lineWidth = bm.width[i] * (0.4 + Math.min(1.6, bm.warn[i] * 1.6));
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.strokeStyle = alpha(t.danger, 0.85);
        ctx.lineWidth = 1.5;
      }
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    } else {
      neon(ctx, t, t.danger, 24);
      ctx.strokeStyle = alpha(t.danger, 0.9);
      ctx.lineWidth = bm.width[i];
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.strokeStyle = alpha("#FFFFFF", 0.85);
      ctx.lineWidth = bm.width[i] * 0.35;
      ctx.stroke();
    }
    ctx.restore();
  }

  // 적
  const e = w.enemies;
  const bombIdx = ENEMY_KINDS.indexOf("bomb");
  const cloneIdx = ENEMY_KINDS.indexOf("clone");
  for (let i = 0; i < e.cap; i++) {
    if (!e.alive[i]) continue;
    const x = vx(e.x[i]);
    const y = vy(e.y[i]);
    if (!onScreen(x, y, e.r[i] + 60)) continue;

    if (e.rank[i] === 3 || e.kind[i] === cloneIdx) {
      drawBoss(ctx, w, i, x, y, e.kind[i] === cloneIdx);
      continue;
    }

    if (e.kind[i] === bombIdx) {
      const fuse = e.life[i] / CFG.chrono.bombFuse;
      ctx.save();
      neon(ctx, t, t.foe, 16);
      ctx.fillStyle = e.flash[i] > 0 ? "#FFFFFF" : t.foe;
      ctx.beginPath();
      ctx.arc(x, y, e.r[i] * (1 + (fuse < 0.25 ? Math.sin(w.t * 25) * 0.08 : 0)), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = alpha(t.text, 0.9);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, e.r[i] + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fuse);
      ctx.stroke();
      continue;
    }

    // 🔶 오각형 돌진 예고선
    if (e.dashT[i] > 0) {
      const k = 1 - e.dashT[i] / CFG.ai.charge.windup;
      const len = CFG.ai.charge.speed * CFG.ai.charge.time;
      ctx.strokeStyle = alpha(t.danger, 0.2 + 0.55 * k);
      ctx.lineWidth = e.r[i] * 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + e.dirX[i] * len, y + e.dirY[i] * len);
      ctx.stroke();
    }

    drawMob(ctx, w, i, x, y);

    // 🔵 구각형 버프를 받은 몬스터
    if (e.buff[i]) {
      ctx.strokeStyle = alpha(t.boss, 0.85);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, e.r[i] + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 상태이상 — ❄️ 둔화는 서리 점선, 🔥 화상은 파란 불꽃, 🎯 표식은 조준선
    if (e.slowT[i] > 0) {
      ctx.save();
      ctx.strokeStyle = alpha(t.ice, t.glow ? 0.8 : 1);
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, e.r[i] + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (e.burnT[i] > 0) {
      ctx.fillStyle = alpha(t.mine, 0.8);
      const fl = w.reduced ? 0 : Math.sin(w.t * 25 + i) * 2;
      ctx.beginPath();
      ctx.moveTo(x - 4, y - e.r[i] - 2);
      ctx.lineTo(x, y - e.r[i] - 12 - fl);
      ctx.lineTo(x + 4, y - e.r[i] - 2);
      ctx.fill();
    }
    if (e.stunT[i] > 0) {
      ctx.strokeStyle = alpha(t.dim, 0.9);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y - e.r[i] - 6, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (e.markT[i] > 0) {
      ctx.strokeStyle = alpha(t.mine, 0.9);
      ctx.lineWidth = 1.5;
      const m = e.r[i] + 7;
      ctx.beginPath();
      ctx.moveTo(x - m, y); ctx.lineTo(x - m + 5, y);
      ctx.moveTo(x + m, y); ctx.lineTo(x + m - 5, y);
      ctx.moveTo(x, y - m); ctx.lineTo(x, y - m + 5);
      ctx.moveTo(x, y + m); ctx.lineTo(x, y + m - 5);
      ctx.stroke();
    }

    // 튼튼한 몬스터 체력 바 (십사각형)
    if (e.sides[i] === 14 && e.hp[i] < e.maxHp[i]) {
      const bw = e.r[i] * 2.2;
      ctx.fillStyle = alpha(t.text, 0.25);
      ctx.fillRect(x - bw / 2, y - e.r[i] - 12, bw, 4);
      ctx.fillStyle = t.hp;
      ctx.fillRect(x - bw / 2, y - e.r[i] - 12, bw * Math.max(0, e.hp[i] / e.maxHp[i]), 4);
    }
  }

  // 투사체 — 적 탄 먼저, 내 탄은 그 위에
  const bl = w.bullets;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < bl.cap; i++) {
      if (!bl.alive[i]) continue;
      if ((bl.hostile[i] ? 0 : 1) !== pass) continue;
      const x = vx(bl.x[i]);
      const y = vy(bl.y[i]);
      if (!onScreen(x, y, 60)) continue;
      drawBullet(ctx, w, i, x, y);
    }
  }

  drawFx(ctx, w, camX, camY);

  // 플레이어
  const p = w.player;
  drawPlayer(ctx, w, vx(p.x), vy(p.y));

  // 보스가 화면 밖이면 가장자리에 방향 표시
  if (b.active && b.idx >= 0) {
    const bx = vx(e.x[b.idx]);
    const by = vy(e.y[b.idx]);
    if (!onScreen(bx, by, -20)) {
      const a = Math.atan2(by - CFG.view.h / 2, bx - CFG.view.w / 2);
      const ax = CFG.view.w / 2 + Math.cos(a) * (CFG.view.w / 2 - 28);
      const ay = CFG.view.h / 2 + Math.sin(a) * (CFG.view.h / 2 - 28);
      ctx.save();
      ctx.translate(Math.max(20, Math.min(CFG.view.w - 20, ax)), Math.max(60, Math.min(CFG.view.h - 20, ay)));
      ctx.rotate(a);
      ctx.fillStyle = t.boss;
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-8, -9);
      ctx.lineTo(-8, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // 파티클
  const q = w.particles;
  for (let i = 0; i < q.cap; i++) {
    if (!q.alive[i]) continue;
    ctx.globalAlpha = Math.max(0, q.life[i] / q.max[i]);
    ctx.fillStyle = paint(t, q.color[i]);
    ctx.fillRect(vx(q.x[i]) - q.r[i] / 2, vy(q.y[i]) - q.r[i] / 2, q.r[i], q.r[i]);
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  /* ── 화면 효과 ── */

  if (w.frozen > 0) {
    ctx.fillStyle = alpha(t.mine, 0.1);
    ctx.fillRect(0, 0, CFG.view.w, CFG.view.h);
  }

  if (b.active && b.kind === "chrono" && (b.chRewindT > 0 || b.chTimeout >= 0)) {
    const R = CFG.view.h * 0.38;
    const cx = CFG.view.w / 2;
    const cy = CFG.view.h / 2;
    ctx.save();
    ctx.globalAlpha = b.chTimeout >= 0 ? 0.9 : 0.35;
    ctx.strokeStyle = t.text;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    for (let k = 0; k < 12; k++) {
      const a = (Math.PI * 2 * k) / 12 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * R * 0.88, cy + Math.sin(a) * R * 0.88);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.stroke();
    }
    clockHands(ctx, w, cx, cy, R, t.text);
    ctx.restore();
  }

  // 체력 30% 이하 — 가장자리 적색 맥동 (§9.1)
  const hpRatio = p.hp / Math.max(1, p.maxHp);
  const low = hpRatio <= CFG.feedback.lowHpRatio ? 0.25 + Math.sin(w.t * 6) * 0.1 : 0;
  const rage = b.active && b.kind === "chrono" ? (b.chRage / CFG.chrono.rage.max) * 0.25 * (0.6 + chronoGrowth(w) * 0.4) : 0;
  const vig = Math.max(w.vignette * 0.5, low, rage);
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

  if (w.reduced && w.shake > 0) {
    ctx.strokeStyle = alpha(t.danger, Math.min(0.9, w.shake * 3));
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, CFG.view.w - 8, CFG.view.h - 8);
  }

  if (w.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.5, w.flash)})`;
    ctx.fillRect(0, 0, CFG.view.w, CFG.view.h);
  }

  if (w.gray > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "saturation";
    ctx.globalAlpha = w.gray;
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, CFG.view.w, CFG.view.h);
    ctx.restore();
  }
}
