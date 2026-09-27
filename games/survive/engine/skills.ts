// 🦉 아울 서바이버즈 v3 — 액티브 스킬 실행 (기획서 §7 · §14)
//
// 스킬 35종을 35개의 함수로 쓰지 않는다. **유형(archetype)별 핸들러**가 데이터를 읽어 동작한다.
// 진화는 "같은 유형 + 강화 플래그"로 처리한다 (evolved).

import { msg } from "@/games/core/i18n";
import { CFG } from "../config";
import { ACTIVES, areaOf, auraRadius, skillCooldown, skillCount, skillDamage } from "../data/skills";
import { damageObstacle, hitObstacle } from "./obstacles";
import {
  burst,
  CUE,
  damageEnemy,
  forEachEnemyNear,
  FX,
  healPlayer,
  hurtPlayer,
  HZ,
  killEnemy,
  nearestEnemy,
  PC,
  pushLog,
  segDist2,
  spawnBullet,
  spawnFx,
  spawnHazard,
  spawnParticle,
  TAG,
  tagMask,
  type World,
} from "./world";
import type { Archetype, SkillSlot } from "../types";

/** 하니팟·블랙홀 등 장판 종류 — 보스 장판과 번호를 나눠 쓰므로 world.ts 한 곳에 둔다 */
export { HZ };

/** 위성·드론은 매 프레임 자리를 다시 잡는다 */
const ORBIT_SPEED = 2.4;
const DRONE_RADIUS = 52;
const SAT_HIT_CD = 0.25;

/** 내 탄의 렌더 모양 번호 (world.ts BulletPool.look) — 새 유형은 10번부터 */
export const LOOK = { beam: 1, orbit: 3, spray: 4, bomb: 6, turret: 10, mine: 11, disc: 12, worm: 13, sweep: 14 } as const;

/** 추가 액티브(A21~A35)의 동작 상수 — 데이터(data/skills.ts)에 없는 모양·박자 값 */
const SK = {
  /** 🔐 암호화 실드 — 밀쳐내기 · 되쏘는 탄 수 상한 · 되쏘는 탄 속도 (E13) */
  barrierKnock: 26, reflectMax: 12, reflectSpeed: 520,
  /**
   * 🐛 웜 — 복제 세대 · 갈래 · 갈래 각도 · 자식 피해 배율 · 수명.
   * 한 발이 최대 1+2+4=7발, 진화(3갈래·3세대)는 1+3+9+27=40발 — 탄 풀(320)을 혼자 채우지 않는 선
   */
  wormGen: 2, wormGenEvo: 3, wormSplit: 2, wormSplitEvo: 3, wormSpread: 0.55, wormChildDmg: 0.8, wormLife: 1.3,
  /** 🔭 원격 저격 — 관통 저격(E15)의 판정 폭 */
  snipeWidth: 14,
  /** 🧭 레이더 스윕 — 초당 회전 (한 바퀴 1초) */
  sweepSpin: Math.PI * 2,
  /** 🍪 트래킹 쿠키 — 한 슬롯이 동시에 깔 수 있는 쿠키 (보스 경고 원이 장판 풀을 못 쓰는 일이 없게) */
  trailMax: 12,
  /** 🔪 킬 스위치 — 처치 기준 체력 비율 (레벨당 +2%p) · 진화 기준 */
  execRatio: 0.15, execPerLv: 0.02, execRatioEvo: 0.3,
  /** 🗼 포탑 — 사격 간격 (레벨당 -6%) · 탄 수명 */
  turretFire: 0.45, turretBulletLife: 1,
  /** ⛈️ 전력 서지 — 진화(E21)가 거는 둔화 */
  zapSlow: 1.5,
  /** 💨 산탄 퍼짐 (라디안) — 진화하면 더 넓게 */
  shotgunSpread: 0.9, shotgunSpreadEvo: 1.4,
  /** 🪤 지뢰 — 밟는 판정 반경 · 슬롯당 동시 최대 · 작은 지뢰(E23) 수·피해·수명·크기 */
  mineR: 10, mineMax: 12, mineKids: 3, mineKidDmg: 0.5, mineKidLife: 3, mineKidSize: 0.6, mineKidSpread: 46,
  /** 💿 원반 — 갈아내는 간격 */
  discTick: 0.2,
  /** 🍴 포크 밤 — 레벨당 확률 */
  popPerLv: 0.03,
  /** 📴 EMP — 진화(E26)가 거는 둔화 */
  empSlow: 2,
  /** ⌨️ 채찍 — 판정 폭 */
  whipWidth: 26,
} as const;

/** 진화 슬롯의 킬 카운터 (A09) — 슬롯 하나당 하나라 월드에 두지 않고 여기 둔다 */
const killCounters = new WeakMap<SkillSlot, number>();
/** ⌨️ 커맨드 라인 — 다음에 휘두를 쪽 (1 앞 / -1 뒤) */
const whipSide = new WeakMap<SkillSlot, number>();

/** ⛈️·🔭 대상 고르기용 작업 버퍼 (런 중 할당 금지) */
const PICK = new Int16Array(CFG.perf.maxEnemies + 24);
const CHOSEN = new Int16Array(16);

