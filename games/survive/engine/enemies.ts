// 🦉 아울 서바이버즈 v2 — 적 행동 (기획서 §4 · §14)
// 추적은 벡터 정규화만. 경로탐색 없음. update 안에서는 절대 할당하지 않는다.

import { CFG } from "../config";
import { ENEMY_KINDS, ENEMY_SPEC } from "../data/stages";
import { resolveCollision } from "./obstacles";
import {
  damageEnemy,
  forEachEnemyNear,
  hurtPlayer,
  spawnBullet,
  TAG,
  clampToArena,
  type World,
} from "./world";

const AI = {
  zigzagFreq: 7.5,
  zigzagAmp: 0.6,
  /** 겹침 분리: 8프레임마다 근접 2마리만 (§14 성능) */
  separateEvery: 8,
  separatePairs: 2,
  separatePush: 18,
  /** 아레나 밖으로 너무 멀어진 잡몹 회수 */
  cullDist: 1400,
  blinkEvery: 2.6,
  shootEvery: 2.2,
  healPerSec: 6,
  stealthCycle: 3.2,
};

/** 🔒 랜섬웨어·프로스트봇 접촉 시 둔화 (§4) */
export const CONTACT_SLOW = { mult: 0.65, sec: 1.6 } as const;

export function updateEnemies(w: World, dt: number): void {
  const e = w.enemies;
  const p = w.player;
  const sep = w.frame % AI.separateEvery === 0;

  for (let i = 0; i < e.cap; i++) {
    if (!e.alive[i]) continue;

    // 상태이상 시간
    if (e.flash[i] > 0) e.flash[i] = Math.max(0, e.flash[i] - dt);
    if (e.slowT[i] > 0) e.slowT[i] -= dt;
    if (e.stunT[i] > 0) e.stunT[i] -= dt;
    if (e.pullT[i] > 0) e.pullT[i] -= dt;
    if (e.markT[i] > 0) e.markT[i] -= dt;
    if (e.hideT[i] > 0) e.hideT[i] -= dt;
    if (e.burnT[i] > 0) {
      e.burnT[i] -= dt;
      if (damageEnemy(w, i, e.burnDps[i] * dt, TAG.physical, false)) continue;
    }

    const kind = ENEMY_KINDS[e.kind[i]];
    const spec = ENEMY_SPEC[kind];
    const isBoss = e.rank[i] >= 2;

    // 보스·중간보스의 이동은 boss.ts 가 맡는다
    if (!isBoss) {
      if (e.stunT[i] > 0) {
        e.vx[i] = 0;
        e.vy[i] = 0;
      } else {
        let dx = p.x - e.x[i];
        let dy = p.y - e.y[i];
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;

        let speed = e.speed[i] * (e.slowT[i] > 0 ? 0.55 : 1);

        // 🕳️ 흡입 중이면 장판 쪽으로 끌려간다 (skills 가 속도를 덮어씀)
        if (e.pullT[i] > 0) speed *= 0.3;

        // 🪱 웜·배선벌레는 지그재그
        if (spec.trait === "zigzag") {
          const wob = Math.sin(w.t * AI.zigzagFreq + e.phase[i]) * AI.zigzagAmp;
          const nx = -dy;
          const ny = dx;
          dx += nx * wob;
          dy += ny * wob;
        }

        // 🌀 워프봇·루트킷은 가끔 순간이동
        if (spec.trait === "blink") {
          e.shootCd[i] -= dt;
          if (e.shootCd[i] <= 0 && len > 120) {
            e.shootCd[i] = AI.blinkEvery;
            const a = w.rand() * Math.PI * 2;
            const pos = clampToArena(p.x + Math.cos(a) * 140, p.y + Math.sin(a) * 140, e.r[i]);
            e.x[i] = pos.x;
            e.y[i] = pos.y;
          }
        }

        // 🧿 미믹은 숨었다가 가까워지면 튀어나온다
        if (spec.trait === "stealth") {
          if (e.hideT[i] <= 0 && len > 200) e.hideT[i] = AI.stealthCycle;
          speed *= e.hideT[i] > 0 ? 1.6 : 1;
        }

        // 👁️ 스파이웨어·익스플로잇은 멈춰서 쏜다
        if (spec.trait === "shoot") {
          e.shootCd[i] -= dt;
          if (len < 420) {
            speed *= 0.35;
            if (e.shootCd[i] <= 0) {
              e.shootCd[i] = AI.shootEvery;
              spawnBullet(w, e.x[i], e.y[i], dx * 230, dy * 230, e.dmg[i], 3, 6, 7, TAG.physical, { hostile: true });
            }
          }
        }

        // 💰 마이너봇은 스스로 회복한다
        if (spec.trait === "heal" && e.hp[i] < e.maxHp[i]) {
          e.hp[i] = Math.min(e.maxHp[i], e.hp[i] + AI.healPerSec * dt);
        }

        const n = Math.hypot(dx, dy) || 1;
        e.vx[i] = (dx / n) * speed;
        e.vy[i] = (dy / n) * speed;
      }

      e.x[i] += e.vx[i] * dt;
      e.y[i] += e.vy[i] * dt;

      const pos = resolveCollision(w, e.x[i], e.y[i], e.r[i]);
      e.x[i] = pos.x;
      e.y[i] = pos.y;

      // 너무 멀어진 잡몹은 회수 (풀 고갈 방지)
      if (e.rank[i] === 0 && Math.hypot(e.x[i] - p.x, e.y[i] - p.y) > AI.cullDist) {
        e.alive[i] = 0;
        continue;
      }
    }

    // 겹침 분리
    if (sep && !isBoss) {
      let pairs = 0;
      forEachEnemyNear(w, e.x[i], e.y[i], e.r[i] + 26, (j) => {
        if (pairs >= AI.separatePairs || j === i || !e.alive[j] || e.rank[j] >= 2) return;
        const dx = e.x[j] - e.x[i];
        const dy = e.y[j] - e.y[i];
        const d = Math.hypot(dx, dy);
        const min = e.r[i] + e.r[j];
        if (d > 0.001 && d < min) {
          const push = Math.min(AI.separatePush, (min - d) * 0.5);
          e.x[j] += (dx / d) * push;
          e.y[j] += (dy / d) * push;
          pairs++;
        }
      });
    }

    // 접촉 피해
    const dist = Math.hypot(e.x[i] - p.x, e.y[i] - p.y);
    if (dist < e.r[i] + CFG.player.radius) {
      hurtPlayer(w, e.dmg[i], e.rank[i] >= 2);
      if (spec.trait === "slow") w.player.slow = CONTACT_SLOW.sec;
    }
  }
}

/** 적 투사체 → 플레이어 (bullets.hostile) */
export function updateHostileBullets(w: World, dt: number): void {
  const b = w.bullets;
  const p = w.player;
  for (let i = 0; i < b.cap; i++) {
    if (!b.alive[i] || !b.hostile[i]) continue;
    b.x[i] += b.vx[i] * dt;
    b.y[i] += b.vy[i] * dt;
    b.life[i] -= dt;
    if (b.life[i] <= 0) {
      b.alive[i] = 0;
      continue;
    }
    if (Math.hypot(b.x[i] - p.x, b.y[i] - p.y) < b.r[i] + CFG.player.radius) {
      hurtPlayer(w, b.dmg[i]);
      b.alive[i] = 0;
    }
  }
}
