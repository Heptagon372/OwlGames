// 🚀 아울스페이스 — 탄 이동·충돌·그레이즈 (기획서 §4 · §13)
//
// 플레이어 판정점 1개 vs 탄 900발은 **단순 거리 제곱 비교로 충분하다** (그리드 불필요).
// 그레이즈는 같은 루프에서 반경 22px 로 같이 재고, 탄마다 grazed 플래그로 1회만 판정한다.

import { CFG } from "../config";
import {
  addChipGauge,
  burst,
  clearBullets,
  damageEnemy,
  hitPlayer,
  pushLog,
  spawnChip,
  spawnParticle,
  spawnPBullet,
  type World,
} from "./world";

const RAD = Math.PI / 180;

/** S11 볼텍스가 탄을 흡수하는 간격 */
const VORTEX_CD = 0.4;
let vortexT = 0;

export function resetBulletRuntime(): void {
  vortexT = 0;
}

/* ── 적 탄 ──────────────────────────────────────────────────── */

export function updateEBullets(w: World, dt: number): void {
  const b = w.ebullets;
  const p = w.player;
  const hitR = w.stats.hitboxR;
  const grazeR = w.stats.grazeRadius;
  // ⏱️ 타임 디스토션 (S7)
  const slow = p.slowT > 0 ? 0.5 : 1;
  const hasVortex = w.subs.some((s) => s.id === "S11");
  vortexT -= dt;

  for (let i = 0; i < b.cap; i++) {
    if (!b.alive[i]) continue;

    b.x[i] += b.vx[i] * slow * dt;
    b.y[i] += b.vy[i] * slow * dt;
    b.life[i] -= dt;

    // 화면 밖이면 즉시 반환
    if (
      b.life[i] <= 0 ||
      b.x[i] < -40 || b.x[i] > CFG.screen.w + 40 ||
      b.y[i] < -60 || b.y[i] > CFG.screen.h + 60
    ) {
      b.alive[i] = 0;
      continue;
    }

    const dx = b.x[i] - p.x;
    const dy = b.y[i] - p.y;
    const d2 = dx * dx + dy * dy;

    // 🌀 볼텍스 — 가까운 작은 탄을 칩으로 흡수
    if (hasVortex && vortexT <= 0 && b.r[i] <= 6 && d2 < 70 * 70) {
      vortexT = VORTEX_CD;
      spawnChip(w, b.x[i], b.y[i], 1);
      b.alive[i] = 0;
      continue;
    }

    // 🛡️ 오빗 실드 (S2) — 위성이 탄을 하나씩 지운다
    if (p.orbits > 0 && d2 < 34 * 34) {
      p.orbits -= 1;
      p.orbitT = 3;
      burst(w, b.x[i], b.y[i], 4, 1, 90);
      b.alive[i] = 0;
      continue;
    }

    // 🧱 포인트 배리어 (S8) — 앞쪽 방벽
    if (p.barrier > 0 && b.y[i] < p.y - 18 && b.y[i] > p.y - 52 && Math.abs(dx) < 30) {
      p.barrier -= 1;
      if (p.barrier <= 0) p.barrierT = 4;
      spawnParticle(w, b.x[i], b.y[i], 0, -60, 0.2, 3, 1);
      b.alive[i] = 0;
      continue;
    }

    const hit = hitR + b.r[i];
    if (d2 < hit * hit) {
      b.alive[i] = 0;
      hitPlayer(w);
      continue;
    }

    // ✨ 그레이즈 — 이 게임 점수의 핵심
    if (!b.grazed[i]) {
      const g = grazeR + b.r[i];
      if (d2 < g * g) {
        b.grazed[i] = 1;
        onGraze(w);
      }
    }
  }
}

function onGraze(w: World): void {
  const p = w.player;
  w.run.graze += 1;
  addChipGauge(w, CFG.graze.chipGain);

  // 봄 게이지 (§3)
  if (w.run.graze % CFG.bomb.grazePerBomb === 0 && p.bombs < w.stats.bombMax) {
    p.bombs += 1;
    pushLog(w, "SKILL", `그레이즈 보상 — 봄 +1 (${p.bombs}개)`);
  }

  // 🔆 카운터 버스트 (S9) — 20회마다 주변 탄 소거
  if (w.subs.some((s) => s.id === "S9") && w.run.graze % 20 === 0) {
    const b = w.ebullets;
    for (let i = 0; i < b.cap; i++) {
      if (!b.alive[i]) continue;
      if ((b.x[i] - p.x) ** 2 + (b.y[i] - p.y) ** 2 < 150 * 150) {
        spawnChip(w, b.x[i], b.y[i], 1);
        b.alive[i] = 0;
      }
    }
    // 🛡️ 오빗 실드 즉시 재충전 (시너지 Y3)
    if (w.subs.some((s) => s.id === "S2")) p.orbits = orbitMax(w);
    pushLog(w, "SKILL", "카운터 버스트 — 주변 탄 소거");
  }

  if (w.run.graze % 50 === 0) {
    pushLog(w, "GRAZE", `스치기 ×${w.run.graze}  +${Math.round(w.run.graze * CFG.graze.score * w.stats.grazeScore)}`);
  }
}

