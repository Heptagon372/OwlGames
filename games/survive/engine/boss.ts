// 🦉 아울 서바이버즈 v2 — 보스·중간보스 (기획서 §3 · §4)
//
// 보스 15종을 15개의 클래스로 쓰지 않는다. **패턴 12종을 데이터로 조합**한다.
// 페이즈가 오를수록 그 보스가 가진 패턴이 하나씩 더 풀린다.

import { CFG, atkMult, hpMult } from "../config";
import type { PatternId } from "../data/stages";
import { clearForBoss } from "./obstacles";
import { HZ } from "./skills";
import {
  clampToArena,
  hurtPlayer,
  pushLog,
  spawnBullet,
  spawnEnemy,
  spawnHazard,
  spawnParticle,
  TAG,
  type World,
} from "./world";

/** 패턴별 지속시간 (초) */
const DUR: Record<PatternId, number> = {
  summon: 2.4, radial: 1.2, field: 1.6, charge: 2, sweep: 3,
  rain: 2.2, clones: 1.6, stealth: 2.4, drain: 3, blackhole: 2.6, whip: 2, random: 1.6,
};

const BOSS_KEEP_DIST = 190;
const CHARGE_SPEED = 540;

const ALL: PatternId[] = ["summon", "radial", "field", "charge", "sweep", "rain", "clones", "stealth", "drain", "blackhole", "whip"];

function patternsFor(w: World): PatternId[] {
  const list = w.info.boss.patterns;
  return list.slice(0, Math.min(list.length, w.boss.phase + 1));
}

function resolveRandom(w: World, p: PatternId): PatternId {
  return p === "random" ? ALL[Math.floor(w.rand() * ALL.length)] : p;
}

/* ── 등장 ───────────────────────────────────────────────────── */

export function spawnMidboss(w: World): void {
  if (w.midboss.spawned) return;
  w.midboss.spawned = true;
  const at = clampToArena(w.player.x + 260, w.player.y - 160, 40);
  const i = spawnEnemy(w, w.info.enemies[0], at.x, at.y, 2);
  if (i < 0) return;
  const e = w.enemies;
  e.hp[i] = w.info.boss.hp * 0.22 * hpMult(w.stage);
  e.maxHp[i] = e.hp[i];
  e.r[i] = 30;
  e.sides[i] = 7;
  e.dmg[i] = 12 * atkMult(w.stage);
  e.speed[i] = 70;
  e.xp[i] = 40;
  w.midboss.idx = i;
  w.midboss.active = true;
  w.boss.pattern = 0;
  w.boss.timer = 1.2;
  pushLog(w, "ALERT", `중간보스: ${w.info.midboss.name} 등장`);
  w.banner = { text: w.info.midboss.name, sub: "중간보스", until: w.t + 2 };
}

export function spawnBoss(w: World): void {
  if (w.boss.spawned) return;
  w.boss.spawned = true;
  clearForBoss(w);

  const at = clampToArena(w.player.x + 300, w.player.y, 54);
  const i = spawnEnemy(w, w.info.enemies[w.info.enemies.length - 1], at.x, at.y, 3);
  if (i < 0) return;
  const e = w.enemies;
  e.hp[i] = w.info.boss.hp * hpMult(w.stage);
  e.maxHp[i] = e.hp[i];
  e.r[i] = 54;
  e.sides[i] = 8;
  // 접촉 피해 25(기획서 최종보스 기준)는 1스테이지 첫 판에서 네 번만 닿아도 죽는다 →
  // 몸통 박치기는 18 로 낮추고, 대신 패턴(장판·돌진)으로 압박한다
  e.dmg[i] = 18 * atkMult(w.stage);
  e.speed[i] = 58;
  e.xp[i] = 120;

  w.boss.idx = i;
  w.boss.active = true;
  w.boss.maxHp = e.hp[i];
  w.boss.phase = 0;
  w.boss.timer = 1.5;
  w.boss.pattern = 0;

  pushLog(w, "ALERT", `STAGE BOSS: ${w.info.boss.name} 등장`);
  w.banner = { text: `${w.info.boss.emoji} ${w.info.boss.name}`, sub: "STAGE BOSS", until: w.t + 2.4 };
  w.flash = Math.max(w.flash, 0.16);
}

