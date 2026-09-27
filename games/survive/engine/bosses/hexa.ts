// 🔷 5단계 육각형 — 레이저 (기획서 §6)
//
// ① 꼭짓점 6곳에서 레이저 — 1초 경고 후 발사, 발사 순간 화면 흔들림
// ② 폭격 — 빨간 원 경고 후 폭발, 맞으면 즉사
// 두 패턴을 번갈아 쓰고, 체력 절반 이하에서는 레이저가 두 겹이 되고 폭격이 늘어난다.

import { CFG, atkMult } from "../../config";
import { BEAM, spawnBeam, type World } from "../world";
import { bossContact, moveBoss, warnCircle } from "./common";

export function initHexa(w: World): void {
  w.boss.timer = 1;
  w.boss.step = 0;
}

/** 꼭짓점 k 의 각도 — 렌더도 같은 식으로 도형을 그린다 */
export function vertexAngle(w: World, k: number, sides: number): number {
  return w.enemies.phase[w.boss.idx] + (Math.PI * 2 * k) / sides;
}

export function updateHexa(w: World, dt: number): void {
  const c = CFG.hexa;
  const b = w.boss;
  const e = w.enemies;
  const i = b.idx;
  const atk = atkMult(w.stage);
  const low = e.hp[i] <= b.maxHp * 0.5;

  e.phase[i] += dt * 0.4;
  moveBoss(w, c.speed, 240, dt);
  bossContact(w, e.dmg[i]);

  b.timer -= dt;
  if (b.timer > 0) return;
  b.timer = c.cycle;

  if (b.step % 2 === 0) {
    // ① 레이저 — 꼭짓점에서 바깥으로
    const sets = low ? 2 : 1;
    for (let s = 0; s < sets; s++) {
      for (let k = 0; k < 6; k++) {
        const a = vertexAngle(w, k, 6) + (s * Math.PI) / 6;
        spawnBeam(
          w, e.x[i] + Math.cos(a) * e.r[i], e.y[i] + Math.sin(a) * e.r[i], a,
          c.laserLen, c.laserWidth, c.laserWarn + s * 0.45, c.laserFire, c.laserDmg * atk, BEAM.damage,
        );
      }
    }
  } else {
    // ② 폭격 — 한 발은 반드시 발밑에
    const n = c.bombCount + (low ? 3 : 0);
    for (let k = 0; k < n; k++) {
      const x = k === 0 ? w.player.x : w.player.x + (w.rand() - 0.5) * c.bombSpread * 2;
      const y = k === 0 ? w.player.y : w.player.y + (w.rand() - 0.5) * c.bombSpread * 2;
      warnCircle(w, x, y, c.bombR, c.bombWarn + k * 0.05, 0, true);
    }
  }
  b.step++;
}
