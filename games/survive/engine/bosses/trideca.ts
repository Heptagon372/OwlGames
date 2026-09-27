// 🟥 12단계 십삼각형 — 술래잡기 (기획서 §11)
//
// 등장: 화면 흔들림 + 콜로세움 생성 + 다른 몬스터 전멸(경험치 없음). 스폰도 멈춘다.
//  · 콜로세움 밖 — 시간이 갈수록 커지는 지속 피해
//  · 돌진 3종 (15초) — 직선 / 가로+세로 / 가로+세로+대각 2
//  · 4방향 레이저 (5초) — 끝나면 🔴 즉사 · 🔵 감속 장판이 남는다
//  · 즉사 (체력 50% 이하, 3회) — 보스가 쪼개지면 콜로세움 **밖**으로 나가야 산다
//  · 근접 페널티 — 가까이 붙어 있을수록 이동속도가 준다
//  · 블랙홀 — 3초 경고 후 15초간 3초마다 끌어당긴다. 안전 장판 위에서는 버틴다
// 보스는 매우 빠르다 — 때릴수록 느려진다 (world.damageEnemy 의 triSlowF).

import { msg } from "@/games/core/i18n";
import { CFG, atkMult } from "../../config";
import { clearArea } from "../obstacles";
import {
  BEAM,
  banner,
  burst,
  CUE,
  drainPlayer,
  hurtPlayer,
  HZ,
  killPlayer,
  pushLog,
  removeEnemy,
  spawnBeam,
  spawnHazard,
  spawnParticle,
  type World,
} from "../world";
import { bossContact, bossReason } from "./common";

/** 돌진 묶음 — 1차 직선(조준) / 2차 가로+세로 / 3차 가로+세로+대각 2 */
const SERIES: number[][] = [
  [Number.NaN],
  [0, Math.PI / 2],
  [0, Math.PI / 2, Math.PI / 4, (Math.PI * 3) / 4],
];

/** 콜로세움을 세우고 전장을 비운다 */
export function initTrideca(w: World): void {
  const c = CFG.trideca;
  const b = w.boss;
  const e = w.enemies;
  b.triArenaX = w.player.x;
  b.triArenaY = w.player.y;
  b.triArenaR = c.arenaR;
  b.triOutsideT = 0;
  b.triNearT = 0;
  b.triSlowF = 1;
  b.triDashCd = c.dashFirst;
  b.triDashSeries = 0;
  b.triDashStep = 0;
  b.triDashWarn = 0;
  b.triDashRun = 0;
  b.triLaserT = c.laserCd;
  b.triTileT = -1;
  b.triHoleT = c.holeFirst;
  b.triDoomLeft = c.doomCount;
  b.triDoomT = 0;
  b.triDoomWarn = 0;
  b.step = 0;

  // 다른 몬스터는 전부 사라진다 — 경험치 없음 (§11)
  for (let j = 0; j < e.cap; j++) if (e.alive[j] && j !== b.idx) removeEnemy(w, j);
  clearArea(w, b.triArenaX, b.triArenaY, c.arenaR + 80);

  e.x[b.idx] = b.triArenaX;
  e.y[b.idx] = b.triArenaY - c.arenaR * 0.6;
  w.shake = Math.max(w.shake, 0.6);
  w.shakePx = CFG.feedback.bossShakePx;
}

function inArena(w: World, x: number, y: number, pad = 0): boolean {
  const b = w.boss;
  return Math.hypot(x - b.triArenaX, y - b.triArenaY) < b.triArenaR - pad;
}

/** 돌진 한 번 준비 — 선을 긋고, 보스를 선 시작점으로 순간이동시킨다 */
function prepDash(w: World): void {
  const c = CFG.trideca;
  const b = w.boss;
  const e = w.enemies;
  const i = b.idx;
  const dirs = SERIES[b.triDashSeries - 1];
  const want = dirs[b.triDashStep];
  const R = b.triArenaR;
  let sx: number;
  let sy: number;
  let ang: number;
  if (Number.isNaN(want)) {
    // 1차 — 제자리에서 플레이어를 향해
    ang = Math.atan2(w.player.y - e.y[i], w.player.x - e.x[i]);
    sx = e.x[i];
    sy = e.y[i];
  } else {
    // 2·3차 — 플레이어를 지나는 선의 한쪽 끝으로 순간이동
    ang = want + (w.rand() < 0.5 ? 0 : Math.PI);
    sx = w.player.x - Math.cos(ang) * R;
    sy = w.player.y - Math.sin(ang) * R;
    burst(w, e.x[i], e.y[i], 12, 3, 200);
    e.x[i] = sx;
    e.y[i] = sy;
    burst(w, sx, sy, 12, 3, 200);
  }
  b.triDashAng = ang;
  b.triDashWarn = c.dashWarn;
  spawnBeam(w, sx, sy, ang, R * 2.2, e.r[i] * 1.6, c.dashWarn, 0, 0, BEAM.telegraph);
}