/* ── 패턴 실행 ──────────────────────────────────────────────── */

function start(w: World, i: number, p: PatternId): void {
  const e = w.enemies;
  const dmg = e.dmg[i];
  const px = w.player.x;
  const py = w.player.y;

  switch (p) {
    case "summon": {
      pushLog(w, "ALERT", `${w.info.boss.name} — 소환`);
      break;
    }
    case "radial": {
      for (let k = 0; k < 14; k++) {
        const a = (Math.PI * 2 * k) / 14 + w.rand() * 0.2;
        spawnBullet(w, e.x[i], e.y[i], Math.cos(a) * 230, Math.sin(a) * 230, dmg * 0.6, 3.2, 7, 7, TAG.physical, { hostile: true });
      }
      break;
    }
    case "field": {
      for (let k = 0; k < 3; k++) {
        const x = px + (w.rand() - 0.5) * 300;
        const y = py + (w.rand() - 0.5) * 300;
        spawnHazard(w, x, y, 95, 4, dmg * 0.5, HZ.enemy, { tags: TAG.aoe });
      }
      break;
    }
    case "charge": {
      const dx = px - e.x[i];
      const dy = py - e.y[i];
      const d = Math.hypot(dx, dy) || 1;
      e.vx[i] = (dx / d) * CHARGE_SPEED;
      e.vy[i] = (dy / d) * CHARGE_SPEED;
      pushLog(w, "ALERT", `${w.info.boss.name} — 돌진`);
      break;
    }
    case "rain": {
      for (let k = 0; k < 8; k++) {
        const x = px + (w.rand() - 0.5) * 420;
        const y = py + (w.rand() - 0.5) * 420;
        spawnHazard(w, x, y, 62, 1.6, dmg * 0.7, HZ.enemy, { tags: TAG.aoe });
      }
      break;
    }
    case "clones": {
      for (let k = 0; k < 3; k++) {
        const a = (Math.PI * 2 * k) / 3;
        const at = clampToArena(e.x[i] + Math.cos(a) * 130, e.y[i] + Math.sin(a) * 130, 26);
        const j = spawnEnemy(w, w.info.enemies[0], at.x, at.y, 1);
        if (j >= 0) {
          w.enemies.hp[j] = e.maxHp[i] * 0.04;
          w.enemies.maxHp[j] = w.enemies.hp[j];
          w.enemies.r[j] = 26;
          w.enemies.sides[j] = 8;
        }
      }
      pushLog(w, "ALERT", `${w.info.boss.name} — 분신`);
      break;
    }
    case "stealth": {
      e.hideT[i] = DUR.stealth;
      pushLog(w, "ALERT", `${w.info.boss.name} — 은신`);
      break;
    }
    case "blackhole": {
      spawnHazard(w, px, py, 170, DUR.blackhole, dmg * 0.3, HZ.enemy, { tags: TAG.aoe });
      break;
    }
    case "drain":
    case "sweep":
    case "whip":
    case "random":
      break;
  }
}

