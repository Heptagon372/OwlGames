// 🚀 아울스페이스 — 런 진행 (기획서 §1 · §2)
// 한 스테이지 = 한 런. 웨이브 → 55초에 보스 → 격파하면 클리어.

import { CFG } from "../config";
import type { ThemeId } from "../theme";
import { onBossKilled, spawnBoss, updateBoss } from "./boss";
import {
  resetBulletRuntime,
  updateChips,
  updateEBullets,
  updateLasers,
  updateObstacles,
  updateParticles,
  updatePBullets,
} from "./bullets";
import { tickPattern, tickVolleys } from "./emitter";
import { applyCard, drawCards } from "./levelup";
import { updateSkills } from "./skills";
import { createSpawnState, updateEnemies, updateSpawner, type SpawnState } from "./spawner";
import { clampToScreen, createWorld, pushLog, fireBomb, type World } from "./world";
import type { Card, SkillId } from "../types";

/** 입력 — mx/my 는 -1~1, target 은 드래그 목표 좌표(모바일) */
export type Input = {
  mx: number;
  my: number;
  targetX: number | null;
  targetY: number | null;
  precise: boolean;
  bomb: boolean;
};

export type Run = {
  world: World;
  spawn: SpawnState;
  cards: Card[];
  history: SkillId[][];
};

export function createRun(seed: number, stage: number, theme: ThemeId, reduced = false): Run {
  const world = createWorld(seed, stage, theme, reduced);
  resetBulletRuntime();
  pushLog(world, "INFO", `STAGE ${stage} — ${world.info.name}`);
  if (world.info.note) pushLog(world, "INFO", world.info.note);
  return { world, spawn: createSpawnState(), cards: [], history: [] };
}

export function isPaused(run: Run): boolean {
  return run.cards.length > 0;
}

function openCards(run: Run): void {
  if (run.cards.length > 0 || run.world.pending <= 0) return;
  run.world.pending -= 1;
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

/* ── 플레이어 ───────────────────────────────────────────────── */

function updatePlayer(w: World, dt: number, input: Input): void {
  const p = w.player;
  if (!p.alive) return;

  p.lastX = p.x;
  p.precise = input.precise;
  const speed = w.stats.speed * (input.precise ? CFG.player.preciseMult : 1);

  if (input.targetX !== null && input.targetY !== null) {
    // 모바일 드래그 — 손가락에서 위로 띄운 지점을 따라간다 (§2)
    const dx = input.targetX - p.x;
    const dy = input.targetY - p.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      const step = Math.min(d, speed * dt * 1.8);
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
    }
  } else {
    const len = Math.hypot(input.mx, input.my) || 1;
    const nx = input.mx / Math.max(1, len);
    const ny = input.my / Math.max(1, len);
    p.x += nx * speed * dt;
    p.y += ny * speed * dt;
  }

  const at = clampToScreen(p.x, p.y, CFG.player.radius);
  p.x = at.x;
  p.y = at.y;

  if (p.iframe > 0) p.iframe -= dt;
  if (input.bomb) fireBomb(w);
}

/** 스크롤 — 스테이지 진행에 따라 가속, 보스전에는 감속 (§2) */
function updateScroll(w: World, dt: number): void {
  const accel = 1 + Math.min(CFG.scroll.accelMaxRatio, (w.t / 120) * CFG.scroll.accelMaxRatio);
  const target = w.phase === "boss" ? CFG.scroll.bossSlowRatio : accel;
  w.scrollMul += (target - w.scrollMul) * Math.min(1, dt * 2);
  w.scrollY += CFG.scroll.fore * w.scrollMul * dt;
}

/* ── 프레임 ─────────────────────────────────────────────────── */

export function update(run: Run, dt: number, input: Input): void {
  const w = run.world;
  if (w.over) return;
  if (isPaused(run)) return;

  // 피격·격파 슬로모션
  let step = dt;
  if (w.slow > 0) {
    w.slow = Math.max(0, w.slow - dt);
    step = dt * 0.35;
  }

  w.t += step;
  w.frame += 1;

  updateScroll(w, step);
  updatePlayer(w, step, input);

  if (w.phase === "wave" && w.t >= CFG.wave.bossAt) spawnBoss(w);

  updateSpawner(w, run.spawn, step);
  updateEnemies(w, step);

  // 잡몹 패턴 (보스는 updateBoss 안에서)
  const e = w.enemies;
  for (let i = 0; i < e.cap; i++) {
    if (!e.alive[i] || e.rank[i] === 2) continue;
    if (e.y[i] > 0 && e.y[i] < CFG.screen.h) tickPattern(w, i, step);
  }
  updateBoss(w, step);
  tickVolleys(w, step);

  updateSkills(w, step);
  updatePBullets(w, step);
  updateEBullets(w, step);
  updateLasers(w, step);
  updateObstacles(w, step);
  updateChips(w, step);
  updateParticles(w, step);

  if (w.shake > 0) w.shake = Math.max(0, w.shake - dt);
  if (w.flash > 0) w.flash = Math.max(0, w.flash - dt * 2.5);
  if (w.vignette > 0) w.vignette = Math.max(0, w.vignette - dt);
  if (w.banner && w.t > w.banner.until) w.banner = null;

  openCards(run);

  // 종료 판정
  if (w.cleared && w.phase !== "over") {
    w.phase = "over";
    onBossKilled(w);
    pushLog(w, "ALERT", `STAGE ${w.stage} CLEAR`);
    w.over = true;
  } else if (!w.player.alive) {
    w.phase = "over";
    w.over = true;
  } else if (w.t >= CFG.wave.hardCapSec) {
    w.phase = "over";
    w.over = true;
    w.overReason = "시간 초과";
    pushLog(w, "FATAL", "시간 초과 — 보스를 잡지 못했다");
  }
}