export function orbitMax(w: World): number {
  const s = w.subs.find((x) => x.id === "S2");
  return s ? 1 + s.lv : 0;
}

/* ── 레이저 (§14-4: 반드시 예고선 먼저) ─────────────────────── */

export function updateLasers(w: World, dt: number): void {
  const l = w.lasers;
  const p = w.player;
  const scanner = w.subs.some((s) => s.id === "S10");

  for (let i = 0; i < l.cap; i++) {
    if (!l.alive[i]) continue;

    // 소유 적을 따라다닌다
    const src = l.src[i];
    if (src >= 0 && w.enemies.alive[src]) {
      l.x[i] = w.enemies.x[src];
      l.y[i] = w.enemies.y[src];
    }

    if (l.warn[i] > 0) {
      // 📡 스캐너가 있으면 예고가 더 길게 보인다
      l.warn[i] -= dt * (scanner ? 0.6 : 1);
      if (l.warn[i] <= 0) l.active[i] = 0.9;
      continue;
    }

    l.active[i] -= dt;
    if (l.active[i] <= 0) { l.alive[i] = 0; continue; }

    // 선분(발사점 → 화면 밖)과 판정점의 거리
    const a = l.angle[i] * RAD;
    const dx = Math.sin(a);
    const dy = Math.cos(a);
    const px = p.x - l.x[i];
    const py = p.y - l.y[i];
    const t = Math.max(0, px * dx + py * dy);
    const cx = l.x[i] + dx * t;
    const cy = l.y[i] + dy * t;
    const dist = Math.hypot(p.x - cx, p.y - cy);

    if (dist < l.width[i] / 2 + w.stats.hitboxR) {
      hitPlayer(w);
    } else if (dist < l.width[i] / 2 + w.stats.grazeRadius && w.frame % 12 === 0) {
      // 레이저도 스칠 수 있다 (같은 탄 1회 제한이 없어 프레임 간격을 둔다)
      onGraze(w);
    }
  }
}

/* ── 내 탄 ──────────────────────────────────────────────────── */

export function updatePBullets(w: World, dt: number): void {
  const b = w.pbullets;
  const e = w.enemies;

  for (let i = 0; i < b.cap; i++) {
    if (!b.alive[i]) continue;

    // 🎯 호밍
    if (b.look[i] === 2) {
      let tgt = b.target[i];
      if (tgt < 0 || !e.alive[tgt]) {
        tgt = -1;
        let bd = Infinity;
        for (let k = 0; k < e.cap; k++) {
          if (!e.alive[k]) continue;
          const d = (e.x[k] - b.x[i]) ** 2 + (e.y[k] - b.y[i]) ** 2;
          if (d < bd) { bd = d; tgt = k; }
        }
        b.target[i] = tgt;
      }
      if (tgt >= 0) {
        const dx = e.x[tgt] - b.x[i];
        const dy = e.y[tgt] - b.y[i];
        const d = Math.hypot(dx, dy) || 1;
        const sp = Math.hypot(b.vx[i], b.vy[i]) || 1;
        b.vx[i] += (dx / d) * sp * 3.5 * dt;
        b.vy[i] += (dy / d) * sp * 3.5 * dt;
        const ns = Math.hypot(b.vx[i], b.vy[i]) || 1;
        b.vx[i] = (b.vx[i] / ns) * sp;
        b.vy[i] = (b.vy[i] / ns) * sp;
      }
    }

    b.x[i] += b.vx[i] * dt;
    b.y[i] += b.vy[i] * dt;
    b.life[i] -= dt;

    // 🪃 리플렉트 — 좌우 벽에 튕긴다
    if (b.look[i] === 3) {
      if (b.x[i] < 4 || b.x[i] > CFG.screen.w - 4) {
        b.vx[i] *= -1;
        b.x[i] = Math.max(4, Math.min(CFG.screen.w - 4, b.x[i]));
      }
    }

    if (b.life[i] <= 0 || b.y[i] < -30 || b.y[i] > CFG.screen.h + 30 || b.x[i] < -30 || b.x[i] > CFG.screen.w + 30) {
      b.alive[i] = 0;
      continue;
    }

    // 장애물
    const o = w.obstacles;
    let blocked = false;
    for (let k = 0; k < o.cap && !blocked; k++) {
      if (!o.alive[k]) continue;
      if (Math.abs(b.x[i] - o.x[k]) < o.w[k] / 2 && Math.abs(b.y[i] - o.y[k]) < o.h[k] / 2) {
        o.hp[k] -= b.dmg[i];
        o.flash[k] = CFG.feedback.flashSec;
        if (b.pierce[i] > 0) b.pierce[i] -= 1;
        else { b.alive[i] = 0; blocked = true; }
      }
    }
    if (blocked) continue;

    // 적
    for (let k = 0; k < e.cap; k++) {
      if (!e.alive[k] || !b.alive[i]) continue;
      const rr = e.r[k] + b.r[i];
      if ((e.x[k] - b.x[i]) ** 2 + (e.y[k] - b.y[i]) ** 2 > rr * rr) continue;

      const killed = damageEnemy(w, k, b.dmg[i]);

      // 💥 스플릿 캐논 — 명중하면 4갈래
      if (b.look[i] === 4) {
        for (let s = 0; s < 4; s++) {
          const a = (Math.PI / 2) * s + Math.PI / 4;
          spawnPBullet(w, b.x[i], b.y[i], Math.cos(a) * 420, Math.sin(a) * 420, b.dmg[i] * 0.5, 0, 0, 3);
        }
      }

      if (b.pierce[i] > 0) b.pierce[i] -= 1;
      else b.alive[i] = 0;
      if (killed) break;
    }
  }
}

