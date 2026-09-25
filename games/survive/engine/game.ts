// 아울 서바이버즈 오케스트레이터 — 월드 갱신 순서와 충돌·픽업·레벨업을 담당한다.
// 무기/적/보스/스폰/카드 로직은 각 모듈에 있고 여기서는 엮기만 한다.
import { CFG, enemyCapAt, xpToNext, zoneAt, type StageId } from "../config";
import type { Card, EnemyKind } from "../types";
import { onEnemyDeath, separateEnemies, updateEnemies } from "./enemies";
import { applyCard, applyPassives, drawCards, evolvableWeapon } from "./levelup";
import { updateBoss, spawnBoss } from "./boss";
import { updateSpawner } from "./spawner";
import { updateWeapons } from "./weapons";
import { stageColor, stageLabel } from "@/lib/stages";
import {
  ENEMY_KINDS,
  burst,
  createWorld,
  damageEnemy,
  forEachEnemyNear,
  healPlayer,
  refreshGrid,
  runStage,
  spawnParticle,
  type World,
} from "./world";

export type Input = { mx: number; my: number };

export type Run = {
  world: World;
  /** 레벨업 카드 (선택 대기 중이면 비어 있지 않다) */
  cards: Card[];
  rerolls: number;
  frame: number;
};

export function createRun(seed: number, stage: StageId): Run {
  const world = createWorld(seed, stage);
  applyPassives(world);
  world.banner = { text: CFG.zones[0].name, sub: "이동만 하세요 — 공격은 자동", until: 3 };
  return { world, cards: [], rerolls: CFG.levelup.rerolls, frame: 0 };
}

/** 카드 선택 대기 중에는 게임 시간이 멈춘다 (§15-8) */
export function isPaused(run: Run): boolean {
  return run.cards.length > 0;
}

