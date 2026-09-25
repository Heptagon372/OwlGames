// 🚀 아울스페이스 — 발사와 서브 스킬 (기획서 §5)
// 발사는 전부 자동. 플레이어는 회피와 위치잡기만 한다.

import { CFG } from "../config";
import { MAINS, mainCooldown, mainCount, mainDamage } from "../data/skills";
import { orbitMax } from "./bullets";
import {
  burst,
  damageEnemy,
  nearestEnemy,
  pushLog,
  spawnParticle,
  spawnPBullet,
  type World,
} from "./world";

/** 메인샷 look 코드 */
const LOOK: Record<string, number> = { M1: 0, M2: 0, M3: 1, M4: 2, M5: 3, M6: 4 };

function fireMain(w: World): void {
  const p = w.player;
  const id = w.main.id;
  const lv = w.main.lv;
  const sk = MAINS[id];
  const dmg = mainDamage(id, lv, w.stats);
  const n = mainCount(id, lv);
  const pierce = sk.pierce + w.stats.pierce;
  const look = LOOK[id];

  if (id === "M2") {
    // 🌊 와이드 스프레드
    const spread = 50 + lv * 8;
    for (let k = 0; k < n; k++) {
      const a = (-spread / 2 + (spread * k) / Math.max(1, n - 1)) * (Math.PI / 180);
      spawnPBullet(w, p.x, p.y - 12, Math.sin(a) * sk.speed, -Math.cos(a) * sk.speed, dmg, look, pierce, 4);
    }
    return;
  }

  if (id === "M3") {
    // 🔴 피어싱 레이저 — 이동 중에는 위력이 떨어진다
    const moving = Math.abs(p.x - p.lastX) > 0.5;
    const power = moving ? 0.6 : 1;
    const wide = w.passives.some((x) => x.id === "P11");
    spawnPBullet(w, p.x, p.y - 16, 0, -sk.speed, dmg * power, look, 99, wide ? 8 : 5);
    return;
  }

  for (let k = 0; k < n; k++) {
    const off = (k - (n - 1) / 2) * 11;
    spawnPBullet(w, p.x + off, p.y - 12, 0, -sk.speed, dmg, look, pierce, id === "M6" ? 6 : 4);
  }
}

/** 서브 스킬 — 인덱스별 쿨다운을 쓴다 */
function fireSubs(w: World, dt: number): void {
  const p = w.player;
  for (let i = 0; i < w.subs.length; i++) {
    const s = w.subs[i];
    w.subCd[i] -= dt;
    if (w.subCd[i] > 0) continue;

    switch (s.id) {
      case "S1": {
        // 🐝 드론 윙맨
        w.subCd[i] = 0.32 / (1 + 0.15 * (s.lv - 1));
        const dmg = 6 * (1 + 0.3 * (s.lv - 1)) * w.stats.damage;
        spawnPBullet(w, p.x - 26, p.y, 0, -700, dmg, 0, w.stats.pierce, 3);
        spawnPBullet(w, p.x + 26, p.y, 0, -700, dmg, 0, w.stats.pierce, 3);
        break;
      }
      case "S3": {
        // 🚀 백 미사일
        w.subCd[i] = 1.4 / (1 + 0.2 * (s.lv - 1));
        const dmg = 16 * (1 + 0.3 * (s.lv - 1)) * w.stats.damage;
        spawnPBullet(w, p.x, p.y + 14, 0, 420, dmg, 2, 0, 5);
        break;
      }
      case "S4": {
        // ⚡ 체인 스파크
        w.subCd[i] = 1.6 / (1 + 0.2 * (s.lv - 1));
        let from = nearestEnemy(w, p.x, p.y);
        const jumps = 1 + s.lv;
        const seen = new Set<number>();
        let power = 14 * (1 + 0.35 * (s.lv - 1)) * w.stats.damage;
        for (let j = 0; j < jumps && from >= 0; j++) {
          if (Math.hypot(w.enemies.x[from] - p.x, w.enemies.y[from] - p.y) > 320) break;
          seen.add(from);
          const fx = w.enemies.x[from];
          const fy = w.enemies.y[from];
          damageEnemy(w, from, power);
          for (let k = 0; k < 4; k++) {
            spawnParticle(w, fx, fy, (w.rand() - 0.5) * 120, (w.rand() - 0.5) * 120, 0.2, 2, 1);
          }
          let next = -1;
          let bd = 180 * 180;
          for (let k = 0; k < w.enemies.cap; k++) {
            if (!w.enemies.alive[k] || seen.has(k)) continue;
            const d = (w.enemies.x[k] - fx) ** 2 + (w.enemies.y[k] - fy) ** 2;
            if (d < bd) { bd = d; next = k; }
          }
          from = next;
          power *= 0.85;
        }
        break;
      }
      case "S5": {
        // 💣 드롭 기뢰
        w.subCd[i] = 1.8;
        const dmg = 40 * (1 + 0.3 * (s.lv - 1)) * w.stats.damage;
        spawnPBullet(w, p.x, p.y + 16, 0, 90, dmg, 4, 0, 7);
        break;
      }
      case "S7": {
        // ⏱️ 타임 디스토션 — 8초마다 3초
        w.subCd[i] = 8;
        p.slowT = 3 + (s.lv - 1) * 0.5;
        pushLog(w, "SKILL", "타임 디스토션 — 적 탄 감속");
        break;
      }
      case "S12": {
        // 🦉 페이크 아울 — 분신이 유도탄을 끌어간다
        w.subCd[i] = 6;
        p.decoyT = 3 + s.lv;
        p.decoyX = Math.max(40, Math.min(CFG.screen.w - 40, p.x + (w.rand() < 0.5 ? -110 : 110)));
        p.decoyY = p.y - 40;
        break;
      }
      default:
        w.subCd[i] = 1;
        break;
    }
  }
}

export function updateSkills(w: World, dt: number): void {
  const p = w.player;

  w.mainCd -= dt;
  if (w.mainCd <= 0) {
    w.mainCd = mainCooldown(w.main.id, w.main.lv, w.stats);
    fireMain(w);
  }
  fireSubs(w, dt);

  // 🛡️ 오빗 실드 재생
  const omax = orbitMax(w);
  if (omax > 0) {
    if (p.orbits < omax) {
      p.orbitT -= dt;
      if (p.orbitT <= 0) { p.orbits += 1; p.orbitT = 3; }
    }
  } else {
    p.orbits = 0;
  }

  // 🧱 포인트 배리어 재생
  const hasBarrier = w.subs.some((s) => s.id === "S8");
  if (hasBarrier && p.barrier <= 0) {
    p.barrierT -= dt;
    if (p.barrierT <= 0) p.barrier = 3;
  }

  // 🛡️ 나노 실드 (P8)
  if (w.stats.shieldSec > 0 && !p.shield) {
    p.shieldT += dt;
    if (p.shieldT >= w.stats.shieldSec) { p.shield = true; p.shieldT = 0; }
  }

  if (p.slowT > 0) p.slowT -= dt;
  if (p.decoyT > 0) {
    p.decoyT -= dt;
    if (p.decoyT <= 0) burst(w, p.decoyX, p.decoyY, 6, 0, 90);
  }
}
