// 🦉 아울 서바이버즈 v3 — 런 진행 (기획서 §1·§2)
//
// [게임 시작] → 무한 맵. 한 런 안에서 단계가 1 → 15 → 무한으로 오른다.
//  · 보스가 없는 단계는 시간(30초, 14단계 총력전 40초)이 지나면 넘어간다
//  · 보스 단계(5·8·12·15, 그리고 19·23·27 …)는 보스를 잡아야 넘어간다
//  · 죽으면 끝. 그때까지 도달한 단계가 이 게임의 대표 기록이다

import { msg, ref } from "@/games/core/i18n";
import { CFG, xpToNext } from "../config";
import { stageInfo } from "../data/stages";
import type { ThemeId } from "../theme";
import { endBoss, spawnBoss, updateBoss } from "./boss";
import { nearPenalty } from "./bosses/trideca";
import { updateEnemies, updateHostileBullets } from "./enemies";
import { drawCards, applyCard } from "./levelup";
import { resolveCollision, streamObstacles } from "./obstacles";
import { updateBullets, updateHazards, updateSkills } from "./skills";
import { createSpawnState, updateSpawner, type SpawnState } from "./spawner";
import {
  banner,
  createWorld,
  CUE,
  emote,
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

/** countdown > 0 이면 시작 전 3·2·1 동안 월드가 멈춘다 (화면만 그린다) */
export function createRun(seed: number, theme: ThemeId, reduced = false, countdown = 0): Run {
  const world = createWorld(seed, theme, reduced);
  world.countdown = countdown;
  if (countdown > 0) world.cues |= CUE.tick;
  streamObstacles(world, true);
  announceStage(world);
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

/* ── 단계 ───────────────────────────────────────────────────── */

/** 이 단계가 몇 초짜리인가 (보스 단계는 0 = 보스를 잡을 때까지) */
export function stageDuration(w: World): number {
  if (w.info.boss) return 0;
  return w.info.allOut ? CFG.stage.allOutSec : CFG.stage.normalSec;
}

function announceStage(w: World): void {
  const info = w.info;
  const sub = info.boss
    ? msg("bossIncoming", { boss: ref(`boss.${info.boss}`) })
    : info.allOut
      ? msg("allOut")
      : info.mob
        ? msg("newMob", { mob: ref(`mob.${info.mob}`) })
        : msg("endless");
  banner(w, msg("stageBanner", { stage: w.stage }), sub);
  pushLog(w, info.boss ? "ALERT" : "INFO", msg("stageIn", { stage: w.stage }));
}

function nextStage(w: World): void {
  w.stage += 1;
  w.stageT = 0;
  w.info = stageInfo(w.stage);
  announceStage(w);
}

function updateStage(w: World, dt: number): void {
  w.stageT += dt;

  // 보스를 잡았다 → 다음 단계
  if (w.boss.defeated) {
    const kind = w.boss.kind;
    w.boss.defeated = false;
    w.run.bosses += 1;
    endBoss(w);
    if (kind === "chrono" && !w.cleared) {
      w.cleared = true;
      pushLog(w, "EVO", msg("finalDown"));
    } else {
      pushLog(w, "EVO", msg("bossDown", { boss: ref(`boss.${kind ?? "hexa"}`) }));
    }
    emote(w, 1, 2);
    w.flash = Math.max(w.flash, 0.3);
    w.vacuum = CFG.orb.vacuumSec;
    w.cues |= CUE.bossDown;
    nextStage(w);
    return;
  }

  if (w.info.boss) {
    if (!w.boss.active && w.stageT >= CFG.boss.spawnDelay) spawnBoss(w, w.info.boss);
    return;
  }
  if (w.stageT >= stageDuration(w)) {
    nextStage(w);
    w.cues |= CUE.stage;
  }
}

/* ── 레벨업 ─────────────────────────────────────────────────── */

function gainXp(w: World, run: Run, amount: number): void {
  const p = w.player;
  // 😡 시간의 분노 — 경험치를 먹으면 게이지가 준다 (§12 ⑥)
  if (w.boss.active && w.boss.kind === "chrono") {
    w.boss.chRage = Math.max(0, w.boss.chRage - amount * CFG.chrono.rage.perXp);
  }
  p.xp += amount * w.stats.xpGain;
  while (p.xp >= p.xpNext && p.level < CFG.xp.maxLevel) {
    p.xp -= p.xpNext;
    p.level += 1;
    p.xpNext = xpToNext(p.level);
    run.pending += 1;
    p.lvlT = PLAYER_FX.levelUpSec;
    w.cues |= CUE.level;
    pushLog(w, "INFO", msg("levelUp", { level: p.level }));
    // 🩺 핫픽스 — 레벨업할 때마다 회복
    if (w.stats.levelHeal > 0) healPlayer(w, w.stats.levelHeal);
  }
}

/** 🗄️ 백업 서버 — 얻거나 올릴 때마다 리롤 +1 (리롤은 소모품이라 스탯이 아니라 런에 붙는다) */
const REROLL_PASSIVE = "P23";

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
  if (card.id === REROLL_PASSIVE) run.rerolls += 1;
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

/** 플레이어 연출 타이머 (스프라이트 선택용) */
const PLAYER_FX = {
  levelUpSec: 0.9,
  /** 옆으로 가다 멈춰도 이만큼은 옆을 본다 */
  sideHoldSec: 0.45,
  /** 대각선일 때 옆모습을 고르는 기준 (|x| > |y| × 이 값) */
  sideBias: 0.9,
} as const;

function updatePlayerFx(w: World, dt: number, nx: number, ny: number, moving: boolean): void {
  const p = w.player;
  p.anim += dt;
  if (p.emoteT > 0) p.emoteT = Math.max(0, p.emoteT - dt);
  if (p.hitT > 0) p.hitT = Math.max(0, p.hitT - dt);
  if (p.lvlT > 0) p.lvlT = Math.max(0, p.lvlT - dt);
  p.moving = moving;
  if (moving) {
    // 옆으로 가면 옆모습, 위로 가면 뒷모습, 아래로 가면 앞모습
    if (Math.abs(nx) > Math.abs(ny) * PLAYER_FX.sideBias) {
      p.face = nx < 0 ? 2 : 3;
      p.sideT = 0;
    } else {
      p.face = ny < 0 ? 1 : 0;
      p.sideT = 99;
    }
  } else {
    p.sideT += dt;
    if (p.sideT > PLAYER_FX.sideHoldSec) p.face = 0;
  }
}

function updatePlayer(w: World, dt: number, input: Input): void {
  const p = w.player;
  if (!p.alive) return;
  // 💀 최후의 심판 — 아무것도 할 수 없다
  if (w.boss.chTimeout >= 0 && w.boss.active) return;

  let speed = w.stats.speed * nearPenalty(w);
  if (p.slow > 0) {
    p.slow -= dt;
    speed *= p.slowMult;
    if (p.slow <= 0) p.slowMult = 1;
  }

  const len = Math.hypot(input.mx, input.my);
  const moving = len > 0.01;
  if (moving) {
    const nx = input.mx / Math.max(1, len);
    const ny = input.my / Math.max(1, len);
    p.x += nx * speed * dt;
    p.y += ny * speed * dt;
    p.dir = Math.atan2(ny, nx);
  }
  updatePlayerFx(w, dt, input.mx, input.my, moving);

  // 넉백·블랙홀 끌림
  if (p.kx !== 0 || p.ky !== 0) {
    p.x += p.kx * dt;
    p.y += p.ky * dt;
    const decay = Math.max(0, 1 - 4 * dt);
    p.kx *= decay;
    p.ky *= decay;
    if (Math.abs(p.kx) < 1 && Math.abs(p.ky) < 1) { p.kx = 0; p.ky = 0; }
  }

  const hit = resolveCollision(w, p.x, p.y, CFG.player.radius);
  p.x = hit.x;
  p.y = hit.y;

  if (p.iframe > 0) p.iframe -= dt;
  if (p.invuln > 0) p.invuln -= dt;
  if (w.stats.regen > 0) healPlayer(w, w.stats.regen * dt);

  // 🌑 스텔스 캐시 — 무피격 유지 시 쉴드 충전
  if (w.stats.shieldSec > 0 && !p.shield) {
    p.noHitT += dt;
    if (p.noHitT >= w.stats.shieldSec) {
      p.shield = true;
      p.noHitT = 0;
      pushLog(w, "INFO", msg("stealthReady"));
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

    // 너무 멀리 두고 온 조각은 버린다 (무한 맵 — 풀 고갈 방지)
    if (d > CFG.ai.cullDist) {
      o.alive[i] = 0;
      continue;
    }

    // 도망치며 싸우는 게임이라, 흘린 조각이 그 자리에 남으면 레벨이 안 오른다.
    // 가까우면 확 빨려오고, 멀어도 따라온다. 보스를 잡은 직후에는 전부 빨려온다.
    const acc = d < pickup || w.vacuum > 0 ? CFG.orb.nearAccel * (w.vacuum > 0 ? 2 : 1) : CFG.orb.farAccel;
    o.vx[i] += (dx / d) * acc * dt;
    o.vy[i] += (dy / d) * acc * dt;
    o.vx[i] *= CFG.orb.damping;
    o.vy[i] *= CFG.orb.damping;
    o.x[i] += o.vx[i] * dt;
    o.y[i] += o.vy[i] * dt;

    if (d < CFG.player.radius + 10) {
      o.alive[i] = 0;
      if (o.kind[i] === 1) {
        healPlayer(w, o.value[i]);
        w.cues |= CUE.heal;
      } else {
        gainXp(w, run, o.value[i]);
        w.cues |= CUE.pickup;
      }
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

function updateFx(w: World, dt: number): void {
  const f = w.fx;
  for (let i = 0; i < f.cap; i++) {
    if (!f.alive[i]) continue;
    f.life[i] -= dt;
    if (f.life[i] <= 0) f.alive[i] = 0;
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

export function update(run: Run, dt: number, input: Input): void {
  const w = run.world;
  if (w.over) {
    // 죽은 뒤에도 파편·이펙트는 마저 흩어진다
    updateParticles(w, dt);
    updateFx(w, dt);
    return;
  }

  // 3·2·1 — 월드는 멈추고 숫자만 넘어간다
  if (w.countdown > 0) {
    const before = Math.ceil(w.countdown);
    w.countdown = Math.max(0, w.countdown - dt);
    const after = Math.ceil(w.countdown);
    if (after !== before) w.cues |= after > 0 ? CUE.tick : CUE.go;
    w.player.anim += dt;
    return;
  }

  // ⭐ 진화 연출 동안은 멈춘다 (§9.1)
  if (w.freeze > 0) {
    w.freeze -= dt;
    return;
  }
  if (isPaused(run)) return;

  w.t += dt;
  w.frame += 1;
  if (w.frozen > 0) w.frozen = Math.max(0, w.frozen - dt);
  if (w.vacuum > 0) w.vacuum = Math.max(0, w.vacuum - dt);

  updateStage(w, dt);
  refreshGrid(w);

  updatePlayer(w, dt, input);
  // 카메라는 플레이어를 그대로 따라간다 (무한 맵 — 경계 없음)
  w.cam.x = w.player.x;
  w.cam.y = w.player.y;
  streamObstacles(w);

  updateSpawner(w, run.spawn, dt);
  updateEnemies(w, dt);
  updateBoss(w, dt);
  updateSkills(w, dt);
  updateBullets(w, dt);
  updateHostileBullets(w, dt);
  updateHazards(w, dt);
  updateOrbs(w, run, dt);
  updateParticles(w, dt);
  updateFx(w, dt);

  if (w.shake > 0) w.shake = Math.max(0, w.shake - dt);
  if (w.flash > 0) w.flash = Math.max(0, w.flash - dt * 2.5);
  if (w.vignette > 0) w.vignette = Math.max(0, w.vignette - dt);
  if (w.banner && w.t > w.banner.until) w.banner = null;

  openCards(run);

  if (!w.player.alive) {
    w.over = true;
  } else if (w.t >= CFG.run.hardCapSec) {
    w.over = true;
    w.overReason = msg("overCap");
    pushLog(w, "FATAL", msg("timeUp"));
  }
}

export { recalcStats };
