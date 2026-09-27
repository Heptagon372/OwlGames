// 🦉 아울 서바이버즈 v3 — 장애물 (기획서 §3)
//
// 맵이 무한이라 한 번에 깔 수 없다. 대신 **전역 격자의 칸마다** 장애물이 있을지·무엇일지를
// 시드로 결정해 두고, 카메라 주변 칸만 풀에 올린다(멀어지면 회수). 같은 칸은 언제 와도 같다.
//
// 통로 140px 보장: 칸 간격 = 가장 큰 장애물 + 140px 이라, 이웃한 두 장애물은 x 나 y 중
// 한 축이 반드시 140px 이상 떨어진다 (홀수 행은 반 칸 밀어 격자 티를 없앤다).
// 밀도 6~9%: 칸 점유 확률 × 종류별 평균 면적 ÷ 칸 면적 ≈ 7%.

import { msg, ref } from "@/games/core/i18n";
import { CFG } from "../config";
import { burst, damageEnemy, PC, pushLog, spawnOrb, TAG, type World } from "./world";

// 크기는 그림(`public/assets/survive-obstacles/`, `engine/assets.ts` 의 `OBSTACLE_ART`)의
// 단단한 부분 비율에 맞췄다 — 판정 사각형과 보이는 그림이 어긋나지 않게.
export const OBSTACLE_KINDS = [
  { id: "rack", hp: 30, w: 100, h: 42 },
  { id: "box", hp: 15, w: 54, h: 50 },
  { id: "extinguisher", hp: 10, w: 36, h: 60 },
  { id: "cable", hp: 20, w: 78, h: 40 },
  { id: "portal", hp: 25, w: 88, h: 42 },
] as const;

const MAX_W = Math.max(...OBSTACLE_KINDS.map((k) => k.w));
const MAX_H = Math.max(...OBSTACLE_KINDS.map((k) => k.h));
export const COL_STEP = MAX_W + CFG.obstacle.minCorridorPx;
export const ROW_STEP = MAX_H + CFG.obstacle.minCorridorPx;

/**
 * 두 장애물 사이로 지나갈 수 있는가.
 * 축 하나만 140px 이상 떨어져 있으면 그 방향으로 지나갈 수 있다.
 */
export function passable(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
  need: number,
): boolean {
  const gapX = Math.abs(ax - bx) - (aw + bw) / 2;
  const gapY = Math.abs(ay - by) - (ah + bh) / 2;
  return Math.max(gapX, gapY) >= need;
}

/* ── 결정적 배치 ────────────────────────────────────────────── */