/** 장애물 — 접촉은 넉백만, 피격 아님 (§7) */
export function updateObstacles(w: World, dt: number): void {
  const o = w.obstacles;
  const p = w.player;
  const speed = 150 * w.scrollMul;

  for (let i = 0; i < o.cap; i++) {
    if (!o.alive[i]) continue;
    o.y[i] += speed * dt;
    if (o.flash[i] > 0) o.flash[i] -= dt;

    if (o.hp[i] <= 0) {
      o.alive[i] = 0;
      w.run.obstacles += 1;
      burst(w, o.x[i], o.y[i], 10, 2, 170);
      const n = CFG.obstacle.chipDropMin + Math.floor(w.rand() * (CFG.obstacle.chipDropMax - CFG.obstacle.chipDropMin + 1));
      for (let k = 0; k < n; k++) spawnChip(w, o.x[i] + (w.rand() - 0.5) * 30, o.y[i] + (w.rand() - 0.5) * 30);
      if (w.rand() < CFG.obstacle.bombDropRate && p.bombs < w.stats.bombMax) {
        p.bombs += 1;
        pushLog(w, "DROP", "잔해에서 봄 +1");
      }
      continue;
    }

    if (o.y[i] > CFG.screen.h + 80) { o.alive[i] = 0; continue; }

    // 넉백만 (탄막 게임에서 지형 즉사는 불합리)
    const hw = o.w[i] / 2 + CFG.player.radius;
    const hh = o.h[i] / 2 + CFG.player.radius;
    const dx = p.x - o.x[i];
    const dy = p.y - o.y[i];
    if (Math.abs(dx) < hw && Math.abs(dy) < hh) {
      const ox = hw - Math.abs(dx);
      const oy = hh - Math.abs(dy);
      if (ox < oy) p.x = o.x[i] + Math.sign(dx || 1) * hw;
      else p.y = o.y[i] + Math.sign(dy || 1) * hh;
    }
  }
}

export function updateChips(w: World, dt: number): void {
  const c = w.chips;
  const p = w.player;
  const magnet = w.stats.magnet;

  for (let i = 0; i < c.cap; i++) {
    if (!c.alive[i]) continue;
    const dx = p.x - c.x[i];
    const dy = p.y - c.y[i];
    const d = Math.hypot(dx, dy) || 1;

    if (d < magnet) {
      c.vx[i] += (dx / d) * 1200 * dt;
      c.vy[i] += (dy / d) * 1200 * dt;
    } else {
      c.vy[i] += 120 * dt;
    }
    c.vx[i] *= 0.94;
    c.vy[i] *= 0.94;
    c.x[i] += c.vx[i] * dt;
    c.y[i] += c.vy[i] * dt;

    if (d < 20) {
      c.alive[i] = 0;
      w.run.chips += 1;
      addChipGauge(w, c.value[i]);
      continue;
    }
    if (c.y[i] > CFG.screen.h + 40) c.alive[i] = 0;
  }
}

export function updateParticles(w: World, dt: number): void {
  const q = w.particles;
  for (let i = 0; i < q.cap; i++) {
    if (!q.alive[i]) continue;
    q.life[i] -= dt;
    if (q.life[i] <= 0) { q.alive[i] = 0; continue; }
    q.x[i] += q.vx[i] * dt;
    q.y[i] += q.vy[i] * dt;
    q.vx[i] *= 0.93;
    q.vy[i] *= 0.93;
  }
}

export { clearBullets };
