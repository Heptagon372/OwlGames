// 🦉 아울 서바이버즈 v2 — 런 진행 (기획서 §3)
// 한 스테이지 = 한 런. 웨이브1 → 중간보스 → 웨이브2 → 보스 → 클리어/실패.

import { CFG, xpToNext } from "../config";
import type { ThemeId } from "../theme";
import { spawnBoss, spawnMidboss, updateBoss } from "./boss";
import { updateEnemies, updateHostileBullets } from "./enemies";
import { drawCards, applyCard } from "./levelup";
import { placeObstacles, resolveCollision } from "./obstacles";
import { updateBullets, updateHazards, updateSkills } from "./skills";
import { createSpawnState, updateSpawner, type SpawnState } from "./spawner";
import {
  clampToArena,
  createWorld,
  healPlayer,
  pushLog,
  recalcStats,
  refreshGrid,
  type World,
} from "./world";
import type { Card, SkillId } from "../types";

export type Input = { mx: number; my: number };

export type Run = {
  world: World;
  spawn: SpawnState;
  /** 비어 있지 않으면 게임 정지 (§2) */
  cards: Card[];
  pending: number;
  rerolls: number;
  skips: number;
  history: SkillId[][];
};

export function createRun(seed: number, stage: number, theme: ThemeId, reduced = false): Run {
  const world = createWorld(seed, stage, theme, reduced);
  placeObstacles(world);
  pushLog(world, "INFO", `STAGE ${stage} — ${world.info.name}`);
  if (world.info.rule) pushLog(world, "ALERT", `특수 규칙: ${world.info.rule}`);
  return {
    world,
    spawn: createSpawnState(),
    cards: [],
    pending: 0,
    rerolls: CFG.card.reroll,
    skips: CFG.card.skip,
    history: [],
  };
}

export function isPaused(run: Run): boolean {
  return run.cards.length > 0;
}

/* ── 레벨업 ─────────────────────────────────────────────────── */

function gainXp(w: World, run: Run, amount: number): void {
  const p = w.player;
  p.xp += amount * w.stats.xpGain;
  while (p.xp >= p.xpNext && p.level < CFG.xp.maxLevel) {
    p.xp -= p.xpNext;
    p.level += 1;
    p.xpNext = xpToNext(p.level);
    run.pending += 1;
    pushLog(w, "INFO", `Lv.${p.level}  스킬 선택 가능`);
  }
}

function openCards(run: Run): void {
  if (run.cards.length > 0 || run.pending <= 0) return;
  run.pending -= 1;
  const cards = drawCards(run.world, run.history);
  if (cards.length === 0) return;
  run.cards = cards;
  run.history.push(cards.map((c) => c.id));
  if (run.history.length > 4) run.history.shift();
}

export function chooseCard(run: Run, index: number): void {
  const card = run.cards[index];
  if (!card) return;
  applyCard(run.world, card);
  run.cards = [];
  openCards(run);
}

export function rerollCards(run: Run): void {
  if (run.rerolls <= 0 || run.cards.length === 0) return;
  run.rerolls -= 1;
  run.cards = drawCards(run.world, run.history);
}

export function skipCards(run: Run): void {
  if (run.skips <= 0 || run.cards.length === 0) return;
  run.skips -= 1;
  const w = run.world;
  w.player.xp += w.player.xpNext * CFG.card.skipXpRatio;
  run.cards = [];
  openCards(run);
}

/* ── 프레임 ─────────────────────────────────────────────────── */

function updatePlayer(w: World, dt: number, input: Input): void {
  const p = w.player;
  if (!p.alive) return;

  let speed = w.stats.speed;
  if (p.slow > 0) { p.slow -= dt; speed *= 0.8; }

  const len = Math.hypot(input.mx, input.my);
  if (len > 0.01) {
    const nx = input.mx / Math.max(1, len);
    const ny = input.my / Math.max(1, len);
    p.x += nx * speed * dt;
    p.y += ny * speed * dt;
    p.dir = Math.atan2(ny, nx);
  }

  const hit = resolveCollision(w, p.x, p.y, CFG.player.radius);
  const at = clampToArena(hit.x, hit.y, CFG.player.radius);
  p.x = at.x;
  p.y = at.y;

  if (p.iframe > 0) p.iframe -= dt;
  if (p.invuln > 0) p.invuln -= dt;
  if (w.stats.regen > 0) healPlayer(w, w.stats.regen * dt);

  // 🌑 스텔스 캐시 — 무피격 유지 시 쉴드 충전
  if (w.stats.shieldSec > 0 && !p.shield) {
    p.noHitT += dt;
    if (p.noHitT >= w.stats.shieldSec) {
      p.shield = true;
      p.noHitT = 0;
      pushLog(w, "INFO", "스텔스 캐시 충전 완료");
    }
  }
}