export function resetSkillRuntime(slot: SkillSlot): void {
  killCounters.delete(slot);
  whipSide.delete(slot);
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

/** 반경 안의 적에게 즉시 피해 (+선택적 상태이상 — 지속은 🧪 익스플로잇만큼 늘어난다) */
function areaDamage(
  w: World, x: number, y: number, r: number, dmg: number, tags: number,
  status?: { slow?: number; burn?: number; stun?: number; mark?: number; dps?: number },
  knock = 0,
): number {
  let hit = 0;
  const e = w.enemies;
  const sd = w.stats.statusDur;
  forEachEnemyNear(w, x, y, r + 30, (i) => {
    if (!e.alive[i]) return;
    const d = Math.hypot(e.x[i] - x, e.y[i] - y);
    if (d > r + e.r[i]) return;
    hit++;
    if (status) {
      if (status.slow) e.slowT[i] = Math.max(e.slowT[i], status.slow * sd);
      if (status.stun) e.stunT[i] = Math.max(e.stunT[i], status.stun * sd);
      if (status.mark) e.markT[i] = Math.max(e.markT[i], status.mark * sd);
      if (status.burn) {
        e.burnT[i] = Math.max(e.burnT[i], status.burn * sd);
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

/** 이 슬롯이 소유한 살아 있는 내 탄 수 (포탑·지뢰 상한) */
function countOwned(w: World, idx: number, look: number): number {
  const b = w.bullets;
  let n = 0;
  for (let i = 0; i < b.cap; i++) if (b.alive[i] && !b.hostile[i] && b.look[i] === look && b.owner[i] === idx) n++;
  return n;
}

/**
 * 🔭 저격 대상 — 보스가 있으면 보스, 없으면 체력이 가장 많은 적.
 * 이미 고른 대상(CHOSEN 의 앞 `skip` 개)은 건너뛴다.
 */
function snipeTarget(w: World, range: number, skip: number): number {
  const e = w.enemies;
  const p = w.player;
  const r2 = range * range;
  const taken = (i: number) => {
    for (let k = 0; k < skip; k++) if (CHOSEN[k] === i) return true;
    return false;
  };
  const bi = w.boss.idx;
  if (w.boss.active && bi >= 0 && e.alive[bi] && e.hideT[bi] <= 0 && !taken(bi)) {
    if ((e.x[bi] - p.x) ** 2 + (e.y[bi] - p.y) ** 2 <= r2) return bi;
  }
  let best = -1;
  let bestHp = 0;
  for (let i = 0; i < e.cap; i++) {
    if (!e.alive[i] || e.hideT[i] > 0 || taken(i)) continue;
    if ((e.x[i] - p.x) ** 2 + (e.y[i] - p.y) ** 2 > r2) continue;
    if (e.hp[i] > bestHp) { bestHp = e.hp[i]; best = i; }
  }
  return best;
}

/* ── 발동 ───────────────────────────────────────────────────── */

/** 발동음 — 쏘기·번개·베기 세 가지. 장판·설치·소환처럼 계속 도는 스킬은 조용히 둔다 */
const FIRE_CUE: Partial<Record<Archetype, number>> = {
  homing: CUE.shot, spray: CUE.shot, boomerang: CUE.shot, split: CUE.shot, snipe: CUE.shot,
  shotgun: CUE.shot, disc: CUE.shot, cross: CUE.shot,
  beam: CUE.zap, line: CUE.zap, chain: CUE.zap, zap: CUE.zap, emp: CUE.zap, sweep: CUE.zap,
  melee: CUE.slash, cone: CUE.slash, whip: CUE.slash, execute: CUE.slash, wave: CUE.slash,
};

function fire(w: World, slot: SkillSlot, idx: number): void {
  const sk = ACTIVES[slot.id];
  const evolved = slot.evo !== null;
  const dmg = skillDamage(sk.dmg, slot.lv, w.stats);
  const n = skillCount(sk, slot.lv, w.stats, evolved);
  const tags = tagMask(sk.tags);
  const dir = aimDir(w);
  const p = w.player;
  const st = w.stats;
  const speed = sk.speed * st.projSpeed;
  const life = 1.2 * st.duration * (evolved && sk.evo === "E01" ? 2 : 1);
  const aim = Math.atan2(dir.y, dir.x);
  const e = w.enemies;
  w.cues |= FIRE_CUE[sk.arch] ?? 0;

  switch (sk.arch) {
    case "homing": {
      for (let k = 0; k < n; k++) {
        const a = evolved
          ? (Math.PI * 2 * k) / n
          : aim + (k - (n - 1) / 2) * 0.16;
        spawnBullet(w, p.x, p.y, Math.cos(a) * speed, Math.sin(a) * speed, dmg, life, 6, 0, tags, { owner: idx, pierce: st.pierce });
      }
      break;
    }
    case "spray": {
      for (let k = 0; k < n; k++) {
        const a = w.rand() * Math.PI * 2;
        spawnBullet(w, p.x, p.y, Math.cos(a) * speed, Math.sin(a) * speed, dmg, life, 5, LOOK.spray, tags, { owner: idx, pierce: st.pierce });
      }
      break;
    }
    case "beam": {
      const pierce = evolved ? 999 : sk.pierce + slot.lv + st.pierce;
      spawnBullet(w, p.x, p.y, dir.x * speed, dir.y * speed, dmg, 0.9, 7, LOOK.beam, tags, {
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
        const a = aim + (k - (n - 1) / 2) * 0.35;
        spawnBullet(w, p.x, p.y, Math.cos(a) * speed, Math.sin(a) * speed, dmg, 1.6, 8, 5, tags, {
          owner: idx, pierce: 99, aux: 0.8,
        });
      }
      break;
    }
    case "aura": {
      areaDamage(w, p.x, p.y, auraRadius(sk, slot.lv, evolved, st), dmg, tags, undefined, evolved ? 14 : 0);
      break;
    }
    case "melee": {
      const r = areaOf(sk.radius + slot.lv * 10, st);
      if (evolved) {
        // ⚡ 커널 러시 — 가장 가까운 적까지 돌진하며 무적
        const i = nearestEnemy(w, p.x, p.y, 420);
        if (i >= 0) {
          p.x = e.x[i] - dir.x * 30;
          p.y = e.y[i] - dir.y * 30;
          p.invuln = Math.max(p.invuln, 0.35);
        }
      }
      areaDamage(w, p.x, p.y, r, dmg, tags, { mark: evolved ? 2 : 0 }, 10);
      burst(w, p.x, p.y, 6, PC.mine, 140);
      spawnFx(w, FX.slash, p.x, p.y, 0.28, r, { ang: aim });
      break;
    }
    case "wave": {
      const r = areaOf(sk.radius + slot.lv * 18, st);
      areaDamage(w, p.x, p.y, r, dmg, tags, undefined, 34);
      spawnFx(w, FX.ring, p.x, p.y, 0.4, r, { color: PC.mine });
      for (let k = 0; k < 12; k++) {
        const a = (Math.PI * 2 * k) / 12;
        spawnParticle(w, p.x + Math.cos(a) * 30, p.y + Math.sin(a) * 30, Math.cos(a) * 260, Math.sin(a) * 260, 0.32, 3, PC.mineAlt);
      }
      break;
    }
    case "cone": {
      const r = areaOf(sk.radius + slot.lv * 12, st);
      // ❄️ 서리 부채꼴 — 얼음은 밝고 반투명한 서리색 (경험치 금색·내 공격 파랑과 다르다)
      spawnFx(w, FX.cone, p.x, p.y, 0.32, r, { ang: aim, color: PC.ice });
      for (let k = 0; k < 5; k++) {
        const a = aim + (w.rand() - 0.5) * 1.0;
        const s = 120 + w.rand() * 160;
        spawnParticle(w, p.x, p.y, Math.cos(a) * s, Math.sin(a) * s, 0.35, 2.5, PC.ice);
      }
      forEachEnemyNear(w, p.x + dir.x * r * 0.5, p.y + dir.y * r * 0.5, r, (i) => {
        if (!e.alive[i]) return;
        const dx = e.x[i] - p.x;
        const dy = e.y[i] - p.y;
        const d = Math.hypot(dx, dy);
        if (d > r) return;
        if ((dx / d) * dir.x + (dy / d) * dir.y < 0.5) return; // 전방 60°
        e.slowT[i] = Math.max(e.slowT[i], 2 * st.statusDur);
        damageEnemy(w, i, dmg, tags);
      });
      break;
    }
    case "chain": {
      const maxJump = evolved ? 99 : sk.count + slot.lv;
      let from = nearestEnemy(w, p.x, p.y, 420);
      const seen = new Set<number>();
      let power = dmg;
      let lx = p.x;
      let ly = p.y;
      for (let j = 0; j < maxJump && from >= 0; j++) {
        seen.add(from);
        const slowed = e.slowT[from] > 0;
        damageEnemy(w, from, power * (evolved && slowed ? 3 : 1), tags);
        const fx = e.x[from];
        const fy = e.y[from];
        spawnFx(w, FX.chain, lx, ly, 0.18, 0, { x2: fx, y2: fy, color: PC.mine });
        lx = fx;
        ly = fy;
        for (let k = 0; k < 4; k++) spawnParticle(w, fx, fy, (w.rand() - 0.5) * 120, (w.rand() - 0.5) * 120, 0.2, 2, PC.mine);
        let next = -1;
        let bd = sk.radius * sk.radius;
        forEachEnemyNear(w, fx, fy, sk.radius, (i) => {
          if (seen.has(i) || !e.alive[i]) return;
          const d = (e.x[i] - fx) ** 2 + (e.y[i] - fy) ** 2;
          if (d < bd) { bd = d; next = i; }
        });
        from = next;
        power *= 0.9;
      }
      break;
    }
    case "trap": {
      spawnHazard(w, p.x, p.y, areaOf(sk.radius * 0.5, st), sk.duration * st.duration, 0, HZ.honey, { owner: idx, tags });
      break;
    }
    case "pull": {
      const dur = sk.duration * st.duration * (evolved ? 2 : 1);
      spawnHazard(w, p.x + dir.x * 120, p.y + dir.y * 120, areaOf(sk.radius + slot.lv * 8, st), dur, dmg, HZ.pull, { owner: idx, tags });
      break;
    }
    case "stun": {
      spawnHazard(w, p.x + dir.x * 90, p.y + dir.y * 90, areaOf(sk.radius, st), sk.duration * st.duration, 0, HZ.stun, { owner: idx, tags });
      break;
    }
    case "burn": {
      spawnHazard(w, p.x + dir.x * 90, p.y + dir.y * 90, areaOf(sk.radius, st), sk.duration * st.duration, dmg, HZ.burn, { owner: idx, tags });
      break;
    }
    case "bomb": {
      spawnBullet(w, p.x, p.y, dir.x * sk.speed, dir.y * sk.speed, dmg, sk.duration, 10, LOOK.bomb, tags, {
        owner: idx, aux: areaOf(sk.radius, st),
      });
      break;
    }
    case "strike": {
      const r = areaOf(sk.radius, st);
      for (let k = 0; k < n; k++) {
        const a = w.rand() * Math.PI * 2;
        const d = 60 + w.rand() * 220;
        const x = p.x + Math.cos(a) * d;
        const y = p.y + Math.sin(a) * d;
        areaDamage(w, x, y, r, dmg, tags);
        burst(w, x, y, 8, PC.mine, 180);
        spawnFx(w, FX.strike, x, y, 0.35, r, { color: PC.mine });
      }
      break;
    }
    case "heal": {
      const amount = (14 + slot.lv * 4) * (evolved ? 2 : 1);
      const r = areaOf(sk.radius, st);
      healPlayer(w, amount);
      spawnFx(w, FX.heal, p.x, p.y, 0.55, r, { color: PC.hp });
      if (evolved) p.invuln = Math.max(p.invuln, 0.6);
      areaDamage(w, p.x, p.y, r, dmg, tags);
      pushLog(w, "INFO", msg("vaccine", { hp: Math.round(amount) }));
      break;
    }

    /* ── 추가 15종 ── */

    case "barrier": {
      // 🔐 암호화 실드 — 주변 적 탄을 지운다. 🔏 진화하면 지운 탄을 내 탄으로 바꿔 되쏜다
      const r = areaOf(sk.radius, st) * (evolved ? 1.5 : 1);
      const b = w.bullets;
      let reflected = 0;
      for (let i = 0; i < b.cap; i++) {
        if (!b.alive[i] || !b.hostile[i]) continue;
        if (Math.hypot(b.x[i] - p.x, b.y[i] - p.y) > r + b.r[i]) continue;
        spawnParticle(w, b.x[i], b.y[i], 0, 0, 0.25, 4, PC.mine);
        if (evolved && reflected < SK.reflectMax) {
          const t = nearestEnemy(w, b.x[i], b.y[i], 600);
          const a = t >= 0
            ? Math.atan2(e.y[t] - b.y[i], e.x[t] - b.x[i])
            : Math.atan2(b.y[i] - p.y, b.x[i] - p.x);
          b.hostile[i] = 0;
          b.look[i] = LOOK.spray;
          b.owner[i] = idx;
          b.dmg[i] = dmg;
          b.tags[i] = tags;
          b.pierce[i] = st.pierce;
          b.status[i] = 0;
          b.aux[i] = 0;
          b.r[i] = 5;
          b.life[i] = 1.2;
          b.vx[i] = Math.cos(a) * SK.reflectSpeed;
          b.vy[i] = Math.sin(a) * SK.reflectSpeed;
          reflected++;
        } else {
          b.alive[i] = 0;
        }
      }
      areaDamage(w, p.x, p.y, r, dmg, tags, undefined, SK.barrierKnock);
      spawnFx(w, FX.ring, p.x, p.y, 0.35, r, { color: PC.mine });
      break;
    }
    case "split": {
      // 🐛 웜 — aux 에 남은 복제 세대를 담아 쏜다 (복제는 updateBullets 의 명중 처리)
      const gen = evolved ? SK.wormGenEvo : SK.wormGen;
      for (let k = 0; k < n; k++) {
        const a = aim + (k - (n - 1) / 2) * 0.2;
        spawnBullet(w, p.x, p.y, Math.cos(a) * speed, Math.sin(a) * speed, dmg, SK.wormLife * st.duration, 6, LOOK.worm, tags, {
          owner: idx, aux: gen,
        });
      }
      break;
    }
    case "snipe": {
      // 🔭 원격 저격 — 보스 우선, 없으면 체력이 가장 많은 적
      for (let k = 0; k < n && k < CHOSEN.length; k++) {
        const t = snipeTarget(w, sk.radius, k);
        if (t < 0) break;
        CHOSEN[k] = t;
        const tx = e.x[t];
        const ty = e.y[t];
        if (evolved) {
          // 🧿 제로데이 — 대상을 지나 일직선으로 꿰뚫는다. 표식 + 관통 = 치명타 확정
          const a = Math.atan2(ty - p.y, tx - p.x);
          const len = sk.radius;
          const cx = p.x + Math.cos(a) * len * 0.5;
          const cy = p.y + Math.sin(a) * len * 0.5;
          forEachEnemyNear(w, cx, cy, len * 0.5 + SK.snipeWidth + 30, (j) => {
            if (!e.alive[j]) return;
            const lim = e.r[j] + SK.snipeWidth;
            if (segDist2(e.x[j], e.y[j], p.x, p.y, a, len) > lim * lim) return;
            e.markT[j] = Math.max(e.markT[j], 2 * st.statusDur);
            damageEnemy(w, j, dmg, tags | TAG.pierce);
          });
          spawnFx(w, FX.beam, p.x, p.y, 0.3, 5, { x2: p.x + Math.cos(a) * len, y2: p.y + Math.sin(a) * len, color: PC.mine });
        } else {
          damageEnemy(w, t, dmg, tags);
          spawnFx(w, FX.beam, p.x, p.y, 0.22, 2.5, { x2: tx, y2: ty, color: PC.mine });
        }
        burst(w, tx, ty, 8, PC.mine, 200);
      }
      break;
    }
    case "sweep": {
      // 🧭 레이더 스윕 — 플레이어에 붙어 도는 레이저. 회전·판정은 updateBullets
      const len = areaOf(sk.radius, st) * (evolved ? 1.5 : 1);
      for (let k = 0; k < n; k++) {
        spawnBullet(w, p.x, p.y, 0, 0, dmg, sk.duration * st.duration, len, LOOK.sweep, tags, {
          owner: idx, aux: aim + (Math.PI * 2 * k) / n,
        });
      }
      break;
    }
    case "trail": {
      // 🍪 트래킹 쿠키 — 발밑에 작은 장판 (슬롯당 상한)
      let have = 0;
      const h = w.hazards;
      for (let i = 0; i < h.cap; i++) if (h.alive[i] && h.kind[i] === HZ.field && h.owner[i] === idx) have++;
      if (have >= SK.trailMax) break;
      const dur = sk.duration * st.duration * (evolved ? 2 : 1);
      spawnHazard(w, p.x, p.y, areaOf(sk.radius, st), dur, dmg, HZ.field, { owner: idx, tags });
      break;
    }
    case "execute": {
      // 🔪 킬 스위치 — 사거리 안에서 체력이 기준 아래인 잡몹을 즉시 처치. 없으면 가장 가까운 적에게 일격
      const ratio = evolved ? SK.execRatioEvo : SK.execRatio + SK.execPerLv * (slot.lv - 1);
      const r2 = sk.radius * sk.radius;
      let done = 0;
      for (let i = 0; i < e.cap && done < n; i++) {
        if (!e.alive[i] || e.rank[i] !== 0 || e.hideT[i] > 0) continue;
        if (e.hp[i] > e.maxHp[i] * ratio) continue;
        if ((e.x[i] - p.x) ** 2 + (e.y[i] - p.y) ** 2 > r2) continue;
        spawnFx(w, FX.beam, p.x, p.y, 0.2, 2, { x2: e.x[i], y2: e.y[i], color: PC.mineAlt });
        burst(w, e.x[i], e.y[i], 8, PC.mineAlt, 180);
        killEnemy(w, i);
        if (evolved) healPlayer(w, 1);
        done++;
      }
      if (done === 0) {
        const t = nearestEnemy(w, p.x, p.y, sk.radius);
        if (t >= 0) {
          spawnFx(w, FX.beam, p.x, p.y, 0.2, 2, { x2: e.x[t], y2: e.y[t], color: PC.mineAlt });
          damageEnemy(w, t, dmg, tags);
        }
      }
      break;
    }
    case "cross": {
      // ✳️ 크래시 덤프 — 4방향(🟦 진화 8방향)으로 폭발이 칸칸이 뻗는다
      const dirs = evolved ? 8 : 4;
      const steps = sk.count + Math.floor((slot.lv - 1) / 2);
      const gap = areaOf(sk.speed, st);
      const r = areaOf(sk.radius, st);
      const burn = evolved ? { burn: 2, dps: dmg * 0.3 } : undefined;
      for (let d = 0; d < dirs; d++) {
        const a = (Math.PI * 2 * d) / dirs;
        for (let s = 1; s <= steps; s++) {
          const x = p.x + Math.cos(a) * gap * s;
          const y = p.y + Math.sin(a) * gap * s;
          areaDamage(w, x, y, r, dmg, tags, burn);
          spawnFx(w, FX.ring, x, y, 0.22 + s * 0.05, r, { color: PC.mineAlt });
        }
      }
      w.shake = Math.max(w.shake, 0.08);
      w.shakePx = Math.max(w.shakePx, 3);
      break;
    }
    case "turret": {
      // 🗼 방화벽 포탑 — 제자리에 세운다. 사격은 updateTurrets. 상한이면 가장 오래된 것을 거둔다
      const b = w.bullets;
      if (countOwned(w, idx, LOOK.turret) >= n) {
        let old = -1;
        for (let i = 0; i < b.cap; i++) {
          if (!b.alive[i] || b.look[i] !== LOOK.turret || b.owner[i] !== idx) continue;
          if (old < 0 || b.life[i] < b.life[old]) old = i;
        }
        if (old >= 0) b.alive[old] = 0;
      }
      const dur = sk.duration * st.duration * (evolved ? 2 : 1);
      spawnBullet(w, p.x, p.y, 0, 0, dmg, dur, 12, LOOK.turret, tags, { owner: idx, aux: 0 });
      spawnFx(w, FX.ring, p.x, p.y, 0.3, 30, { color: PC.mine });
      break;
    }
    case "zap": {
      // ⛈️ 전력 서지 — 사거리 안의 적 중 무작위 n 마리에게 낙뢰
      let m = 0;
      const r2 = sk.radius * sk.radius;
      for (let i = 0; i < e.cap && m < PICK.length; i++) {
        if (!e.alive[i] || e.hideT[i] > 0) continue;
        if ((e.x[i] - p.x) ** 2 + (e.y[i] - p.y) ** 2 <= r2) PICK[m++] = i;
      }
      for (let k = 0; k < n && m > 0; k++) {
        const at = Math.floor(w.rand() * m);
        const j = PICK[at];
        PICK[at] = PICK[--m];
        const x = e.x[j];
        const y = e.y[j];
        damageEnemy(w, j, dmg, tags);
        // 🔌 블랙아웃 — 맞은 적을 둔화 (다음 전기 피해 ×2)
        if (evolved && e.alive[j]) e.slowT[j] = Math.max(e.slowT[j], SK.zapSlow * st.statusDur);
        spawnFx(w, FX.chain, x + (w.rand() - 0.5) * 30, y - 190, 0.2, 0, { x2: x, y2: y, color: PC.mine });
        burst(w, x, y, 6, PC.mine, 160);
      }
      break;
    }
    case "shotgun": {
      // 💨 버스트 전송 — 조준 방향 부채꼴로 산탄. 🌊 진화하면 전부 관통
      const spread = evolved ? SK.shotgunSpreadEvo : SK.shotgunSpread;
      for (let k = 0; k < n; k++) {
        const a = aim + (n === 1 ? 0 : (k / (n - 1) - 0.5) * spread) + (w.rand() - 0.5) * 0.08;
        const s = speed * (0.9 + w.rand() * 0.2);
        spawnBullet(w, p.x, p.y, Math.cos(a) * s, Math.sin(a) * s, dmg, sk.duration * st.projSpeed, 4, LOOK.spray, tags, {
          owner: idx, pierce: evolved ? 99 : st.pierce,
        });
      }
      break;
    }
    case "mine": {
      // 🪤 트립와이어 — 발밑 근처에 지뢰. pierce 칸에 "작은 지뢰로 갈라질 수 있는가"를 담는다 (E23)
      let have = countOwned(w, idx, LOOK.mine);
      for (let k = 0; k < n && have < SK.mineMax; k++, have++) {
        const a = w.rand() * Math.PI * 2;
        const d = w.rand() * 40;
        spawnBullet(w, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 0, 0, dmg, sk.duration * st.duration, SK.mineR, LOOK.mine, tags, {
          owner: idx, aux: areaOf(sk.radius, st), pierce: evolved ? 1 : 0,
        });
      }
      break;
    }
    case "disc": {
      // 💿 디스크 조각 모음 — 느린 원반이 나아가며 닿는 적을 계속 간다 (틱은 updateBullets)
      const r = areaOf(sk.radius, st) * (evolved ? 1.5 : 1);
      for (let k = 0; k < n; k++) {
        const a = aim + (n === 1 ? 0 : (Math.PI * 2 * k) / n);
        spawnBullet(w, p.x, p.y, Math.cos(a) * speed, Math.sin(a) * speed, dmg, sk.duration * st.duration, r, LOOK.disc, tags, {
          owner: idx, aux: 0,
        });
      }
      break;
    }
    case "emp": {
      // 📴 EMP — 주변을 감전(전기 피해) + 잡몹 기절. 💤 진화하면 둔화까지
      const r = areaOf(sk.radius, st) * (evolved ? 1.5 : 1);
      const stun = sk.duration * st.statusDur * (evolved ? 2 : 1);
      forEachEnemyNear(w, p.x, p.y, r + 30, (i) => {
        if (!e.alive[i] || Math.hypot(e.x[i] - p.x, e.y[i] - p.y) > r + e.r[i]) return;
        if (e.rank[i] === 0) {
          e.stunT[i] = Math.max(e.stunT[i], stun);
          if (evolved) e.slowT[i] = Math.max(e.slowT[i], SK.empSlow * st.statusDur);
        }
        damageEnemy(w, i, dmg, tags);
      });
      spawnFx(w, FX.ring, p.x, p.y, 0.45, r, { color: PC.mine });
      spawnFx(w, FX.ring, p.x, p.y, 0.3, r * 0.6, { color: PC.ice });
      break;
    }
    case "whip": {
      // ⌨️ 커맨드 라인 — 조준 방향과 반대 방향을 번갈아 긴 선으로 벤다. 🧙 진화하면 앞뒤 동시 + 표식
      const len = areaOf(sk.radius, st) * (evolved ? 1.5 : 1);
      const side = whipSide.get(slot) ?? 1;
      whipSide.set(slot, -side);
      const lashes = evolved ? 2 : 1;
      const half = SK.whipWidth / 2;
      for (let s = 0; s < lashes; s++) {
        const a = aim + (evolved ? s * Math.PI : side > 0 ? 0 : Math.PI);
        forEachEnemyNear(w, p.x + Math.cos(a) * len * 0.5, p.y + Math.sin(a) * len * 0.5, len * 0.5 + half + 30, (j) => {
          if (!e.alive[j]) return;
          const lim = e.r[j] + half;
          if (segDist2(e.x[j], e.y[j], p.x, p.y, a, len) > lim * lim) return;
          if (evolved) e.markT[j] = Math.max(e.markT[j], 2 * st.statusDur);
          damageEnemy(w, j, dmg, tags);
        });
        spawnFx(w, FX.beam, p.x, p.y, 0.22, SK.whipWidth * 0.5, {
          x2: p.x + Math.cos(a) * len, y2: p.y + Math.sin(a) * len, color: PC.mineAlt,
        });
      }
      break;
    }
    case "onkill":
    case "orbit":
    case "drone":
    case "pop":
      break; // 아래 지속 처리에서 다룬다
  }
}

/* ── 지속형(위성·드론·오라·포탑·포크 밤) ────────────────────── */

function updateOrbit(w: World, slot: SkillSlot, idx: number, dt: number): void {
  const sk = ACTIVES[slot.id];
  const evolved = slot.evo !== null;
  const want = skillCount(sk, slot.lv, w.stats, evolved);
  const b = w.bullets;

  let have = 0;
  for (let i = 0; i < b.cap; i++) if (b.alive[i] && b.look[i] === LOOK.orbit && b.owner[i] === idx) have++;

  if (have !== want) {
    for (let i = 0; i < b.cap; i++) if (b.alive[i] && b.look[i] === LOOK.orbit && b.owner[i] === idx) b.alive[i] = 0;
    for (let k = 0; k < want; k++) {
      spawnBullet(w, w.player.x, w.player.y, 0, 0, 0, 0, 9, LOOK.orbit, tagMask(sk.tags), { owner: idx, aux: k });
    }
  }

  const r = sk.radius + slot.lv * 6;
  const dmg = skillDamage(sk.dmg, slot.lv, w.stats);
  for (let i = 0; i < b.cap; i++) {
    if (!b.alive[i] || b.look[i] !== LOOK.orbit || b.owner[i] !== idx) continue;
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
    spawnBullet(w, dx0, dy0, dx * sk.speed, dy * sk.speed, dmg, 1.1, 5, 0, tagMask(sk.tags), { owner: idx, pierce: w.stats.pierce });
    if (evolved) w.enemies.markT[target] = Math.max(w.enemies.markT[target], 2 * w.stats.statusDur);
  }
}

/** 🗼 포탑 — 수명을 깎고, 간격마다 가장 가까운 적을 쏜다 */
function updateTurrets(w: World, slot: SkillSlot, idx: number, dt: number): void {
  const sk = ACTIVES[slot.id];
  const b = w.bullets;
  const e = w.enemies;
  const every = Math.max(0.12, SK.turretFire * (1 - 0.06 * (slot.lv - 1)) * w.stats.cooldown);
  const speed = sk.speed * w.stats.projSpeed;
  for (let i = 0; i < b.cap; i++) {
    if (!b.alive[i] || b.look[i] !== LOOK.turret || b.owner[i] !== idx) continue;
    b.life[i] -= dt;
    if (b.life[i] <= 0) { b.alive[i] = 0; continue; }
    b.aux[i] -= dt;
    if (b.aux[i] > 0) continue;
    const t = nearestEnemy(w, b.x[i], b.y[i], sk.radius);
    if (t < 0) continue;
    b.aux[i] = every;
    const dx = e.x[t] - b.x[i];
    const dy = e.y[t] - b.y[i];
    const len = Math.hypot(dx, dy) || 1;
    // 포탑의 조준 방향을 vx/vy 에 남겨 둔다 (그림이 포신을 돌린다 — 포탑은 움직이지 않는다)
    b.vx[i] = dx / len;
    b.vy[i] = dy / len;
    spawnBullet(w, b.x[i], b.y[i], (dx / len) * speed, (dy / len) * speed, b.dmg[i], SK.turretBulletLife, 5, 2, b.tags[i], {
      owner: idx, pierce: w.stats.pierce,
    });
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
  pushLog(w, "INFO", msg("logBomb", { dmg: Math.round(dmg) }));
}

/**
 * 🍴 포크 밤 — killEnemy 가 쌓아 둔 자리를 터뜨린다.
 * 터지며 죽은 적이 또 쌓이면 **다음 프레임**에 터진다 (연쇄가 한 프레임에 끝없이 이어지지 않게).
 */
function updatePops(w: World, slot: SkillSlot): void {
  const sk = ACTIVES[slot.id];
  const evolved = slot.evo !== null;
  const q = w.pops;
  q.chance = Math.min(0.95, (sk.count / 100 + SK.popPerLv * (slot.lv - 1)) * (evolved ? 2 : 1));
  const count = q.n;
  if (count === 0) return;
  const dmg = skillDamage(sk.dmg, slot.lv, w.stats);
  const r = areaOf(sk.radius, w.stats) * (evolved ? 1.5 : 1);
  const tags = tagMask(sk.tags);
  for (let k = 0; k < count; k++) {
    areaDamage(w, q.x[k], q.y[k], r, dmg, tags);
    burst(w, q.x[k], q.y[k], 8, PC.mineAlt, 200);
    spawnFx(w, FX.ring, q.x[k], q.y[k], 0.3, r, { color: PC.mineAlt });
  }
  // 이번에 터지며 새로 쌓인 것만 앞으로 당긴다
  q.x.copyWithin(0, count, q.n);
  q.y.copyWithin(0, count, q.n);
  q.n -= count;
}

/* ── 프레임 갱신 ────────────────────────────────────────────── */

export function updateSkills(w: World, dt: number): void {
  // 포크 밤을 가진 슬롯이 없으면 확률은 0 — 매 프레임 슬롯이 다시 채운다
  w.pops.chance = 0;

  for (let idx = 0; idx < w.actives.length; idx++) {
    const slot = w.actives[idx];
    const sk = ACTIVES[slot.id];

    if (sk.arch === "orbit") { updateOrbit(w, slot, idx, dt); continue; }
    if (sk.arch === "onkill") { updateOnKill(w, slot); continue; }
    if (sk.arch === "pop") { updatePops(w, slot); continue; }
    if (sk.arch === "turret") updateTurrets(w, slot, idx, dt);

    slot.cd -= dt;
    if (slot.cd > 0) continue;

    if (sk.arch === "drone") {
      updateDrone(w, slot, idx);
      // 🧵 멀티스레드
      if (w.stats.doubleCast > 0 && w.rand() < w.stats.doubleCast) updateDrone(w, slot, idx);
    } else {
      fire(w, slot, idx);
      // ⚖️ 로드밸런서 — 첫 액티브가 한 번 더 때린다
      if (idx === 0 && w.stats.extraStrike > 0) fire(w, slot, idx);
      // 🧵 멀티스레드 — 확률로 한 번 더
      if (w.stats.doubleCast > 0 && w.rand() < w.stats.doubleCast) fire(w, slot, idx);
    }

    // 🔁 리트라이
    slot.cd = w.rand() < w.stats.resetChance ? 0 : skillCooldown(sk.cd || 1, slot.lv, w.stats);
  }
  // 포크 밤을 잃은 적은 없지만(슬롯은 줄지 않는다), 확률이 0 이면 쌓인 것도 버린다
  if (w.pops.chance === 0) w.pops.n = 0;
}

/** 🧭 이번 프레임에 레이저가 쓸고 지나간 부채꼴(prev → next) 안에 중심이 든 적을 맞힌다 — 한 바퀴에 한 번씩 */
function sweepHit(w: World, i: number, prev: number, next: number): void {
  const b = w.bullets;
  const e = w.enemies;
  const len = b.r[i];
  const arc = next - prev;
  const TAU = Math.PI * 2;
  forEachEnemyNear(w, b.x[i], b.y[i], len + 30, (j) => {
    if (!e.alive[j]) return;
    const dx = e.x[j] - b.x[i];
    const dy = e.y[j] - b.y[i];
    if (Math.hypot(dx, dy) > len + e.r[j]) return;
    const d = (((Math.atan2(dy, dx) - prev) % TAU) + TAU) % TAU;
    if (d >= arc) return;
    damageEnemy(w, j, b.dmg[i], b.tags[i]);
  });
}

/** 🪤 지뢰 폭발 — 💥 + (E23) 작은 지뢰로 갈라진다 */
function explodeMine(w: World, i: number): void {
  const b = w.bullets;
  const x = b.x[i];
  const y = b.y[i];
  areaDamage(w, x, y, b.aux[i], b.dmg[i], b.tags[i]);
  burst(w, x, y, 10, PC.mineAlt, 220);
  spawnFx(w, FX.ring, x, y, 0.3, b.aux[i], { color: PC.mineAlt });
  const split = b.pierce[i] > 0;
  const dmg = b.dmg[i] * SK.mineKidDmg;
  const r = b.aux[i] * SK.mineKidSize;
  const owner = b.owner[i];
  const tags = b.tags[i];
  b.alive[i] = 0;
  if (!split) return;
  for (let k = 0; k < SK.mineKids; k++) {
    const a = (Math.PI * 2 * k) / SK.mineKids + w.rand();
    spawnBullet(w, x + Math.cos(a) * SK.mineKidSpread, y + Math.sin(a) * SK.mineKidSpread, 0, 0, dmg, SK.mineKidLife, SK.mineR * 0.8, LOOK.mine, tags, {
      owner, aux: r, pierce: 0,
    });
  }
}

/** 투사체 이동·충돌 (적 탄은 enemies.ts 가 따로 처리한다) */
export function updateBullets(w: World, dt: number): void {
  const b = w.bullets;
  const e = w.enemies;
  const sd = w.stats.statusDur;

  for (let i = 0; i < b.cap; i++) {
    if (!b.alive[i] || b.hostile[i]) continue;
    const look = b.look[i];
    // 위성·포탑은 슬롯 갱신(updateOrbit/updateTurrets)이 맡는다
    if (look === LOOK.orbit || look === LOOK.turret) continue;

    // 🧭 레이더 스윕 — 플레이어에 붙어 돈다
    if (look === LOOK.sweep) {
      b.life[i] -= dt;
      if (b.life[i] <= 0) { b.alive[i] = 0; continue; }
      const prev = b.aux[i];
      b.aux[i] = prev + SK.sweepSpin * dt;
      b.x[i] = w.player.x;
      b.y[i] = w.player.y;
      sweepHit(w, i, prev, b.aux[i]);
      continue;
    }

    // 🪤 지뢰 — 가만히 있다가 밟히면(또는 수명이 끝나면) 터진다
    if (look === LOOK.mine) {
      b.life[i] -= dt;
      if (b.life[i] <= 0) { explodeMine(w, i); continue; }
      let stepped = false;
      forEachEnemyNear(w, b.x[i], b.y[i], b.r[i] + 30, (j) => {
        if (stepped || !e.alive[j]) return;
        if (Math.hypot(e.x[j] - b.x[i], e.y[j] - b.y[i]) <= e.r[j] + b.r[i]) stepped = true;
      });
      if (stepped) explodeMine(w, i);
      continue;
    }

    // 🌀 부메랑은 감속 → 역주행
    if (look === 5) {
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

    // 💿 원반 — 간격마다 닿아 있는 적을 전부 간다 (매 프레임 때리면 너무 세다)
    if (look === LOOK.disc) {
      if (b.life[i] <= 0) { b.alive[i] = 0; continue; }
      b.aux[i] -= dt;
      if (b.aux[i] <= 0) {
        b.aux[i] = SK.discTick;
        areaDamage(w, b.x[i], b.y[i], b.r[i], b.dmg[i], b.tags[i]);
        const ob = hitObstacle(w, b.x[i], b.y[i], b.r[i]);
        if (ob >= 0) damageObstacle(w, ob, b.dmg[i]);
      }
      continue;
    }

    // 💣 커널 봄 — 수명이 끝나면 터진다
    if (b.life[i] <= 0) {
      if (look === LOOK.bomb) {
        areaDamage(w, b.x[i], b.y[i], b.aux[i], b.dmg[i], b.tags[i]);
        burst(w, b.x[i], b.y[i], 14, PC.mineAlt, 240);
        spawnFx(w, FX.ring, b.x[i], b.y[i], 0.35, b.aux[i], { color: PC.mineAlt });
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
      if (b.aux[i] > 0 && look === LOOK.beam) dmg *= 1 + 0.15 * b.aux[i];

      // 보스 방향 판정(약점·시계)은 탄이 날아온 쪽으로 본다
      w.hitX = b.x[i] - b.vx[i] * 0.05;
      w.hitY = b.y[i] - b.vy[i] * 0.05;
      w.hitOn = true;
      damageEnemy(w, j, dmg, b.tags[i]);
      w.hitOn = false;

      if (b.status[i] === 1) e.slowT[j] = Math.max(e.slowT[j], 2 * sd);
      if (b.status[i] === 2) { e.burnT[j] = Math.max(e.burnT[j], 2 * sd); e.burnDps[j] = Math.max(e.burnDps[j], dmg * 0.3); }
      if (b.status[i] === 3) e.markT[j] = Math.max(e.markT[j], 2.5 * sd);

      // 🐛 웜 — 맞힌 자리에서 갈라진다 (남은 세대가 있을 때)
      if (look === LOOK.worm && b.aux[i] > 0) splitWorm(w, i, e.r[j]);

      if (look === LOOK.beam) b.aux[i] += 1;
      if (b.pierce[i] > 0) b.pierce[i] -= 1;
      else { b.alive[i] = 0; done = true; }
    });
  }
}

/** 🐛 웜 복제 — 맞힌 적을 비켜난 자리에서 갈래를 낸다 (같은 적을 곧바로 다시 맞히지 않게) */
function splitWorm(w: World, i: number, hitR: number): void {
  const b = w.bullets;
  const owner = b.owner[i];
  const slot = owner >= 0 ? w.actives[owner] : undefined;
  const evolved = !!slot && slot.evo !== null;
  const kids = evolved ? SK.wormSplitEvo : SK.wormSplit;
  const base = Math.atan2(b.vy[i], b.vx[i]);
  const sp = Math.hypot(b.vx[i], b.vy[i]);
  const off = hitR + b.r[i] + 4;
  for (let k = 0; k < kids; k++) {
    const a = base + (k - (kids - 1) / 2) * SK.wormSpread * (kids > 2 ? 1 : 2);
    spawnBullet(
      w, b.x[i] + Math.cos(a) * off, b.y[i] + Math.sin(a) * off,
      Math.cos(a) * sp, Math.sin(a) * sp,
      b.dmg[i] * SK.wormChildDmg, SK.wormLife * 0.7, b.r[i] * 0.85, LOOK.worm, b.tags[i],
      { owner, aux: b.aux[i] - 1 },
    );
  }
}

/** 장판 (§7 하니팟·블랙홀·화염·샌드박스·쿠키) */
export function updateHazards(w: World, dt: number): void {
  const h = w.hazards;
  const e = w.enemies;

  for (let i = 0; i < h.cap; i++) {
    // 보스 장판(경고 원·색 장판·블랙홀)은 bosses/common.ts 가 맡는다
    if (!h.alive[i] || h.kind[i] >= HZ.warn) continue;
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
        const r = areaOf(sk.radius, w.stats);
        let x = h.x[i];
        let y = h.y[i];
        const chains = evolved ? 5 : 1;
        for (let c = 0; c < chains; c++) {
          areaDamage(w, x, y, r, dmg * (1 - c * 0.12), TAG.explosion | TAG.aoe);
          burst(w, x, y, 10, PC.mineAlt, 200);
          spawnFx(w, FX.ring, x, y, 0.3, r, { color: PC.mineAlt });
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
        // 🥠 슈퍼쿠키(E17) — 밟은 적 둔화
        const owner = h.owner[i];
        const slot = owner >= 0 ? w.actives[owner] : undefined;
        const slow = slot && slot.evo === "E17" ? { slow: 1 } : undefined;
        areaDamage(w, h.x[i], h.y[i], h.r[i], h.dps[i], h.tags[i], slow);
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
