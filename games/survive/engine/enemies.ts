// 🦉 아울 서바이버즈 v3 — 몬스터 행동 (기획서 §4·§5)
// 추적은 벡터 정규화만. 경로탐색 없음. update 안에서는 절대 할당하지 않는다.
// 보스(rank 3)와 보스 소환물(rank 1)의 이동은 boss.ts 가 맡는다.

import { CFG } from "../config";
import { ENEMY_SPEC, type MobKind } from "../data/stages";
import { resolveCollision, smashObstacles } from "./obstacles";
import {
  aliveEnemies,
  burst,
  damageEnemy,
  enemyCap,
  forEachEnemyNear,
  FX,
  hurtPlayer,
  kindOf,
  mobColor,
  PC,
  removeEnemy,
  spawnBullet,
  spawnEnemy,
  spawnFx,
  spawnParticle,
  TAG,
  type World,
} from "./world";

/** 적 탄 모양 */
export const LOOK = { enemy: 7, homing: 8, slow: 9 } as const;

const SUMMONS: MobKind[] = ["tri", "square", "circle"];

/** 몬스터 하나를 플레이어 쪽으로 돌진시킨다 (오각형 · 시간 정지가 풀리는 순간) */
export function startDash(w: World, i: number, speed: number, sec: number): void {
  const e = w.enemies;
  const dx = w.player.x - e.x[i];
  const dy = w.player.y - e.y[i];
  const d = Math.hypot(dx, dy) || 1;
  e.dirX[i] = dx / d;
  e.dirY[i] = dy / d;
  e.vx[i] = e.dirX[i] * speed;
  e.vy[i] = e.dirY[i] * speed;
  e.dashT[i] = -sec;
}

export function updateEnemies(w: World, dt: number): void {
  const e = w.enemies;
  const p = w.player;
  const ai = CFG.ai;
  const sep = w.frame % ai.separateEvery === 0;
  const frozen = w.frozen > 0;

  for (let i = 0; i < e.cap; i++) {
    if (!e.alive[i]) continue;
    e.age[i] += dt;

    // 상태이상 시간
    if (e.flash[i] > 0) e.flash[i] = Math.max(0, e.flash[i] - dt);
    if (!frozen) {
      if (e.slowT[i] > 0) e.slowT[i] -= dt;
      if (e.stunT[i] > 0) e.stunT[i] -= dt;
      if (e.pullT[i] > 0) e.pullT[i] -= dt;
      if (e.markT[i] > 0) e.markT[i] -= dt;
      if (e.hideT[i] > 0) e.hideT[i] -= dt;
    }
    if (e.burnT[i] > 0) {
      e.burnT[i] -= dt;
      if (damageEnemy(w, i, e.burnDps[i] * dt, TAG.physical, false)) continue;
    }

    if (e.rank[i] !== 0) continue;

    const spec = ENEMY_SPEC[kindOf(w, i)];
    let dx = p.x - e.x[i];
    let dy = p.y - e.y[i];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;

    let dashing = false;

    if (!frozen) {
      if (e.dashT[i] < 0) {
        // 💨 돌진 중 — 방향 고정, 길 위의 장애물을 부순다
        dashing = true;
        e.dashT[i] = Math.min(0, e.dashT[i] + dt);
        e.x[i] += e.vx[i] * dt;
        e.y[i] += e.vy[i] * dt;
        smashObstacles(w, e.x[i], e.y[i], e.r[i]);
        if (e.dashT[i] >= 0) e.shootCd[i] = ai.charge.cd;
      } else if (e.stunT[i] > 0) {
        e.vx[i] = 0;
        e.vy[i] = 0;
      } else {
        let speed = e.speed[i] * (e.slowT[i] > 0 ? 0.55 : 1);
        if (e.pullT[i] > 0) speed *= 0.3;

        switch (spec.trait) {
          case "charge": {
            // 🔶 오각형 — 플레이어를 향해 돌다가 5초마다 돌진 (§5)
            e.shootCd[i] -= dt;
            if (e.dashT[i] > 0) {
              speed = 0;
              e.dirX[i] = dx;
              e.dirY[i] = dy;
              e.dashT[i] -= dt;
              if (e.dashT[i] <= 0) startDash(w, i, ai.charge.speed, ai.charge.time);
            } else if (e.shootCd[i] <= 0 && len < ai.charge.range) {
              e.dashT[i] = ai.charge.windup;
            }
            break;
          }
          case "shoot4": {
            // 🟨 칠각형 — 4개 면에서 감속탄 (§5)
            e.shootCd[i] -= dt;
            if (e.shootCd[i] <= 0 && len < 520) {
              e.shootCd[i] = ai.shoot4.cd;
              const base = Math.atan2(dy, dx);
              for (let k = 0; k < 4; k++) {
                const a = base + (Math.PI / 2) * k;
                spawnBullet(
                  w, e.x[i], e.y[i], Math.cos(a) * ai.shoot4.speed, Math.sin(a) * ai.shoot4.speed,
                  e.dmg[i], ai.shoot4.life, ai.shoot4.r, LOOK.slow, TAG.physical, { hostile: true },
                );
              }
            }
            break;
          }
          case "summon": {
            // ⬡ 십일각형 — 거리를 두고 버티며 잡몹을 부른다 (§5)
            if (len < ai.summon.keepDist) speed *= -0.6;
            else if (len < ai.summon.keepDist + 80) speed = 0;
            e.shootCd[i] -= dt;
            if (e.shootCd[i] <= 0) {
              e.shootCd[i] = ai.summon.cd;
              for (let k = 0; k < ai.summon.count && aliveEnemies(w) < enemyCap(w); k++) {
                const a = w.rand() * Math.PI * 2;
                const kind = SUMMONS[Math.floor(w.rand() * SUMMONS.length)];
                const sx = e.x[i] + Math.cos(a) * (e.r[i] + 22);
                const sy = e.y[i] + Math.sin(a) * (e.r[i] + 22);
                spawnEnemy(w, kind, sx, sy);
                spawnFx(w, FX.spawn, sx, sy, 0.4, 16, { color: mobColor(w, i) });
              }
              burst(w, e.x[i], e.y[i], 10, mobColor(w, i), 140);
              spawnFx(w, FX.ring, e.x[i], e.y[i], 0.45, e.r[i] + 40, { color: mobColor(w, i) });
            }
            break;
          }
          case "regen": {
            // ⬢ 십사각형 — 초마다 체력 회복 + 수복 임팩트 (§5)
            e.shootCd[i] -= dt;
            if (e.shootCd[i] <= 0) {
              e.shootCd[i] = ai.regen.pulseSec;
              if (e.hp[i] < e.maxHp[i]) {
                e.hp[i] = Math.min(e.maxHp[i], e.hp[i] + e.maxHp[i] * ai.regen.perSec * ai.regen.pulseSec);
                for (let k = 0; k < 10; k++) {
                  const a = (Math.PI * 2 * k) / 10;
                  spawnParticle(w, e.x[i] + Math.cos(a) * e.r[i], e.y[i] + Math.sin(a) * e.r[i],
                    Math.cos(a) * 60, Math.sin(a) * 60, 0.45, 3, PC.hp);
                }
                spawnFx(w, FX.heal, e.x[i], e.y[i], 0.5, e.r[i] + 14, { color: PC.hp });
              }
            }
            break;
          }
          default:
            break;
        }

        e.vx[i] = dx * speed;
        e.vy[i] = dy * speed;
        e.x[i] += e.vx[i] * dt;
        e.y[i] += e.vy[i] * dt;
      }

      const pos = resolveCollision(w, e.x[i], e.y[i], e.r[i]);
      e.x[i] = pos.x;
      e.y[i] = pos.y;

      // 너무 멀어진 잡몹은 회수 (풀 고갈 방지)
      if (len > ai.cullDist) {
        removeEnemy(w, i, false);
        continue;
      }
    }

    // 겹침 분리
    if (sep) {
      let pairs = 0;
      forEachEnemyNear(w, e.x[i], e.y[i], e.r[i] + 26, (j) => {
        if (pairs >= ai.separatePairs || j === i || !e.alive[j] || e.rank[j] !== 0) return;
        const ddx = e.x[j] - e.x[i];
        const ddy = e.y[j] - e.y[i];
        const d = Math.hypot(ddx, ddy);
        const min = e.r[i] + e.r[j];
        if (d > 0.001 && d < min) {
          const push = Math.min(ai.separatePush, (min - d) * 0.5);
          e.x[j] += (ddx / d) * push;
          e.y[j] += (ddy / d) * push;
          pairs++;
        }
      });
    }

    // 접촉 피해 (돌진 중이면 큰 피해)
    if (len < e.r[i] + CFG.player.radius) {
      hurtPlayer(w, dashing && spec.trait === "charge" ? ai.charge.dmg * (e.dmg[i] / spec.dmg) : e.dmg[i]);
    }
  }
}