function updateOrbs(w: World, run: Run, dt: number): void {
  const o = w.orbs;
  const p = w.player;
  const pickup = w.stats.pickup;
  let alive = 0;

  for (let i = 0; i < o.cap; i++) {
    if (!o.alive[i]) continue;
    alive++;
    const dx = p.x - o.x[i];
    const dy = p.y - o.y[i];
    const d = Math.hypot(dx, dy) || 1;

    // 도망치며 싸우는 게임이라, 흘린 조각이 그 자리에 남으면 레벨이 안 오른다.
    // 가까우면 확 빨려오고, 멀어도 천천히 따라온다.
    if (d < pickup) {
      o.vx[i] += (dx / d) * 1400 * dt;
      o.vy[i] += (dy / d) * 1400 * dt;
    } else {
      o.vx[i] += (dx / d) * 200 * dt;
      o.vy[i] += (dy / d) * 200 * dt;
    }
    o.vx[i] *= 0.92;
    o.vy[i] *= 0.92;
    o.x[i] += o.vx[i] * dt;
    o.y[i] += o.vy[i] * dt;

    if (d < CFG.player.radius + 10) {
      o.alive[i] = 0;
      if (o.kind[i] === 1) healPlayer(w, o.value[i]);
      else gainXp(w, run, o.value[i]);
    }
  }

  // XP 조각이 너무 많으면 병합 (§14)
  if (alive > CFG.perf.orbMergeAbove) {
    let merged = 0;
    for (let i = 0; i < o.cap && merged < 20; i++) {
      if (!o.alive[i] || o.kind[i] !== 0) continue;
      for (let j = i + 1; j < o.cap; j++) {
        if (!o.alive[j] || o.kind[j] !== 0) continue;
        if (Math.hypot(o.x[i] - o.x[j], o.y[i] - o.y[j]) < 26) {
          o.value[i] += o.value[j];
          o.alive[j] = 0;
          merged++;
          break;
        }
      }
    }
  }
}

function updateParticles(w: World, dt: number): void {
  const q = w.particles;
  for (let i = 0; i < q.cap; i++) {
    if (!q.alive[i]) continue;
    q.life[i] -= dt;
    if (q.life[i] <= 0) { q.alive[i] = 0; continue; }
    q.x[i] += q.vx[i] * dt;
    q.y[i] += q.vy[i] * dt;
    q.vx[i] *= 0.94;
    q.vy[i] *= 0.94;
  }
}

function updatePhase(w: World): void {
  if (w.phase === "over") return;
  const t = w.t;
  if (w.phase === "wave1" && t >= CFG.wave.midbossAt) {
    w.phase = "midboss";
    spawnMidboss(w);
  } else if (w.phase === "midboss" && t >= CFG.wave.w2Start) {
    w.phase = "wave2";
    pushLog(w, "INFO", "웨이브 2 — 적 강화");
  } else if (w.phase === "wave2" && t >= CFG.wave.bossAt) {
    w.phase = "boss";
    spawnBoss(w);
  }
}

function updateCamera(w: World): void {
  const halfW = CFG.view.w / 2;
  const halfH = CFG.view.h / 2;
  w.cam.x = Math.max(halfW, Math.min(CFG.arena.w - halfW, w.player.x));
  w.cam.y = Math.max(halfH, Math.min(CFG.arena.h - halfH, w.player.y));
}

export function update(run: Run, dt: number, input: Input): void {
  const w = run.world;
  if (w.over) return;

  // ⭐ 진화 연출 동안은 멈춘다 (§9.1)
  if (w.freeze > 0) {
    w.freeze -= dt;
    return;
  }
  if (isPaused(run)) return;

  w.t += dt;
  w.frame += 1;

  updatePhase(w);
  refreshGrid(w);

  updatePlayer(w, dt, input);
  updateSpawner(w, run.spawn, dt);
  updateEnemies(w, dt);
  updateBoss(w, dt);
  updateSkills(w, dt);
  updateBullets(w, dt);
  updateHostileBullets(w, dt);
  updateHazards(w, dt);
  updateOrbs(w, run, dt);
  updateParticles(w, dt);
  updateCamera(w);

  if (w.shake > 0) w.shake = Math.max(0, w.shake - dt);
  if (w.flash > 0) w.flash = Math.max(0, w.flash - dt * 2.5);
  if (w.vignette > 0) w.vignette = Math.max(0, w.vignette - dt);
  if (w.banner && w.t > w.banner.until) w.banner = null;

  openCards(run);

  // 종료 판정
  if (w.cleared && !w.over) {
    w.over = true;
    w.phase = "over";
    pushLog(w, "EVO", `STAGE ${w.stage} CLEAR`);
  } else if (!w.player.alive) {
    w.over = true;
    w.phase = "over";
  } else if (w.t >= CFG.wave.hardCapSec) {
    w.over = true;
    w.phase = "over";
    w.overReason = "시간 초과";
    pushLog(w, "FATAL", "시간 초과 — 보스를 잡지 못했다");
  }
}

export { recalcStats };
