// 🦉 아울 서바이버즈 v2 — 액티브 스킬 실행 (기획서 §7 · §14)
//
// 스킬 20종을 20개의 함수로 쓰지 않는다. **유형(archetype)별 핸들러**가 데이터를 읽어 동작한다.
// 진화는 "같은 유형 + 강화 플래그"로 처리한다 (evolved).

import { CFG } from "../config";
import { ACTIVES, skillCooldown, skillCount, skillDamage } from "../data/skills";
import { damageObstacle, hitObstacle } from "./obstacles";
import {
  burst,
  damageEnemy,
  forEachEnemyNear,
  healPlayer,
  hurtPlayer,
  nearestEnemy,
  pushLog,
  spawnBullet,
  spawnHazard,
  spawnParticle,
  TAG,
  tagMask,
  type World,
} from "./world";
import type { SkillSlot } from "../types";

/** 하니팟·블랙홀 등 장판 종류 */
export const HZ = { field: 0, enemy: 1, honey: 2, pull: 3, stun: 4, burn: 5 } as const;

/** 위성·드론은 매 프레임 자리를 다시 잡는다 */
const ORBIT_SPEED = 2.4;
const DRONE_RADIUS = 52;
const SAT_HIT_CD = 0.25;

/** 진화 슬롯의 킬 카운터 (A09) — 슬롯 하나당 하나라 월드에 두지 않고 여기 둔다 */
const killCounters = new WeakMap<SkillSlot, number>();

export function resetSkillRuntime(slot: SkillSlot): void {
  killCounters.delete(slot);
}

function aimDir(w: World): { x: number; y: number } {
  const i = nearestEnemy(w, w.player.x, w.player.y);
  if (i >= 0) {
    const dx = w.enemies.x[i] - w.player.x;
    const dy = w.enemies.y[i] - w.player.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }
  return { x: Math.cos(w.player.dir), y: Math.sin(w.player.dir) };
}

/** 반경 안의 적에게 즉시 피해 (+선택적 상태이상) */
function areaDamage(
  w: World, x: number, y: number, r: number, dmg: number, tags: number,
  status?: { slow?: number; burn?: number; stun?: number; mark?: number; dps?: number },
  knock = 0,
): number {
  let hit = 0;
  const e = w.enemies;
  forEachEnemyNear(w, x, y, r + 30, (i) => {
    if (!e.alive[i]) return;
    const d = Math.hypot(e.x[i] - x, e.y[i] - y);
    if (d > r + e.r[i]) return;
    hit++;
    if (status) {
      if (status.slow) e.slowT[i] = Math.max(e.slowT[i], status.slow);
      if (status.stun) e.stunT[i] = Math.max(e.stunT[i], status.stun);
      if (status.mark) e.markT[i] = Math.max(e.markT[i], status.mark);
      if (status.burn) {
        e.burnT[i] = Math.max(e.burnT[i], status.burn);
        e.burnDps[i] = Math.max(e.burnDps[i], status.dps ?? dmg * 0.4);
      }
    }
    if (knock > 0 && d > 0.001) {
      e.x[i] += ((e.x[i] - x) / d) * knock;
      e.y[i] += ((e.y[i] - y) / d) * knock;
    }
    if (dmg > 0) damageEnemy(w, i, dmg, tags);
  });
  return hit;
}

/* ── 발동 ───────────────────────────────────────────────────── */