function hash(seed: number, cx: number, cy: number, salt: number): number {
  let h = (seed ^ Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ Math.imul(salt, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** 칸 중심 (홀수 행은 반 칸의 절반만큼 민다) */
export function cellCenter(cx: number, cy: number): { x: number; y: number } {
  const shift = cy & 1 ? COL_STEP * 0.25 : 0;
  return { x: cx * COL_STEP + COL_STEP / 2 + shift, y: cy * ROW_STEP + ROW_STEP / 2 };
}

/** 칸 (cx,cy) 에 놓일 장애물 종류. 없으면 -1 */
export function obstacleAt(seed: number, cx: number, cy: number): number {
  const c = cellCenter(cx, cy);
  // 시작 지점(원점) 주변은 비워 둔다
  if (Math.hypot(c.x, c.y) < CFG.obstacle.spawnClearRadius + MAX_W / 2) return -1;
  if (hash(seed, cx, cy, 1) >= CFG.obstacle.occupancy) return -1;
  const weights = CFG.obstacle.kindWeights;
  let r = hash(seed, cx, cy, 2) * weights.reduce((a, b) => a + b, 0);
  for (let k = 0; k < weights.length; k++) {
    r -= weights[k];
    if (r < 0) return k;
  }
  return weights.length - 1;
}

/** 영역 안 장애물 밀도 (테스트·튜닝용 — 풀이 아니라 생성 규칙으로 잰다) */
export function densityIn(seed: number, x0: number, y0: number, x1: number, y1: number): number {
  let covered = 0;
  const cy0 = Math.floor(y0 / ROW_STEP);
  const cy1 = Math.floor(y1 / ROW_STEP);
  const cx0 = Math.floor(x0 / COL_STEP) - 1;
  const cx1 = Math.floor(x1 / COL_STEP);
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const k = obstacleAt(seed, cx, cy);
      if (k < 0) continue;
      const c = cellCenter(cx, cy);
      if (c.x < x0 || c.x >= x1 || c.y < y0 || c.y >= y1) continue;
      covered += OBSTACLE_KINDS[k].w * OBSTACLE_KINDS[k].h;
    }
  }
  return covered / ((x1 - x0) * (y1 - y0));
}

function isBroken(w: World, cx: number, cy: number): boolean {
  const b = w.broken;
  for (let i = 0; i < b.n; i++) if (b.cx[i] === cx && b.cy[i] === cy) return true;
  return false;
}

function markBroken(w: World, cx: number, cy: number): void {
  const b = w.broken;
  b.cx[b.head] = cx;
  b.cy[b.head] = cy;
  b.head = (b.head + 1) % b.cx.length;
  b.n = Math.min(b.cx.length, b.n + 1);
}

function isLoaded(w: World, cx: number, cy: number): boolean {
  const o = w.obstacles;
  for (let i = 0; i < o.cap; i++) if (o.alive[i] && o.cx[i] === cx && o.cy[i] === cy) return true;
  return false;
}

function place(w: World, cx: number, cy: number, kind: number): boolean {
  const o = w.obstacles;
  let i = -1;
  for (let k = 0; k < o.cap; k++) if (!o.alive[k]) { i = k; break; }
  if (i < 0) return false;
  const spec = OBSTACLE_KINDS[kind];
  const c = cellCenter(cx, cy);
  o.alive[i] = 1;
  o.x[i] = c.x; o.y[i] = c.y;
  o.w[i] = spec.w; o.h[i] = spec.h;
  o.hp[i] = spec.hp; o.maxHp[i] = spec.hp;
  o.kind[i] = kind;
  o.flash[i] = 0;
  o.cx[i] = cx; o.cy[i] = cy;
  return true;
}

/**
 * 카메라 주변 칸을 채우고, 멀어진 장애물은 풀에서 뺀다.
 * 카메라가 칸 하나를 넘어갈 때만 돈다 (매 프레임 전수 검사 금지).
 */
export function streamObstacles(w: World, force = false): void {
  const ccx = Math.floor(w.cam.x / COL_STEP);
  const ccy = Math.floor(w.cam.y / ROW_STEP);
  if (!force && ccx === w.streamCx && ccy === w.streamCy) return;
  w.streamCx = ccx;
  w.streamCy = ccy;

  const m = CFG.obstacle.streamMargin;
  const x0 = w.cam.x - CFG.view.w / 2 - m;
  const x1 = w.cam.x + CFG.view.w / 2 + m;
  const y0 = w.cam.y - CFG.view.h / 2 - m;
  const y1 = w.cam.y + CFG.view.h / 2 + m;

  // 회수 (조금 더 멀리서 — 경계에서 깜빡이지 않게)
  const o = w.obstacles;
  const pad = COL_STEP;
  for (let i = 0; i < o.cap; i++) {
    if (!o.alive[i]) continue;
    if (o.x[i] < x0 - pad || o.x[i] > x1 + pad || o.y[i] < y0 - pad || o.y[i] > y1 + pad) o.alive[i] = 0;
  }

  // 채우기
  for (let cy = Math.floor(y0 / ROW_STEP); cy <= Math.floor(y1 / ROW_STEP); cy++) {
    for (let cx = Math.floor(x0 / COL_STEP) - 1; cx <= Math.floor(x1 / COL_STEP); cx++) {
      const kind = obstacleAt(w.seed, cx, cy);
      if (kind < 0 || isBroken(w, cx, cy) || isLoaded(w, cx, cy)) continue;
      if (!place(w, cx, cy, kind)) return;
    }
  }
}

/** 지금 풀에 올라와 있는 장애물 수 */
export function loadedObstacles(w: World): number {
  let n = 0;
  for (let i = 0; i < w.obstacles.cap; i++) if (w.obstacles.alive[i]) n++;
  return n;
}

/**
 * 보스가 싸울 자리를 치운다 (§8 "보스 패턴 가림 방지").
 * 반경 안 장애물을 ratio 확률로 없애고, 부서진 칸으로 기억해 다시 깔리지 않게 한다.
 */
export function clearArea(w: World, x: number, y: number, r: number, ratio = 1): void {
  const o = w.obstacles;
  for (let i = 0; i < o.cap; i++) {
    if (!o.alive[i]) continue;
    if (Math.hypot(o.x[i] - x, o.y[i] - y) > r) continue;
    if (ratio < 1 && w.rand() >= ratio) continue;
    o.alive[i] = 0;
    markBroken(w, o.cx[i], o.cy[i]);
    burst(w, o.x[i], o.y[i], 6, 2, 90);
  }
}

/** ⏪ 시간 역주행 — 최근에 부서진 칸 n 개를 되살린다 */
export function restoreObstacles(w: World, n: number): number {
  const b = w.broken;
  let restored = 0;
  while (restored < n && b.n > 0) {
    b.head = (b.head - 1 + b.cx.length) % b.cx.length;
    b.n -= 1;
    restored++;
  }
  streamObstacles(w, true);
  return restored;
}

/** 장애물 피해. 파괴되면 XP 조각과 가끔 체력을 떨군다 */
export function damageObstacle(w: World, i: number, amount: number): boolean {
  const o = w.obstacles;
  if (!o.alive[i]) return false;
  o.hp[i] -= amount;
  o.flash[i] = CFG.feedback.hitFlashSec;
  if (o.hp[i] > 0) return false;

  o.alive[i] = 0;
  markBroken(w, o.cx[i], o.cy[i]);
  w.run.obstacles += 1;
  const x = o.x[i];
  const y = o.y[i];
  burst(w, x, y, 10, 2, 150);

  const n = CFG.obstacle.xpMin + Math.floor(w.rand() * (CFG.obstacle.xpMax - CFG.obstacle.xpMin + 1));
  for (let k = 0; k < n; k++) {
    spawnOrb(w, x + (w.rand() - 0.5) * 24, y + (w.rand() - 0.5) * 24, 1);
  }

  if (w.rand() < CFG.obstacle.hpDropRate) {
    spawnOrb(w, x, y, CFG.obstacle.hpDropAmount, 1);
    pushLog(w, "DROP", msg("obstacleBreak", { kind: ref(`obstacle.${OBSTACLE_KINDS[o.kind[i]].id}`), hp: CFG.obstacle.hpDropAmount }));
  }

  // 🧯 소화기는 터진다
  if (o.kind[i] === 2) {
    for (let j = 0; j < w.enemies.cap; j++) {
      if (!w.enemies.alive[j]) continue;
      if (Math.hypot(w.enemies.x[j] - x, w.enemies.y[j] - y) < 90) {
        damageEnemy(w, j, 40, TAG.explosion | TAG.aoe, false);
      }
    }
    burst(w, x, y, 14, PC.mine, 260);
  }
  return true;
}

/** 몬스터 돌진이 장애물을 부순다 (오각형·보스) — 경험치는 플레이어 몫이 아니라 떨구지 않는다 */
export function smashObstacles(w: World, x: number, y: number, r: number): void {
  const o = w.obstacles;
  for (let i = 0; i < o.cap; i++) {
    if (!o.alive[i]) continue;
    if (Math.abs(x - o.x[i]) < o.w[i] / 2 + r && Math.abs(y - o.y[i]) < o.h[i] / 2 + r) {
      o.alive[i] = 0;
      markBroken(w, o.cx[i], o.cy[i]);
      burst(w, o.x[i], o.y[i], 10, 2, 180);
      w.shake = Math.max(w.shake, 0.12);
      w.shakePx = Math.max(w.shakePx, 4);
    }
  }
}

/** 원(플레이어·적)을 장애물 밖으로 밀어낸다. 이동 후에 호출한다 */
export function resolveCollision(w: World, x: number, y: number, r: number): { x: number; y: number } {
  const o = w.obstacles;
  let nx = x;
  let ny = y;
  for (let i = 0; i < o.cap; i++) {
    if (!o.alive[i]) continue;
    const hw = o.w[i] / 2 + r;
    const hh = o.h[i] / 2 + r;
    const dx = nx - o.x[i];
    const dy = ny - o.y[i];
    if (Math.abs(dx) >= hw || Math.abs(dy) >= hh) continue;
    // 겹친 깊이가 얕은 축으로 밀어낸다
    const ox = hw - Math.abs(dx);
    const oy = hh - Math.abs(dy);
    if (ox < oy) nx = o.x[i] + Math.sign(dx || 1) * hw;
    else ny = o.y[i] + Math.sign(dy || 1) * hh;
  }
  return { x: nx, y: ny };
}

/** 투사체가 장애물에 맞았는지 (맞으면 index, 아니면 -1) */
export function hitObstacle(w: World, x: number, y: number, r: number): number {
  const o = w.obstacles;
  for (let i = 0; i < o.cap; i++) {
    if (!o.alive[i]) continue;
    if (Math.abs(x - o.x[i]) < o.w[i] / 2 + r && Math.abs(y - o.y[i]) < o.h[i] / 2 + r) return i;
  }
  return -1;
}