/** 적 투사체 → 플레이어 (bullets.hostile) */
export function updateHostileBullets(w: World, dt: number): void {
  const b = w.bullets;
  const p = w.player;
  const ch = CFG.chrono;
  if (w.frozen > 0) return; // ⏸️ 시간 정지 — 탄도 멈춘다

  for (let i = 0; i < b.cap; i++) {
    if (!b.alive[i] || !b.hostile[i]) continue;

    const dx = p.x - b.x[i];
    const dy = p.y - b.y[i];
    const d = Math.hypot(dx, dy) || 1;

    if (b.look[i] === LOOK.homing) {
      // ⏱️ 시간 추적탄 — 가까울수록 빨라지고, 수명이 끝나면 터진다
      const want = ch.homingMin + (ch.homingMax - ch.homingMin) * Math.max(0, 1 - d / ch.homingNear);
      const cur = Math.atan2(b.vy[i], b.vx[i]);
      const tgt = Math.atan2(dy, dx);
      let diff = tgt - cur;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const a = cur + Math.max(-ch.homingTurn * dt, Math.min(ch.homingTurn * dt, diff));
      b.vx[i] = Math.cos(a) * want;
      b.vy[i] = Math.sin(a) * want;
    }

    b.x[i] += b.vx[i] * dt;
    b.y[i] += b.vy[i] * dt;
    b.life[i] -= dt;

    const hit = Math.hypot(b.x[i] - p.x, b.y[i] - p.y) < b.r[i] + CFG.player.radius;

    if (b.look[i] === LOOK.homing && (b.life[i] <= 0 || hit)) {
      burst(w, b.x[i], b.y[i], 12, 6, 200);
      if (Math.hypot(b.x[i] - p.x, b.y[i] - p.y) < ch.homingBlastR + CFG.player.radius) hurtPlayer(w, b.dmg[i], true);
      b.alive[i] = 0;
      continue;
    }
    if (b.life[i] <= 0) {
      b.alive[i] = 0;
      continue;
    }
    if (hit) {
      hurtPlayer(w, b.dmg[i]);
      // 🟨 칠각형 감속탄 — 맞으면 느려진다
      if (b.look[i] === LOOK.slow) {
        p.slow = CFG.ai.shoot4.slowSec;
        p.slowMult = Math.min(p.slowMult, CFG.ai.shoot4.slowMult);
      }
      b.alive[i] = 0;
    }
  }
}