function fire(w: World, slot: SkillSlot, idx: number): void {
  const sk = ACTIVES[slot.id];
  const evolved = slot.evo !== null;
  const dmg = skillDamage(sk.dmg, slot.lv, w.stats);
  const n = skillCount(sk, slot.lv, w.stats, evolved);
  const tags = tagMask(sk.tags);
  const dir = aimDir(w);
  const p = w.player;
  const speed = sk.speed * w.stats.projSpeed;
  const life = 1.2 * w.stats.duration * (evolved && sk.evo === "E01" ? 2 : 1);

  switch (sk.arch) {
    case "homing": {
      for (let k = 0; k < n; k++) {
        const a = evolved
          ? (Math.PI * 2 * k) / n
          : Math.atan2(dir.y, dir.x) + (k - (n - 1) / 2) * 0.16;
        spawnBullet(w, p.x, p.y, Math.cos(a) * speed, Math.sin(a) * speed, dmg, life, 6, 0, tags, { owner: idx });
      }
      break;
    }
    case "spray": {
      for (let k = 0; k < n; k++) {
        const a = w.rand() * Math.PI * 2;
        spawnBullet(w, p.x, p.y, Math.cos(a) * speed, Math.sin(a) * speed, dmg, life, 5, 4, tags, { owner: idx });
      }
      break;
    }
    case "beam": {
      const pierce = evolved ? 999 : sk.pierce + slot.lv;
      spawnBullet(w, p.x, p.y, dir.x * speed, dir.y * speed, dmg, 0.9, 7, 1, tags, {
        owner: idx, pierce, aux: evolved ? 1 : 0,
      });
      break;
    }
    case "line": {
      const beams = evolved ? 3 : 1;
      for (let k = 0; k < beams; k++) {
        const off = (k - (beams - 1) / 2) * 0.5;
        const ax = Math.cos(off) * speed;
        const ay = Math.sin(off) * speed;
        spawnBullet(w, p.x, p.y, ax, ay, dmg, 1.1, 6, 2, tags, { owner: idx, pierce: 99, status: evolved ? 2 : 0 });
        spawnBullet(w, p.x, p.y, -ax, -ay, dmg, 1.1, 6, 2, tags, { owner: idx, pierce: 99, status: evolved ? 2 : 0 });
      }
      break;
    }
    case "boomerang": {
      for (let k = 0; k < n; k++) {
        const a = Math.atan2(dir.y, dir.x) + (k - (n - 1) / 2) * 0.35;
        spawnBullet(w, p.x, p.y, Math.cos(a) * speed, Math.sin(a) * speed, dmg, 1.6, 8, 5, tags, {
          owner: idx, pierce: 99, aux: 0.8,
        });
      }
      break;
    }
    case "aura": {
      const r = (sk.radius + slot.lv * 14) * (evolved ? 2 : 1);
      areaDamage(w, p.x, p.y, r, dmg, tags, undefined, evolved ? 14 : 0);
      break;
    }
    case "melee": {
      const r = sk.radius + slot.lv * 10;
      if (evolved) {
        // ⚡ 커널 러시 — 가장 가까운 적까지 돌진하며 무적
        const i = nearestEnemy(w, p.x, p.y, 420);
        if (i >= 0) {
          p.x = w.enemies.x[i] - dir.x * 30;
          p.y = w.enemies.y[i] - dir.y * 30;
          p.invuln = Math.max(p.invuln, 0.35);
        }
      }
      areaDamage(w, p.x, p.y, r, dmg, tags, { mark: evolved ? 2 : 0 }, 10);
      burst(w, p.x, p.y, 6, 0, 140);
      break;
    }
    case "wave": {
      areaDamage(w, p.x, p.y, sk.radius + slot.lv * 18, dmg, tags, undefined, 34);
      for (let k = 0; k < 12; k++) {
        const a = (Math.PI * 2 * k) / 12;
        spawnParticle(w, p.x + Math.cos(a) * 30, p.y + Math.sin(a) * 30, Math.cos(a) * 260, Math.sin(a) * 260, 0.32, 3, 4);
      }
      break;
    }
    case "cone": {
      const r = sk.radius + slot.lv * 12;
      const e = w.enemies;
      forEachEnemyNear(w, p.x + dir.x * r * 0.5, p.y + dir.y * r * 0.5, r, (i) => {
        if (!e.alive[i]) return;
        const dx = e.x[i] - p.x;
        const dy = e.y[i] - p.y;
        const d = Math.hypot(dx, dy);
        if (d > r) return;
        if ((dx / d) * dir.x + (dy / d) * dir.y < 0.5) return; // 전방 60°
        e.slowT[i] = Math.max(e.slowT[i], 2);
        damageEnemy(w, i, dmg, tags);
      });
      break;
    }
    case "chain": {
      const maxJump = evolved ? 99 : sk.count + slot.lv;
      let from = nearestEnemy(w, p.x, p.y, 420);
      const seen = new Set<number>();
      let power = dmg;
      for (let j = 0; j < maxJump && from >= 0; j++) {
        seen.add(from);
        const slowed = w.enemies.slowT[from] > 0;
        damageEnemy(w, from, power * (evolved && slowed ? 3 : 1), tags);
        const fx = w.enemies.x[from];
        const fy = w.enemies.y[from];
        for (let k = 0; k < 6; k++) spawnParticle(w, fx, fy, (w.rand() - 0.5) * 120, (w.rand() - 0.5) * 120, 0.2, 2, 5);
        let next = -1;
        let bd = sk.radius * sk.radius;
        forEachEnemyNear(w, fx, fy, sk.radius, (i) => {
          if (seen.has(i) || !w.enemies.alive[i]) return;
          const d = (w.enemies.x[i] - fx) ** 2 + (w.enemies.y[i] - fy) ** 2;
          if (d < bd) { bd = d; next = i; }
        });
        from = next;
        power *= 0.9;
      }
      break;
    }
    case "trap": {
      spawnHazard(w, p.x, p.y, sk.radius * 0.5, sk.duration * w.stats.duration, 0, HZ.honey, { owner: idx, tags });
      break;
    }
    case "pull": {
      const dur = sk.duration * w.stats.duration * (evolved ? 2 : 1);
      spawnHazard(w, p.x + dir.x * 120, p.y + dir.y * 120, sk.radius + slot.lv * 8, dur, dmg, HZ.pull, { owner: idx, tags });
      break;
    }
    case "stun": {
      spawnHazard(w, p.x + dir.x * 90, p.y + dir.y * 90, sk.radius, sk.duration * w.stats.duration, 0, HZ.stun, { owner: idx, tags });
      break;
    }
    case "burn": {
      spawnHazard(w, p.x + dir.x * 90, p.y + dir.y * 90, sk.radius, sk.duration * w.stats.duration, dmg, HZ.burn, { owner: idx, tags });
      break;
    }
    case "bomb": {
      spawnBullet(w, p.x, p.y, dir.x * sk.speed, dir.y * sk.speed, dmg, sk.duration, 10, 6, tags, {
        owner: idx, aux: sk.radius,
      });
      break;
    }
    case "strike": {
      for (let k = 0; k < n; k++) {
        const a = w.rand() * Math.PI * 2;
        const d = 60 + w.rand() * 220;
        const x = p.x + Math.cos(a) * d;
        const y = p.y + Math.sin(a) * d;
        areaDamage(w, x, y, sk.radius, dmg, tags);
        burst(w, x, y, 8, 5, 180);
      }
      break;
    }
    case "heal": {
      const amount = (14 + slot.lv * 4) * (evolved ? 2 : 1);
      healPlayer(w, amount);
      if (evolved) p.invuln = Math.max(p.invuln, 0.6);
      areaDamage(w, p.x, p.y, sk.radius, dmg, tags);
      pushLog(w, "INFO", `백신 — 체력 +${Math.round(amount)}`);
      break;
    }
    case "onkill":
    case "orbit":
    case "drone":
      break; // 아래 지속 처리에서 다룬다
  }
}

