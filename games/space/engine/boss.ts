// 🚀 아울스페이스 — 보스 (기획서 §6 보스 공통)
// 등장 시 WARNING + 스크롤 감속 / 페이즈 전환마다 전탄 소거 / 격파 시 슬로모션 + 생명 +1

import { CFG, hpMult } from "../config";
import { ENEMY_KINDS } from "../data/stages";
import { setPattern, tickPattern } from "./emitter";
import { clearBullets, killEnemy, pushLog, spawnChip, type World } from "./world";

const BOSS_Y = 190;
const WARN_SEC = 1.6;

export function spawnBoss(w: World): void {
  if (w.boss.spawned) return;
  w.boss.spawned = true;
  w.phase = "boss";
  w.boss.warnT = WARN_SEC;

  const e = w.enemies;
  let i = -1;
  for (let k = 0; k < e.cap; k++) if (!e.alive[k]) { i = k; break; }
  if (i < 0) return;

  e.alive[i] = 1;
  e.kind[i] = ENEMY_KINDS.indexOf("elite");
  e.x[i] = CFG.screen.w / 2;
  e.y[i] = -80;
  e.vx[i] = 0; e.vy[i] = 0;
  e.hp[i] = w.info.boss.hp * hpMult(w.stage);
  e.maxHp[i] = e.hp[i];
  e.r[i] = 42;
  e.sides[i] = 8;
  e.flash[i] = 0;
  e.chips[i] = 20;
  e.rank[i] = 2;
  e.phase[i] = 0;
  setPattern(w, i, w.info.boss.phases[0]);

  w.boss.idx = i;
  w.boss.active = true;
  w.boss.phase = 0;
  w.boss.maxHp = e.hp[i];

  pushLog(w, "ALERT", `BOSS: ${w.info.boss.name} 등장`);
  w.banner = { text: "WARNING", sub: `${w.info.boss.emoji} ${w.info.boss.name}`, until: w.t + WARN_SEC };
  w.flash = Math.max(w.flash, 0.15);
}

export function updateBoss(w: World, dt: number): void {
  if (!w.boss.active) return;
  const i = w.boss.idx;
  const e = w.enemies;
  if (i < 0 || !e.alive[i]) { w.boss.active = false; return; }

  // 등장 연출 동안은 쏘지 않는다
  if (w.boss.warnT > 0) {
    w.boss.warnT -= dt;
    e.y[i] = Math.min(BOSS_Y, e.y[i] + 220 * dt);
    return;
  }

  // 좌우로 흔들리며 내려와 자리 잡는다
  e.y[i] = Math.min(BOSS_Y, e.y[i] + 120 * dt);
  e.x[i] = CFG.screen.w / 2 + Math.sin(w.t * 0.7) * (CFG.screen.w * 0.28);

  // 페이즈 — 체력을 페이즈 수로 나눈다
  const phases = w.info.boss.phases.length;
  const ratio = e.hp[i] / Math.max(1, w.boss.maxHp);
  const want = Math.min(phases - 1, Math.floor((1 - ratio) * phases));
  if (want > w.boss.phase) {
    w.boss.phase = want;
    setPattern(w, i, w.info.boss.phases[want]);
    clearBullets(w, true); // 숨 돌리기
    pushLog(w, "ALERT", `${w.info.boss.name} — PHASE ${want + 1}`);
    w.banner = { text: `PHASE ${want + 1}`, sub: w.info.boss.name, until: w.t + 1.4 };
    w.vignette = Math.max(w.vignette, 0.4);
  }

  tickPattern(w, i, dt);
}

/** 보스 격파 연출 (§6) */
export function onBossKilled(w: World): void {
  const p = w.player;
  clearBullets(w, true);
  w.slow = Math.max(w.slow, CFG.feedback.bossKillSlowSec);
  w.flash = Math.max(w.flash, 0.3);

  // 생명 +1 (초과분은 점수, §3)
  if (p.lives < CFG.player.lives) {
    p.lives += 1;
    pushLog(w, "SKILL", `${w.info.boss.name} 격파 — 생명 +1`);
  } else {
    for (let k = 0; k < 10; k++) spawnChip(w, p.x + (w.rand() - 0.5) * 120, p.y - 60 + (w.rand() - 0.5) * 80, 5);
    pushLog(w, "SKILL", `${w.info.boss.name} 격파 — 생명이 가득해 보너스 칩`);
  }

  w.banner = { text: `STAGE ${w.stage} CLEAR`, sub: w.info.boss.name, until: w.t + 2.4 };
}

export { killEnemy };