export function update(run: Run, dt: number, input: Input): void {
  const w = run.world;
  if (w.over || isPaused(run)) return;
  run.frame++;

  w.t += dt;
  tickStage(w);
  tickZone(w);

  // ── 플레이어 이동 ────────────────────────────────────
  const p = w.player;
  p.iframe = Math.max(0, p.iframe - dt);
  p.slow = Math.max(0, p.slow - dt);
  const speed = w.stats.speed * (p.slow > 0 ? 0.8 : 1);
  const len = Math.hypot(input.mx, input.my) || 1;
  const nx = input.mx / len;
  const ny = input.my / len;
  if (input.mx || input.my) {
    p.vx = nx * speed;
    p.vy = ny * speed;
  } else {
    p.vx *= 0.82;
    p.vy *= 0.82;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  // ── 월드 ─────────────────────────────────────────────
  refreshGrid(w);
  updateSpawner(w, dt);
  updateEnemies(w, dt);
  separateEnemies(w, run.frame);
  if (w.bossIndex >= 0) updateBoss(w, dt);
  updateWeapons(w, dt);

  updateBullets(w, dt);
  updateHazards(w, dt);
  updateOrbs(w, dt);
  contactDamage(w, dt);
  updateParticles(w, dt);

  w.shake = Math.max(0, w.shake - dt);
  w.flash = Math.max(0, w.flash - dt);
  if (w.banner && w.t > w.banner.until) w.banner = null;

  // 레벨업 대기 → 카드 뽑기
  if (w.pendingLevelUps > 0 && run.cards.length === 0) {
    w.pendingLevelUps -= 1;
    run.cards = drawCards(w);
  }

  // 종료 판정
  if (p.hp <= 0) {
    w.over = true;
    w.cleared = false;
    burst(w, p.x, p.y, 30, 2, 220);
  } else if (w.t >= CFG.runSec) {
    w.over = true;
    w.cleared = true;
    w.banner = { text: "SYSTEM SECURED", sub: "180초 생존 성공!", until: w.t + 3 };
  }
}

export function chooseCard(run: Run, index: number): void {
  const card = run.cards[index];
  if (!card) return;
  applyCard(run.world, card);
  applyPassives(run.world);
  run.cards = [];
}

export function rerollCards(run: Run): void {
  if (run.rerolls <= 0 || run.cards.length === 0) return;
  run.rerolls -= 1;
  run.cards = drawCards(run.world);
}

export function skipCards(run: Run): void {
  if (run.cards.length === 0) return;
  const w = run.world;
  w.player.xp += Math.round(w.player.xpNext * CFG.levelup.skipXpRatio);
  run.cards = [];
}

/* ── 내부 ─────────────────────────────────────────────── */

/** 15단계 난이도 — 단계가 오를 때마다 배너로 알린다 */
function tickStage(w: World): void {
  const s = runStage(w);
  if (s === w.stage15) return;
  w.stage15 = s;
  if (s > w.stageMax) w.stageMax = s;
  w.banner = { text: stageLabel(s), sub: "난이도 상승", until: w.t + 1.8 };
  void stageColor(s);
}

function tickZone(w: World): void {
  const z = zoneAt(w.t);
  if (z === w.zone) return;
  // 구역 전환 — 클리어 보너스 + 회복 (§3)
  w.zone = z;
  w.run.zonesCleared = z;
  healPlayer(w, 20);
  w.banner = { text: CFG.zones[z].name, sub: z === 3 ? "보스 출현!" : "구역 클리어 +150점", until: w.t + 2.5 };
  w.flash = 0.25;
  if (z === 3) spawnBoss(w);
}

function updateBullets(w: World, dt: number): void {
  const b = w.bullets;
  for (let i = 0; i < b.cap; i++) {
    if (!b.alive[i]) continue;
    b.life[i] -= dt;
    if (b.life[i] <= 0) {
      b.alive[i] = 0;
      continue;
    }
    b.hitCd[i] = Math.max(0, b.hitCd[i] - dt);
    b.x[i] += b.vx[i] * dt;
    b.y[i] += b.vy[i] * dt;

    if (b.hitCd[i] > 0) continue;
    const bx = b.x[i];
    const by = b.y[i];
    const br = b.r[i];
    const dmg = b.dmg[i];
    let consumed = false;
    forEachEnemyNear(w, bx, by, br + 26, (ei, dist) => {
      if (consumed || !w.enemies.alive[ei]) return;
      if (dist > br + w.enemies.r[ei]) return;
      const kind = ENEMY_KINDS[w.enemies.kind[ei]] as EnemyKind;
      const ex = w.enemies.x[ei];
      const ey = w.enemies.y[ei];
      if (damageEnemy(w, ei, dmg)) onEnemyDeath(w, kind, ex, ey);
      spawnParticle(w, bx, by, 0, 0, 0.15, 0, 3);
      if (b.pierce[i] > 0) {
        b.pierce[i] -= 1;
        b.hitCd[i] = 0.08;
      } else {
        b.alive[i] = 0;
        consumed = true;
      }
    });
  }
}

function updateHazards(w: World, dt: number): void {
  const h = w.hazards;
  const p = w.player;
  for (let i = 0; i < h.cap; i++) {
    if (!h.alive[i]) continue;
    h.life[i] -= dt;
    if (h.life[i] <= 0) {
      h.alive[i] = 0;
      continue;
    }
    if (h.owner[i] === 0) {
      forEachEnemyNear(w, h.x[i], h.y[i], h.r[i], (ei) => {
        const kind = ENEMY_KINDS[w.enemies.kind[ei]] as EnemyKind;
        const ex = w.enemies.x[ei];
        const ey = w.enemies.y[ei];
        if (damageEnemy(w, ei, h.dps[i] * dt)) onEnemyDeath(w, kind, ex, ey);
      });
    } else if (Math.hypot(p.x - h.x[i], p.y - h.y[i]) < h.r[i]) {
      hurtPlayer(w, h.dps[i] * dt, false);
    }
  }
}

function updateOrbs(w: World, dt: number): void {
  const o = w.orbs;
  const p = w.player;
  const magnet = w.stats.magnet;
  for (let i = 0; i < o.cap; i++) {
    if (!o.alive[i]) continue;
    const dx = p.x - o.x[i];
    const dy = p.y - o.y[i];
    const d = Math.hypot(dx, dy);
    if (d < magnet) {
      const pull = 520 / Math.max(24, d);
      o.vx[i] += (dx / d) * pull * dt * 60;
      o.vy[i] += (dy / d) * pull * dt * 60;
      o.x[i] += o.vx[i] * dt;
      o.y[i] += o.vy[i] * dt;
    }
    if (d < CFG.player.radius + 8) {
      o.alive[i] = 0;
      gainXp(w, o.value[i]);
    }
  }
}

function gainXp(w: World, amount: number): void {
  const p = w.player;
  if (p.level >= CFG.player.maxLevel) return;
  p.xp += amount;
  while (p.xp >= p.xpNext && p.level < CFG.player.maxLevel) {
    p.xp -= p.xpNext;
    p.level += 1;
    p.xpNext = xpToNext(p.level);
    w.pendingLevelUps += 1;
  }
}

function contactDamage(w: World, dt: number): void {
  const p = w.player;
  const e = w.enemies;
  forEachEnemyNear(w, p.x, p.y, CFG.player.radius + 40, (i, dist) => {
    if (dist > CFG.player.radius + e.r[i]) return;
    const kind = ENEMY_KINDS[e.kind[i]];
    hurtPlayer(w, e.dmg[i], true);
    if (kind === "ransom") p.slow = 2;
    // 살짝 밀어내서 겹쳐 박히는 걸 막는다
    const dx = e.x[i] - p.x;
    const dy = e.y[i] - p.y;
    const d = Math.hypot(dx, dy) || 1;
    e.x[i] += (dx / d) * 6;
    e.y[i] += (dy / d) * 6;
  });
  void dt;
}

export function hurtPlayer(w: World, amount: number, useIframe: boolean): void {
  const p = w.player;
  if (p.invuln > 0) return;
  if (useIframe && p.iframe > 0) return;
  const dmg = amount * w.stats.dmgTaken;
  p.hp -= dmg;
  w.run.damageTaken += dmg;
  if (useIframe) p.iframe = CFG.player.iframeSec;
  w.shake = Math.max(w.shake, 0.18);
  w.flash = Math.max(w.flash, 0.18);
}

function updateParticles(w: World, dt: number): void {
  const q = w.parts;
  for (let i = 0; i < q.cap; i++) {
    if (!q.alive[i]) continue;
    q.life[i] -= dt;
    if (q.life[i] <= 0) {
      q.alive[i] = 0;
      continue;
    }
    q.x[i] += q.vx[i] * dt;
    q.y[i] += q.vy[i] * dt;
    q.vx[i] *= 0.94;
    q.vy[i] *= 0.94;
  }
}

/** 현재 동시 적 상한 (저사양이면 낮춘다) */
export function currentEnemyCap(w: World): number {
  const cap = enemyCapAt(w.t);
  return w.lowSpec ? Math.min(cap, CFG.enemyCapLow) : cap;
}

export { evolvableWeapon };