/* ── 지속형(위성·드론·오라) ─────────────────────────────────── */

function updateOrbit(w: World, slot: SkillSlot, idx: number, dt: number): void {
  const sk = ACTIVES[slot.id];
  const evolved = slot.evo !== null;
  const want = skillCount(sk, slot.lv, w.stats, evolved);
  const b = w.bullets;

  let have = 0;
  for (let i = 0; i < b.cap; i++) if (b.alive[i] && b.look[i] === 3 && b.owner[i] === idx) have++;

  if (have !== want) {
    for (let i = 0; i < b.cap; i++) if (b.alive[i] && b.look[i] === 3 && b.owner[i] === idx) b.alive[i] = 0;
    for (let k = 0; k < want; k++) {
      spawnBullet(w, w.player.x, w.player.y, 0, 0, 0, 0, 9, 3, tagMask(sk.tags), { owner: idx, aux: k });
    }
  }

  const r = sk.radius + slot.lv * 6;
  const dmg = skillDamage(sk.dmg, slot.lv, w.stats);
  for (let i = 0; i < b.cap; i++) {
    if (!b.alive[i] || b.look[i] !== 3 || b.owner[i] !== idx) continue;
    const a = w.t * ORBIT_SPEED + (Math.PI * 2 * b.aux[i]) / Math.max(1, want);
    b.x[i] = w.player.x + Math.cos(a) * r;
    b.y[i] = w.player.y + Math.sin(a) * r;
    b.life[i] -= dt;
    if (b.life[i] > 0) continue;

    let hit = false;
    forEachEnemyNear(w, b.x[i], b.y[i], 24, (j) => {
      if (hit || !w.enemies.alive[j]) return;
      if (Math.hypot(w.enemies.x[j] - b.x[i], w.enemies.y[j] - b.y[i]) > w.enemies.r[j] + 9) return;
      damageEnemy(w, j, dmg, b.tags[i]);
      hit = true;
    });
    if (hit) b.life[i] = SAT_HIT_CD;
  }

  // 🛸 봇넷 오비탈 — XP 자동 흡수
  if (evolved) {
    const o = w.orbs;
    for (let i = 0; i < o.cap; i++) {
      if (!o.alive[i]) continue;
      const dx = w.player.x - o.x[i];
      const dy = w.player.y - o.y[i];
      const d = Math.hypot(dx, dy) || 1;
      o.vx[i] += (dx / d) * 900 * dt;
      o.vy[i] += (dy / d) * 900 * dt;
    }
  }
}