function tick(w: World, i: number, p: PatternId, dt: number): void {
  const e = w.enemies;
  const px = w.player.x;
  const py = w.player.y;
  const dmg = e.dmg[i];

  switch (p) {
    case "summon": {
      if (w.frame % 40 === 0) {
        for (let k = 0; k < 2; k++) {
          const a = w.rand() * Math.PI * 2;
          const at = clampToArena(e.x[i] + Math.cos(a) * 90, e.y[i] + Math.sin(a) * 90, 12);
          spawnEnemy(w, w.info.enemies[Math.floor(w.rand() * w.info.enemies.length)], at.x, at.y);
        }
      }
      break;
    }
    case "sweep": {
      // 회전 레이저 — 보스에서 뻗어나가는 광선 위에 탄을 뿌린다
      const a = w.t * 2.2;
      for (let k = 1; k <= 3; k++) {
        const d = k * 90;
        const x = e.x[i] + Math.cos(a) * d;
        const y = e.y[i] + Math.sin(a) * d;
        spawnParticle(w, x, y, 0, 0, 0.18, 5, 3);
        if (Math.hypot(px - x, py - y) < 34) hurtPlayer(w, dmg * 0.4 * dt * 6, true);
      }
      break;
    }
    case "whip": {
      const a = w.t * 4;
      const d = 120;
      const x = e.x[i] + Math.cos(a) * d;
      const y = e.y[i] + Math.sin(a) * d;
      spawnParticle(w, x, y, 0, 0, 0.2, 6, 3);
      if (Math.hypot(px - x, py - y) < 40) hurtPlayer(w, dmg * 0.5 * dt * 6, true);
      break;
    }
    case "drain": {
      if (Math.hypot(px - e.x[i], py - e.y[i]) < 320) {
        if (w.frame % 30 === 0) {
          hurtPlayer(w, dmg * 0.35, true);
          e.hp[i] = Math.min(e.maxHp[i], e.hp[i] + e.maxHp[i] * 0.01);
        }
        spawnParticle(w, px + (w.rand() - 0.5) * 30, py + (w.rand() - 0.5) * 30, (e.x[i] - px) * 0.6, (e.y[i] - py) * 0.6, 0.4, 3, 6);
      }
      break;
    }
    case "charge": {
      e.x[i] += e.vx[i] * dt;
      e.y[i] += e.vy[i] * dt;
      const at = clampToArena(e.x[i], e.y[i], e.r[i]);
      e.x[i] = at.x;
      e.y[i] = at.y;
      break;
    }
    default:
      break;
  }
}

/* ── 프레임 갱신 ────────────────────────────────────────────── */

export function updateBoss(w: World, dt: number): void {
  const e = w.enemies;
  const idx = w.boss.active ? w.boss.idx : w.midboss.active ? w.midboss.idx : -1;
  if (idx < 0 || !e.alive[idx]) {
    if (w.boss.active && !e.alive[w.boss.idx]) w.boss.active = false;
    if (w.midboss.active && !e.alive[w.midboss.idx]) w.midboss.active = false;
    return;
  }

  // 페이즈 (보스만)
  if (w.boss.active && idx === w.boss.idx) {
    const ratio = e.hp[idx] / Math.max(1, w.boss.maxHp);
    const next = ratio <= 0.33 ? 2 : ratio <= 0.66 ? 1 : 0;
    if (next > w.boss.phase) {
      w.boss.phase = next;
      w.boss.timer = 0;
      pushLog(w, "ALERT", `${w.info.boss.name} — ${next + 1}페이즈`);
      w.banner = { text: `PHASE ${next + 1}`, sub: w.info.boss.name, until: w.t + 1.6 };
      w.flash = Math.max(w.flash, 0.12);
    }
  }

  const list = w.boss.active ? patternsFor(w) : [w.info.midboss.pattern];
  w.boss.timer -= dt;
  if (w.boss.timer <= 0) {
    w.boss.pattern = (w.boss.pattern + 1) % list.length;
    const p = resolveRandom(w, list[w.boss.pattern]);
    w.boss.timer = DUR[p];
    start(w, idx, p);
  }
  const current = resolveRandom(w, list[w.boss.pattern] ?? "summon");
  tick(w, idx, current, dt);

  // 이동 — 돌진 중이 아니면 일정 거리를 유지하며 다가온다
  if (current !== "charge" && e.stunT[idx] <= 0) {
    const dx = w.player.x - e.x[idx];
    const dy = w.player.y - e.y[idx];
    const d = Math.hypot(dx, dy) || 1;
    const want = d > BOSS_KEEP_DIST ? 1 : -0.4;
    const sp = e.speed[idx] * (e.slowT[idx] > 0 ? 0.6 : 1);
    e.x[idx] += (dx / d) * sp * want * dt;
    e.y[idx] += (dy / d) * sp * want * dt;
    const at = clampToArena(e.x[idx], e.y[idx], e.r[idx]);
    e.x[idx] = at.x;
    e.y[idx] = at.y;
  }

  // 보스도 몸통 박치기를 한다
  if (Math.hypot(e.x[idx] - w.player.x, e.y[idx] - w.player.y) < e.r[idx] + CFG.player.radius) {
    hurtPlayer(w, e.dmg[idx], true);
  }
}