function updateDash(w: World, dt: number): boolean {
  const c = CFG.trideca;
  const b = w.boss;
  const e = w.enemies;
  const i = b.idx;
  if (b.triDashSeries === 0) return false;

  if (b.triDashWarn > 0) {
    b.triDashWarn -= dt;
    if (b.triDashWarn <= 0) b.triDashRun = (b.triArenaR * 2.2) / c.dashSpeed;
    return true;
  }
  if (b.triDashRun > 0) {
    b.triDashRun -= dt;
    e.x[i] += Math.cos(b.triDashAng) * c.dashSpeed * dt;
    e.y[i] += Math.sin(b.triDashAng) * c.dashSpeed * dt;
    spawnParticle(w, e.x[i], e.y[i], 0, 0, 0.25, 6, 3);
    if (Math.hypot(e.x[i] - w.player.x, e.y[i] - w.player.y) < e.r[i] + CFG.player.radius) {
      hurtPlayer(w, c.dashDmg * atkMult(w.stage), true);
    }
    if (b.triDashRun <= 0) b.timer = c.dashGap;
    return true;
  }
  if (b.timer > 0) {
    b.timer -= dt;
    return true;
  }
  b.triDashStep++;
  if (b.triDashStep >= SERIES[b.triDashSeries - 1].length) {
    b.triDashSeries = 0;
    // 콜로세움 밖에서 끝났으면 안으로 돌아온다
    if (!inArena(w, e.x[i], e.y[i])) {
      e.x[i] = b.triArenaX;
      e.y[i] = b.triArenaY;
      burst(w, e.x[i], e.y[i], 12, 3, 200);
    }
    return false;
  }
  prepDash(w);
  return true;
}