function updateDrone(w: World, slot: SkillSlot, idx: number): void {
  const sk = ACTIVES[slot.id];
  const evolved = slot.evo !== null;
  const n = skillCount(sk, slot.lv, w.stats, evolved);
  const dmg = skillDamage(sk.dmg, slot.lv, w.stats);
  const target = nearestEnemy(w, w.player.x, w.player.y, 520);
  if (target < 0) return;

  for (let k = 0; k < n; k++) {
    const a = w.t * 1.2 + (Math.PI * 2 * k) / n;
    const dx0 = w.player.x + Math.cos(a) * DRONE_RADIUS;
    const dy0 = w.player.y + Math.sin(a) * DRONE_RADIUS;
    let dx = w.enemies.x[target] - dx0;
    let dy = w.enemies.y[target] - dy0;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    spawnBullet(w, dx0, dy0, dx * sk.speed, dy * sk.speed, dmg, 1.1, 5, 0, tagMask(sk.tags), { owner: idx });
    if (evolved) w.enemies.markT[target] = Math.max(w.enemies.markT[target], 2);
  }
}

/** 🧨 로그 폭탄 — 처치 수가 임계에 닿으면 화면 전체 폭발 */
function updateOnKill(w: World, slot: SkillSlot): void {
  const sk = ACTIVES[slot.id];
  const evolved = slot.evo !== null;
  const need = Math.max(8, (evolved ? 20 : sk.count) - (slot.lv - 1) * 4);
  const prev = killCounters.get(slot) ?? 0;
  if (w.run.kills - prev < need) return;
  killCounters.set(slot, w.run.kills);

  const dmg = skillDamage(sk.dmg, slot.lv, w.stats);
  const e = w.enemies;
  for (let i = 0; i < e.cap; i++) {
    if (!e.alive[i]) continue;
    if (Math.hypot(e.x[i] - w.player.x, e.y[i] - w.player.y) > CFG.view.w) continue;
    damageEnemy(w, i, dmg, TAG.explosion | TAG.aoe, false);
  }
  w.flash = Math.max(w.flash, 0.1);
  pushLog(w, "INFO", `로그 폭탄 — 화면 전체 ${Math.round(dmg)} 피해`);
}

