// 🦉 아울 서바이버즈 v2 — 장애물 (기획서 §8)
// 밀도 상한이 이 시스템의 핵심이다. 9%를 넘기면 이동이 답답해져 오토배틀의 쾌감이 죽는다.

import { CFG } from "../config";
import { burst, damageEnemy, pushLog, spawnOrb, TAG, type World } from "./world";

export const OBSTACLE_KINDS = [
  { name: "서버랙", hp: 30, w: 90, h: 60 },
  { name: "자재 박스", hp: 15, w: 48, h: 48 },
  { name: "소화기", hp: 10, w: 30, h: 30 },
  { name: "배선 더미", hp: 20, w: 70, h: 45 },
] as const;

/**
 * 두 장애물 사이로 지나갈 수 있는가.
 * 축 하나만 140px 이상 떨어져 있으면 그 방향으로 지나갈 수 있다 —
 * 대각선 거리로 재면(예전 방식) 실제로는 뚫려 있는데도 배치를 거부해서 밀도가 안 나온다.
 */
function passable(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
  need: number,
): boolean {
  const gapX = Math.abs(ax - bx) - (aw + bw) / 2;
  const gapY = Math.abs(ay - by) - (ah + bh) / 2;
  return Math.max(gapX, gapY) >= need;
}

/** 지금 배치된 장애물이 맵 면적의 몇 %인가 */
export { passable };

export function obstacleDensity(w: World): number {
  const o = w.obstacles;
  let covered = 0;
  for (let i = 0; i < o.cap; i++) if (o.alive[i]) covered += o.w[i] * o.h[i];
  return covered / (CFG.arena.w * CFG.arena.h);
}

/**
 * 스테이지 시작 시 한 번만 배치한다 (§8 "스테이지당 최초 배치만").
 * 규칙: 밀도 6~9% · 통로 폭 ≥140px · 플레이어 스폰 반경 200px 안에는 두지 않는다.
 *
 * 무작위로 뿌리면 서로 막아서 밀도가 3%를 못 넘는다(한 번 그렇게 만들어 봤다).
 * 그래서 **행 간격·열 간격이 이미 통로 폭을 보장하는 격자**에 놓고, 홀수 행만 반 칸 밀어
 * 격자 티를 없앤다. 어떤 두 장애물도 x 나 y 중 한 축이 140px 이상 떨어진다.
 */
export function placeObstacles(w: World): void {
  const cfg = CFG.obstacle;
  const area = CFG.arena.w * CFG.arena.h;
  // 상한(9%)까지 꽉 채우려면 큰 장애물만 깔아야 해서 모양이 단조로워진다 → 6~7% 를 노린다
  const target = area * (cfg.densityMin + w.rand() * 0.01);
  const o = w.obstacles;

  const maxW = Math.max(...OBSTACLE_KINDS.map((k) => k.w));
  const maxH = Math.max(...OBSTACLE_KINDS.map((k) => k.h));
  const colStep = maxW + cfg.minCorridorPx;
  const rowStep = maxH + cfg.minCorridorPx;
  const cols = Math.floor((CFG.arena.w - 40) / colStep);
  const rows = Math.floor((CFG.arena.h - 40) / rowStep);

  const cells: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = 20 + colStep * (c + 0.5) + (r % 2 ? colStep * 0.25 : 0);
      const y = 20 + rowStep * (r + 0.5);
      if (x + maxW / 2 > CFG.arena.w - 10) continue;
      cells.push({ x, y });
    }
  }
  // 섞는다 (Fisher-Yates)
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(w.rand() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  let covered = 0;
  let placed = 0;

  for (let ci = 0; ci < cells.length && placed < o.cap; ci++) {
    if (covered >= target) break;
    const cell = cells[ci];
    if (Math.hypot(cell.x - w.player.x, cell.y - w.player.y) < cfg.spawnClearRadius) continue;

    // 남은 칸으로 목표 면적을 채우려면 이 칸이 얼마나 커야 하는가.
    // "가장 가까운 크기"를 고르면 계속 작은 걸 골라 목표에 못 닿는다 →
    // **필요 면적 이상인 것 중 가장 작은 것**을 고른다 (없으면 가장 큰 것).
    const remaining = Math.max(1, cells.length - ci);
    const need = (target - covered) / remaining;
    let kind = 0;
    let bestArea = -1;
    for (let k = 0; k < OBSTACLE_KINDS.length; k++) {
      const a = OBSTACLE_KINDS[k].w * OBSTACLE_KINDS[k].h;
      if (a > bestArea) { bestArea = a; kind = k; }
    }
    let fit = Infinity;
    for (let k = 0; k < OBSTACLE_KINDS.length; k++) {
      const a = OBSTACLE_KINDS[k].w * OBSTACLE_KINDS[k].h;
      if (a >= need && a < fit) { fit = a; kind = k; }
    }
    const spec = OBSTACLE_KINDS[kind];
    if ((covered + spec.w * spec.h) / area > cfg.densityMax) continue;

    o.alive[placed] = 1;
    o.x[placed] = cell.x; o.y[placed] = cell.y;
    o.w[placed] = spec.w; o.h[placed] = spec.h;
    o.hp[placed] = spec.hp; o.maxHp[placed] = spec.hp;
    o.kind[placed] = kind;
    o.flash[placed] = 0;
    covered += spec.w * spec.h;
    placed++;
  }
}

/** 보스 등장 시 40% 정리 — 패턴이 가려지지 않게 (§8) */
export function clearForBoss(w: World): void {
  const o = w.obstacles;
  const live: number[] = [];
  for (let i = 0; i < o.cap; i++) if (o.alive[i]) live.push(i);
  const remove = Math.floor(live.length * CFG.obstacle.bossClearRatio);
  for (let k = 0; k < remove; k++) {
    const i = live[Math.floor(w.rand() * live.length)];
    if (o.alive[i]) {
      o.alive[i] = 0;
      burst(w, o.x[i], o.y[i], 6, 2, 90);
    }
  }
}

/** 장애물 피해. 파괴되면 XP 조각과 가끔 체력을 떨군다 */
export function damageObstacle(w: World, i: number, amount: number): boolean {
  const o = w.obstacles;
  if (!o.alive[i]) return false;
  o.hp[i] -= amount;
  o.flash[i] = CFG.feedback.hitFlashSec;
  if (o.hp[i] > 0) return false;

  o.alive[i] = 0;
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
    pushLog(w, "DROP", `${OBSTACLE_KINDS[o.kind[i]].name} 파괴 → ❤️ +${CFG.obstacle.hpDropAmount}`);
  }

  // 🧯 소화기는 터진다
  if (o.kind[i] === 2) {
    for (let j = 0; j < w.enemies.cap; j++) {
      if (!w.enemies.alive[j]) continue;
      if (Math.hypot(w.enemies.x[j] - x, w.enemies.y[j] - y) < 90) {
        damageEnemy(w, j, 40, TAG.explosion | TAG.aoe, false);
      }
    }
    burst(w, x, y, 14, 0, 260);
  }
  return true;
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