export function updateTrideca(w: World, dt: number): void {
  const c = CFG.trideca;
  const b = w.boss;
  const e = w.enemies;
  const i = b.idx;
  const p = w.player;
  const atk = atkMult(w.stage);

  e.phase[i] += dt * (0.6 + (1 - b.triSlowF));
  b.triSlowF = Math.min(1, b.triSlowF + c.slowRecover * dt);

  // 콜로세움 밖 — 지속 피해 (나가 있을수록 커진다)
  if (!inArena(w, p.x, p.y)) {
    b.triOutsideT += dt;
    drainPlayer(w, (c.outsideDps + c.outsideRamp * b.triOutsideT) * dt);
  } else {
    b.triOutsideT = Math.max(0, b.triOutsideT - dt * 2);
  }

  // 근접 페널티 — 붙어 있던 시간만큼 느려진다 (game.ts 가 이동속도에 곱한다)
  if (Math.hypot(p.x - e.x[i], p.y - e.y[i]) < c.nearR) b.triNearT += dt;
  else b.triNearT = Math.max(0, b.triNearT - dt * c.nearRecover);

  // 즉사 — 보스가 쪼개지고, 콜로세움 안에 있으면 죽는다
  if (b.triDoomWarn > 0) {
    b.triDoomWarn -= dt;
    if (w.frame % 20 === 0) w.cues |= CUE.alarm;
    if (b.triDoomWarn <= 0) {
      burst(w, b.triArenaX, b.triArenaY, 40, 6, 420);
      w.flash = Math.max(w.flash, 0.4);
      w.shake = Math.max(w.shake, 0.6);
      w.shakePx = CFG.feedback.bossShakePx * 1.5;
      w.cues |= CUE.boom;
      if (inArena(w, p.x, p.y)) killPlayer(w, bossReason(w));
    }
    return;
  }
  b.triDoomT -= dt;
  if (b.triDoomLeft > 0 && b.triDoomT <= 0 && b.triDashSeries === 0 && e.hp[i] <= b.maxHp * c.doomAt) {
    b.triDoomLeft--;
    b.triDoomT = c.doomGap;
    b.triDoomWarn = c.doomWarn;
    banner(w, msg("doom"), msg("doomSub"), c.doomWarn);
    pushLog(w, "ALERT", msg("doom"));
    w.cues |= CUE.alarm;
    return;
  }

  const dashing = updateDash(w, dt);

  if (!dashing) {
    // 술래 — 빠르게 쫓아온다 (맞을수록 느려진다)
    const dx = p.x - e.x[i];
    const dy = p.y - e.y[i];
    const d = Math.hypot(dx, dy) || 1;
    const sp = c.speed * b.triSlowF * (e.slowT[i] > 0 ? 0.6 : 1) * (e.stunT[i] > 0 ? 0 : 1);
    e.x[i] += (dx / d) * sp * dt;
    e.y[i] += (dy / d) * sp * dt;
    // 콜로세움 밖으로는 쫓아 나가지 않는다
    const ax = e.x[i] - b.triArenaX;
    const ay = e.y[i] - b.triArenaY;
    const ad = Math.hypot(ax, ay);
    const lim = b.triArenaR - e.r[i];
    if (ad > lim) {
      e.x[i] = b.triArenaX + (ax / ad) * lim;
      e.y[i] = b.triArenaY + (ay / ad) * lim;
    }
    bossContact(w, e.dmg[i]);

    b.triDashCd -= dt;
    if (b.triDashCd <= 0) {
      b.triDashCd = c.dashCd;
      b.triDashSeries = (b.step % 3) + 1;
      b.triDashStep = 0;
      b.step++;
      pushLog(w, "ALERT", msg("triDash", { n: b.triDashSeries }));
      prepDash(w);
    }
  }

  // 4방향 레이저 — 위에서 떨어지듯 (렌더가 경고선을 좁혀 가며 그린다)
  b.triLaserT -= dt;
  if (b.triLaserT <= 0 && !dashing) {
    b.triLaserT = c.laserCd;
    b.triLaserX = e.x[i];
    b.triLaserY = e.y[i];
    b.triLaserRot = w.rand() < 0.5 ? 0 : Math.PI / 4;
    for (let k = 0; k < 4; k++) {
      const a = b.triLaserRot + (Math.PI / 2) * k;
      spawnBeam(w, b.triLaserX, b.triLaserY, a, b.triArenaR * 2.2, c.laserWidth, c.laserWarn, c.laserFire, c.laserDmg * atk, BEAM.damage);
    }
    b.triTileT = c.laserWarn + c.laserFire;
  }

  // 레이저가 지나간 자리에 색 장판
  if (b.triTileT >= 0) {
    b.triTileT -= dt;
    if (b.triTileT < 0) {
      for (let k = 0; k < 4; k++) {
        const a = b.triLaserRot + (Math.PI / 2) * k;
        for (let d = 70; d < b.triArenaR * 1.3; d += c.tileEvery) {
          const x = b.triLaserX + Math.cos(a) * d;
          const y = b.triLaserY + Math.sin(a) * d;
          if (!inArena(w, x, y, 10)) continue;
          const red = w.rand() < c.tileRedRate;
          spawnHazard(w, x, y, red ? c.tileRedR : c.tileBlueR, c.tileLife, 0, red ? HZ.red : HZ.blue);
        }
      }
    }
  }

  // 블랙홀 — 3초 경고 뒤 15초. 안전 장판을 같이 깐다
  b.triHoleT -= dt;
  if (b.triHoleT <= 0) {
    b.triHoleT = c.holeCd;
    const a = w.rand() * Math.PI * 2;
    const r = w.rand() * b.triArenaR * 0.45;
    const hx = b.triArenaX + Math.cos(a) * r;
    const hy = b.triArenaY + Math.sin(a) * r;
    spawnHazard(w, hx, hy, c.holeR, c.holeWarn + c.holeLife, c.holeCoreDps * atk, HZ.hole, { tick: c.holeWarn });
    for (let k = 0; k < c.safeCount; k++) {
      const sa = a + Math.PI + (k - 0.5) * 1.6;
      const sr = b.triArenaR * (0.45 + w.rand() * 0.35);
      spawnHazard(w, b.triArenaX + Math.cos(sa) * sr, b.triArenaY + Math.sin(sa) * sr, c.safeR, c.holeWarn + c.holeLife, 0, HZ.safe);
    }
    pushLog(w, "ALERT", msg("blackhole"));
  }
}

/** 🟥 근접 페널티 — 플레이어 이동속도 배율 */
export function nearPenalty(w: World): number {
  const b = w.boss;
  if (!b.active || b.kind !== "trideca") return 1;
  return Math.max(CFG.trideca.nearMin, 1 - b.triNearT * CFG.trideca.nearRate);
}