/* ── 프레임 갱신 ────────────────────────────────────────────── */

export function updateSkills(w: World, dt: number): void {
  for (let idx = 0; idx < w.actives.length; idx++) {
    const slot = w.actives[idx];
    const sk = ACTIVES[slot.id];

    if (sk.arch === "orbit") { updateOrbit(w, slot, idx, dt); continue; }
    if (sk.arch === "onkill") { updateOnKill(w, slot); continue; }

    slot.cd -= dt;
    if (slot.cd > 0) continue;

    if (sk.arch === "drone") updateDrone(w, slot, idx);
    else {
      fire(w, slot, idx);
      // ⚖️ 로드밸런서 — 첫 액티브가 한 번 더 때린다
      if (idx === 0 && w.stats.extraStrike > 0) fire(w, slot, idx);
    }

    // 🔁 리트라이
    slot.cd = w.rand() < w.stats.resetChance ? 0 : skillCooldown(sk.cd || 1, slot.lv, w.stats);
  }
}

/** 투사체 이동·충돌 (적 탄은 enemies.ts 가 따로 처리한다) */
export function updateBullets(w: World, dt: number): void {
  const b = w.bullets;
  const e = w.enemies;

  for (let i = 0; i < b.cap; i++) {
    if (!b.alive[i] || b.hostile[i] || b.look[i] === 3) continue;

    // 🌀 부메랑은 감속 → 역주행
    if (b.look[i] === 5) {
      b.vx[i] -= b.vx[i] * 2.2 * dt;
      b.vy[i] -= b.vy[i] * 2.2 * dt;
      b.aux[i] -= dt;
      if (b.aux[i] <= 0) {
        const dx = w.player.x - b.x[i];
        const dy = w.player.y - b.y[i];
        const d = Math.hypot(dx, dy) || 1;
        b.vx[i] = (dx / d) * 380;
        b.vy[i] = (dy / d) * 380;
      }
    }

    b.x[i] += b.vx[i] * dt;
    b.y[i] += b.vy[i] * dt;
    b.life[i] -= dt;

    // 💣 커널 봄 — 수명이 끝나면 터진다
    if (b.life[i] <= 0) {
      if (b.look[i] === 6) {
        areaDamage(w, b.x[i], b.y[i], b.aux[i], b.dmg[i], b.tags[i]);
        burst(w, b.x[i], b.y[i], 14, 0, 240);
        w.shake = Math.max(w.shake, 0.12);
        w.shakePx = Math.max(w.shakePx, 4);
      }
      b.alive[i] = 0;
      continue;
    }

    // 장애물
    const ob = hitObstacle(w, b.x[i], b.y[i], b.r[i]);
    if (ob >= 0) {
      damageObstacle(w, ob, b.dmg[i]);
      if (b.pierce[i] <= 0) { b.alive[i] = 0; continue; }
    }

    let done = false;
    forEachEnemyNear(w, b.x[i], b.y[i], b.r[i] + 28, (j) => {
      if (done || !e.alive[j] || !b.alive[i]) return;
      if (Math.hypot(e.x[j] - b.x[i], e.y[j] - b.y[i]) > e.r[j] + b.r[i]) return;

      let dmg = b.dmg[i];
      // 🌠 오비탈 블래스터 — 관통할수록 세진다
      if (b.aux[i] > 0 && b.look[i] === 1) dmg *= 1 + 0.15 * b.aux[i];

      damageEnemy(w, j, dmg, b.tags[i]);

      if (b.status[i] === 1) e.slowT[j] = Math.max(e.slowT[j], 2);
      if (b.status[i] === 2) { e.burnT[j] = Math.max(e.burnT[j], 2); e.burnDps[j] = Math.max(e.burnDps[j], dmg * 0.3); }
      if (b.status[i] === 3) e.markT[j] = Math.max(e.markT[j], 2.5);

      if (b.look[i] === 1) b.aux[i] += 1;
      if (b.pierce[i] > 0) b.pierce[i] -= 1;
      else { b.alive[i] = 0; done = true; }
    });
  }
}

