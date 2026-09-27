// 🦉 아울 서바이버즈 v3 — 보스 공통 (레이저 · 경고 원 · 색 장판 · 블랙홀)
//
// 보스마다 규칙은 다르지만(§6~§12), "경고 → 발동"이라는 문법은 모두 같다.
// 경고 없이 즉사시키는 패턴은 없다 — 모든 즉사기는 여기의 경고 원·레이저를 거친다.

import { msg, ref, type Msg } from "@/games/core/i18n";
import { CFG } from "../../config";
import { smashObstacles } from "../obstacles";
import {
  BEAM,
  burst,
  CUE,
  hurtPlayer,
  HZ,
  HZ_LETHAL,
  killPlayer,
  segDist2,
  spawnHazard,
  type World,
} from "../world";

/** 보스에게 당했을 때의 사유 */
export function bossReason(w: World): Msg {
  return w.boss.kind ? msg("overBoss", { boss: ref(`boss.${w.boss.kind}`) }) : msg("overMobs");
}

/** 보스를 (x,y) 쪽으로 speed 만큼 움직인다. keep 보다 가까우면 살짝 물러난다 */
export function moveBoss(w: World, speed: number, keep: number, dt: number): void {
  const e = w.enemies;
  const i = w.boss.idx;
  const dx = w.player.x - e.x[i];
  const dy = w.player.y - e.y[i];
  const d = Math.hypot(dx, dy) || 1;
  const want = d > keep ? 1 : -0.4;
  const sp = speed * (e.slowT[i] > 0 ? 0.6 : 1) * (e.stunT[i] > 0 ? 0 : 1);
  e.x[i] += (dx / d) * sp * want * dt;
  e.y[i] += (dy / d) * sp * want * dt;
  smashObstacles(w, e.x[i], e.y[i], e.r[i] * 0.8);
}

/** 보스 몸통 박치기 */
export function bossContact(w: World, dmg: number): void {
  const e = w.enemies;
  const i = w.boss.idx;
  if (Math.hypot(e.x[i] - w.player.x, e.y[i] - w.player.y) < e.r[i] + CFG.player.radius) hurtPlayer(w, dmg, true);
}

/** 경고 원 — sec 뒤에 터진다. lethal 이면 즉사 */
export function warnCircle(w: World, x: number, y: number, r: number, sec: number, dmg: number, lethal: boolean): number {
  return spawnHazard(w, x, y, r, sec, dmg, HZ.warn, { flag: lethal ? HZ_LETHAL : 0 });
}

/** 레이저 (경고 → 발사) */
export function updateBeams(w: World, dt: number): void {
  const b = w.beams;
  const p = w.player;
  for (let i = 0; i < b.cap; i++) {
    if (!b.alive[i]) continue;
    if (b.warn[i] > 0) {
      b.warn[i] -= dt;
      if (b.warn[i] <= 0) {
        if (b.kind[i] === BEAM.telegraph) {
          b.alive[i] = 0;
          continue;
        }
        // 발사 순간 화면 흔들림 (§6)
        w.shake = Math.max(w.shake, CFG.feedback.bossShakeSec);
        w.shakePx = Math.max(w.shakePx, CFG.feedback.bossShakePx * 0.7);
        w.cues |= CUE.boom;
      }
      continue;
    }
    b.fire[i] -= dt;
    if (b.fire[i] <= 0) {
      b.alive[i] = 0;
      continue;
    }
    if (b.hit[i]) continue;
    const reach = b.width[i] / 2 + CFG.player.radius;
    if (segDist2(p.x, p.y, b.x[i], b.y[i], b.ang[i], b.len[i]) < reach * reach) {
      b.hit[i] = 1;
      if (b.kind[i] === BEAM.lethal) killPlayer(w, bossReason(w));
      else hurtPlayer(w, b.dmg[i], true);
    }
  }
}

/** 이 위치가 안전 장판 위인가 */
function onSafePad(w: World, x: number, y: number): boolean {
  const h = w.hazards;
  for (let i = 0; i < h.cap; i++) {
    if (h.alive[i] && h.kind[i] === HZ.safe && Math.hypot(x - h.x[i], y - h.y[i]) < h.r[i]) return true;
  }
  return false;
}

/** 보스 장판 (warn · red · blue · hole · safe). 플레이어 스킬 장판은 skills.ts 가 맡는다 */
export function updateBossHazards(w: World, dt: number): void {
  const h = w.hazards;
  const p = w.player;
  const tc = CFG.trideca;

  for (let i = 0; i < h.cap; i++) {
    if (!h.alive[i] || h.kind[i] < HZ.warn) continue;
    const kind = h.kind[i];
    // ⏸️ 시간 정지 동안은 경고도 멈춘다
    if (w.frozen <= 0) h.life[i] -= dt;
    const inside = Math.hypot(p.x - h.x[i], p.y - h.y[i]) < h.r[i] + CFG.player.radius * 0.5;

    if (kind === HZ.warn) {
      if (h.life[i] <= 0) {
        burst(w, h.x[i], h.y[i], 12, 6, 220);
        w.shake = Math.max(w.shake, 0.15);
        w.shakePx = Math.max(w.shakePx, 5);
        if (inside) {
          if (h.flag[i] & HZ_LETHAL) killPlayer(w, bossReason(w));
          else hurtPlayer(w, h.dps[i], true);
        }
        h.alive[i] = 0;
      }
      continue;
    }

    if (kind === HZ.red) {
      if (inside) killPlayer(w, bossReason(w));
    } else if (kind === HZ.blue) {
      if (inside) {
        p.slow = Math.max(p.slow, 0.25);
        p.slowMult = Math.min(p.slowMult, tc.tileSlowMult);
      }
    } else if (kind === HZ.hole) {
      // tick > 0 동안은 경고, 그다음부터 3초마다 끌어당긴다
      if (h.tick[i] > 0) {
        h.tick[i] -= dt;
      } else if (w.frozen <= 0) {
        h.tick[i] -= dt;
        if (h.tick[i] <= -tc.holePullEvery) {
          h.tick[i] += tc.holePullEvery;
          if (!onSafePad(w, p.x, p.y)) {
            const dx = h.x[i] - p.x;
            const dy = h.y[i] - p.y;
            const d = Math.hypot(dx, dy) || 1;
            p.kx += (dx / d) * tc.holePull * 3;
            p.ky += (dy / d) * tc.holePull * 3;
            w.shake = Math.max(w.shake, 0.2);
            w.shakePx = Math.max(w.shakePx, 6);
          }
        }
        // 한가운데는 아프다
        if (Math.hypot(p.x - h.x[i], p.y - h.y[i]) < 40) hurtPlayer(w, h.dps[i], true);
      }
    }

    if (h.life[i] <= 0) h.alive[i] = 0;
  }
}

/** 보스가 사라질 때 남은 패턴을 걷는다 */
export function clearBossEffects(w: World): void {
  const h = w.hazards;
  for (let i = 0; i < h.cap; i++) if (h.alive[i] && h.kind[i] >= HZ.warn) h.alive[i] = 0;
  const b = w.beams;
  for (let i = 0; i < b.cap; i++) b.alive[i] = 0;
  const bl = w.bullets;
  for (let i = 0; i < bl.cap; i++) if (bl.alive[i] && bl.hostile[i]) bl.alive[i] = 0;
  const e = w.enemies;
  for (let i = 0; i < e.cap; i++) if (e.alive[i] && e.rank[i] === 1) e.alive[i] = 0;
}