/** 장판 (§7 하니팟·블랙홀·화염·샌드박스) */
export function updateHazards(w: World, dt: number): void {
  const h = w.hazards;
  const e = w.enemies;

  for (let i = 0; i < h.cap; i++) {
    if (!h.alive[i]) continue;
    h.life[i] -= dt;
    h.tick[i] -= dt;

    const kind = h.kind[i];

    if (kind === HZ.honey) {
      // 유인: 반경 2배 안의 적을 끌어당긴다
      forEachEnemyNear(w, h.x[i], h.y[i], h.r[i] * 3, (j) => {
        if (!e.alive[j] || e.rank[j] >= 2) return;
        const dx = h.x[i] - e.x[j];
        const dy = h.y[i] - e.y[j];
        const d = Math.hypot(dx, dy) || 1;
        e.x[j] += (dx / d) * 40 * dt;
        e.y[j] += (dy / d) * 40 * dt;
      });
      if (h.life[i] <= 0) {
        const sk = ACTIVES["A06"];
        const slot = w.actives.find((s) => s.id === "A06");
        const lv = slot?.lv ?? 1;
        const evolved = slot?.evo !== null && slot?.evo !== undefined;
        const dmg = skillDamage(sk.dmg, lv, w.stats);
        let x = h.x[i];
        let y = h.y[i];
        const chains = evolved ? 5 : 1;
        for (let c = 0; c < chains; c++) {
          areaDamage(w, x, y, sk.radius, dmg * (1 - c * 0.12), TAG.explosion | TAG.aoe);
          burst(w, x, y, 10, 0, 200);
          const next = nearestEnemy(w, x, y, 220);
          if (next < 0) break;
          x = e.x[next];
          y = e.y[next];
        }
        h.alive[i] = 0;
        continue;
      }
    } else if (kind === HZ.pull) {
      forEachEnemyNear(w, h.x[i], h.y[i], h.r[i] * 2.4, (j) => {
        if (!e.alive[j] || e.rank[j] >= 3) return;
        const dx = h.x[i] - e.x[j];
        const dy = h.y[i] - e.y[j];
        const d = Math.hypot(dx, dy) || 1;
        e.x[j] += (dx / d) * 150 * dt;
        e.y[j] += (dy / d) * 150 * dt;
        e.pullT[j] = 0.3;
      });
      if (h.tick[i] <= 0) {
        h.tick[i] = 0.3;
        areaDamage(w, h.x[i], h.y[i], h.r[i], h.dps[i], h.tags[i]);
      }
    } else if (kind === HZ.stun) {
      forEachEnemyNear(w, h.x[i], h.y[i], h.r[i] + 20, (j) => {
        if (!e.alive[j] || e.rank[j] >= 3) return;
        if (Math.hypot(e.x[j] - h.x[i], e.y[j] - h.y[i]) > h.r[i]) return;
        e.stunT[j] = Math.max(e.stunT[j], 0.4);
      });
    } else if (kind === HZ.burn) {
      if (h.tick[i] <= 0) {
        h.tick[i] = 0.4;
        areaDamage(w, h.x[i], h.y[i], h.r[i], h.dps[i], h.tags[i], { burn: 2, dps: h.dps[i] * 0.5 });
      }
    } else if (kind === HZ.field) {
      if (h.tick[i] <= 0) {
        h.tick[i] = 0.3;
        areaDamage(w, h.x[i], h.y[i], h.r[i], h.dps[i], h.tags[i]);
      }
    } else if (kind === HZ.enemy) {
      // 적 장판 — 플레이어가 밟으면 아프다
      if (h.tick[i] <= 0) {
        h.tick[i] = 0.5;
        if (Math.hypot(w.player.x - h.x[i], w.player.y - h.y[i]) < h.r[i]) {
          hurtPlayer(w, h.dps[i], true);
        }
      }
    }

    if (h.life[i] <= 0) h.alive[i] = 0;
  }
}

export { areaDamage };
