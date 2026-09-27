// ⏱️ 15단계 십오각형 — 시간을 지배하는 자 (기획서 §12)
//
// 모든 규칙이 "시간"이다. 싸움이 길어질수록 최대 체력·공격력·이동속도·패턴 빈도가 오르고,
// 제한 시간(5분, 다시 올 때마다 +1분)이 끝나면 피할 수 없는 최후의 심판이 온다.
//  ① 시간 역행 (50%, 1회)   — 20초 전 체력으로 되돌아간다
//  ② 시간 추적탄              — 가까울수록 빨라지고, 시간이 지나면 터진다
//  ③ 시간 폭격                — 진행될수록 경고는 짧게, 빈도는 높게
//  ④ 시한폭탄 (1분마다)       — 못 부수면 현재 체력 절반
//  ⑤ 시간의 분신 (3분)        — 약하지만 아프고, 30초 뒤 자폭
//  ⑥ 시간의 분노              — 게이지만큼 잡몹이 세진다. 경험치를 먹으면 준다
//  ⑦ 시간의 시계 (25%)        — 12시/6시 방향에서만 맞는다
//  ⑧ 시간 정지                — 멈췄다가 풀리는 순간 대규모 공격
//  ⑨ 시간 역주행 (60·40·20%)  — 최근 몬스터·장애물·폭격을 되살린다 (플레이어 성장은 그대로)
//  ⑩ 최후의 심판              — 제한 시간이 끝나면 흑백 → 거대한 시계 → 즉사

import { msg } from "@/games/core/i18n";
import { CFG, atkMult, chronoLoop, hpMult } from "../../config";
import { ENEMY_KINDS } from "../../data/stages";
import { restoreObstacles } from "../obstacles";
import { LOOK, startDash } from "../enemies";
import {
  banner,
  burst,
  CUE,
  FX,
  PC,
  spawnFx,
  hurtPlayer,
  judgePlayer,
  kindOf,
  pushLog,
  removeEnemy,
  spawnBullet,
  spawnEnemy,
  TAG,
  type World,
} from "../world";
import { bossContact, clearBossEffects, moveBoss, warnCircle } from "./common";

const lerp = (a: readonly [number, number], g: number) => a[0] + (a[1] - a[0]) * g;

/** 시간 진행도 0~1 — 모든 강화가 이 값을 쓴다 */
export function chronoGrowth(w: World): number {
  const b = w.boss;
  return b.chLimit > 0 ? Math.max(0, Math.min(1, b.t / b.chLimit)) : 0;
}

/** 남은 제한 시간 (초) */
export function chronoTimeLeft(w: World): number {
  return Math.max(0, w.boss.chLimit - w.boss.t);
}

export function initChrono(w: World): void {
  const c = CFG.chrono;
  const b = w.boss;
  const e = w.enemies;
  const loop = Math.max(1, chronoLoop(w.stage));
  b.chLoop = loop;
  b.chLimit = c.limitSec + c.limitStepSec * (loop - 1);
  b.chBaseHp = c.hp * hpMult(w.stage) * (1 + c.loopHp * (loop - 1));
  b.maxHp = b.chBaseHp;
  e.hp[b.idx] = b.maxHp;
  e.maxHp[b.idx] = b.maxHp;
  b.chRage = 0;
  b.chRewound = false;
  b.chRewindT = 0;
  b.chHistN = 0;
  b.chHistT = 0;
  b.chHomingT = 3;
  b.chRainT = 6;
  b.chBombT = 20;
  b.chBombFuse = 0;
  b.chCloneT = c.cloneFirst;
  b.chClockT = 0;
  b.chClockOn = false;
  b.chStopT = c.stopFirst;
  b.chStopLeft = 0;
  b.chReverseIdx = 0;
  b.chTimeout = -1;
  b.chLastRainN = 0;
}

/** 지금 살아 있는 시한폭탄 중 가장 짧은 도화선 (없으면 0) */
export function bombFuse(w: World): number {
  const e = w.enemies;
  const bomb = ENEMY_KINDS.indexOf("bomb");
  let best = 0;
  for (let i = 0; i < e.cap; i++) {
    if (e.alive[i] && e.kind[i] === bomb && (best === 0 || e.life[i] < best)) best = e.life[i];
  }
  return best;
}

function rain(w: World, count: number, warn: number): void {
  const c = CFG.chrono;
  const b = w.boss;
  const dmg = c.rainDmg * atkMult(w.stage);
  b.chLastRainN = 0;
  for (let k = 0; k < count; k++) {
    const x = k === 0 ? w.player.x : w.player.x + (w.rand() - 0.5) * c.rainSpread * 2;
    const y = k === 0 ? w.player.y : w.player.y + (w.rand() - 0.5) * c.rainSpread * 2;
    warnCircle(w, x, y, c.rainR, warn + k * 0.03, dmg, false);
    if (b.chLastRainN < b.chLastRain.length / 2) {
      b.chLastRain[b.chLastRainN * 2] = x;
      b.chLastRain[b.chLastRainN * 2 + 1] = y;
      b.chLastRainN++;
    }
  }
}

/** ⑩ 최후의 심판 시작 — 모든 공격을 멈춘다 */
function startJudgement(w: World): void {
  const b = w.boss;
  b.chTimeout = 0;
  // 피할 수 없다 — 이 순간부터는 보스도 맞지 않는다
  b.shield = CFG.chrono.timeoutSec + 1;
  clearBossEffects(w);
  banner(w, msg("judgement"), msg("judgementSub"), CFG.chrono.timeoutSec);
  pushLog(w, "FATAL", msg("judgement"));
  w.cues |= CUE.alarm;
}

/** ⑧ 시간 정지가 풀리는 순간 */
function releaseStop(w: World): void {
  const c = CFG.chrono;
  const e = w.enemies;
  const p = w.player;
  const dmg = c.rainDmg * atkMult(w.stage);
  // 플레이어 위치를 기준으로 대규모 공격
  warnCircle(w, p.x, p.y, c.stopBlastR, c.stopWarn, dmg, false);
  for (let k = 0; k < c.stopRing; k++) {
    const a = (Math.PI * 2 * k) / c.stopRing;
    warnCircle(w, p.x + Math.cos(a) * c.stopRingR, p.y + Math.sin(a) * c.stopRingR, c.stopBlastR, c.stopWarn, dmg, false);
  }
  // 기존 투사체 속도 급증
  const bl = w.bullets;
  for (let i = 0; i < bl.cap; i++) {
    if (!bl.alive[i] || !bl.hostile[i]) continue;
    bl.vx[i] *= c.stopBulletBoost;
    bl.vy[i] *= c.stopBulletBoost;
  }
  // 가까운 몬스터 몇 마리가 즉시 돌진
  for (let n = 0; n < c.stopDashers; n++) {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < e.cap; i++) {
      if (!e.alive[i] || e.rank[i] !== 0 || e.dashT[i] < 0) continue;
      const d = Math.hypot(e.x[i] - p.x, e.y[i] - p.y);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) break;
    startDash(w, best, c.stopDashSpeed, c.stopDashSec);
  }
  w.cues |= CUE.boom;
  pushLog(w, "ALERT", msg("timeResume"));
}

/** ⑨ 시간 역주행 — 전장의 시간만 되돌린다 */
function reverse(w: World): void {
  const c = CFG.chrono;
  const b = w.boss;
  const m = w.killMem;
  let revived = 0;
  for (let k = 0; k < c.reverseMonsters && m.n > 0; k++) {
    m.head = (m.head - 1 + m.kind.length) % m.kind.length;
    m.n--;
    const j = spawnEnemy(w, ENEMY_KINDS[m.kind[m.head]], m.x[m.head], m.y[m.head]);
    if (j >= 0) {
      burst(w, m.x[m.head], m.y[m.head], 8, PC.boss, 120);
      spawnFx(w, FX.spawn, m.x[m.head], m.y[m.head], 0.4, 20, { color: PC.boss });
      revived++;
    }
  }
  const obstacles = restoreObstacles(w, c.reverseObstacles);
  for (let k = 0; k < b.chLastRainN; k++) {
    warnCircle(w, b.chLastRain[k * 2], b.chLastRain[k * 2 + 1], c.rainR, 1.2 + k * 0.03, c.rainDmg * atkMult(w.stage), false);
  }
  banner(w, msg("reverse"), msg("reverseSub"));
  pushLog(w, "ALERT", msg("reverseLog", { n: revived, o: obstacles }));
}

function updateExtras(w: World, dt: number, atkF: number): void {
  const c = CFG.chrono;
  const b = w.boss;
  const e = w.enemies;
  const i = b.idx;
  const p = w.player;
  let bombExploded = false;

  for (let j = 0; j < e.cap; j++) {
    if (!e.alive[j] || e.rank[j] !== 1) continue;
    const kind = kindOf(w, j);
    if (w.frozen <= 0) e.life[j] -= dt;

    if (kind === "bomb") {
      // ④ 위성처럼 보스 주위를 돈다
      e.phase[j] += dt * 1.2;
      e.x[j] = e.x[i] + Math.cos(e.phase[j]) * c.bombOrbitR;
      e.y[j] = e.y[i] + Math.sin(e.phase[j]) * c.bombOrbitR;
      if (e.life[j] <= 0) bombExploded = true;
    } else if (kind === "clone") {
      // ⑤ 분신 — 느리게 쫓아오고, 닿으면 아프고, 30초 뒤 자폭
      if (w.frozen <= 0) {
        const dx = p.x - e.x[j];
        const dy = p.y - e.y[j];
        const d = Math.hypot(dx, dy) || 1;
        e.x[j] += (dx / d) * e.speed[j] * dt;
        e.y[j] += (dy / d) * e.speed[j] * dt;
        e.phase[j] = e.phase[i];
      }
      if (Math.hypot(e.x[j] - p.x, e.y[j] - p.y) < e.r[j] + CFG.player.radius) hurtPlayer(w, e.dmg[j] * atkF, true);
      if (e.life[j] <= 0) {
        burst(w, e.x[j], e.y[j], 24, 6, 300);
        w.shake = Math.max(w.shake, 0.3);
        w.shakePx = Math.max(w.shakePx, 8);
        if (Math.hypot(e.x[j] - p.x, e.y[j] - p.y) < c.cloneBlastR) hurtPlayer(w, c.cloneBlastDmg * atkMult(w.stage) * atkF, true);
        removeEnemy(w, j, false);
      }
    }
  }

  if (bombExploded) {
    let n = 0;
    const bomb = ENEMY_KINDS.indexOf("bomb");
    for (let j = 0; j < e.cap; j++) {
      if (e.alive[j] && e.kind[j] === bomb) {
        burst(w, e.x[j], e.y[j], 20, 6, 260);
        removeEnemy(w, j, false);
        n++;
      }
    }
    if (n > 0 && p.alive) {
      // 못 부순 폭탄이 있으면 현재 체력 절반
      p.hp = Math.max(1, Math.floor(p.hp / 2));
      w.run.damageTaken += 1;
      w.flash = Math.max(w.flash, 0.3);
      w.shake = Math.max(w.shake, CFG.feedback.bossShakeSec);
      w.shakePx = CFG.feedback.bossShakePx;
      w.cues |= CUE.boom;
      pushLog(w, "FATAL", msg("bombHalf"));
    }
  }
}

export function updateChrono(w: World, dt: number): void {
  const c = CFG.chrono;
  const b = w.boss;
  const e = w.enemies;
  const i = b.idx;

  // ⑩ 최후의 심판 — 초침이 12시에 닿으면 끝
  if (b.chTimeout >= 0) {
    b.chTimeout += dt;
    w.gray = Math.min(1, b.chTimeout / 0.6);
    if (Math.floor(b.chTimeout * 2) !== Math.floor((b.chTimeout - dt) * 2)) w.cues |= CUE.tick;
    if (b.chTimeout >= c.timeoutSec) judgePlayer(w);
    return;
  }

  b.t += dt;
  if (b.t >= b.chLimit) {
    startJudgement(w);
    return;
  }

  const g = chronoGrowth(w);
  const atkF = 1 + c.grow.atk * g;
  const cdF = 1 - c.grow.cd * g;

  // 시간이 흐를수록 최대 체력이 오른다 (깎은 비율은 유지)
  const targetMax = b.chBaseHp * (1 + c.grow.hp * g);
  if (targetMax > b.maxHp) {
    const gain = targetMax - b.maxHp;
    b.maxHp = targetMax;
    e.maxHp[i] = targetMax;
    e.hp[i] += gain;
  }
  e.dmg[i] = CFG.boss.contactDmg * atkMult(w.stage) * atkF;

  // ⑥ 분노 게이지
  b.chRage = Math.min(c.rage.max, b.chRage + c.rage.perSec * (1 + g) * dt);

  // ① 체력 기록 (1초마다)
  b.chHistT -= dt;
  if (b.chHistT <= 0) {
    b.chHistT = 1;
    b.chHist[b.chHistN % b.chHist.length] = e.hp[i];
    b.chHistN++;
  }

  updateExtras(w, dt, atkF);

  // ① 시간 역행 연출 중에는 무적이고 공격하지 않는다
  if (b.chRewindT > 0) {
    b.chRewindT -= dt;
    if (b.chRewindT <= 0) {
      e.hp[i] = Math.min(b.maxHp, Math.max(e.hp[i], b.chRewindHp));
      burst(w, e.x[i], e.y[i], 30, 3, 260);
    }
    return;
  }
  if (!b.chRewound && e.hp[i] <= b.maxHp * c.rewindAt) {
    b.chRewound = true;
    b.chRewindT = c.rewindSec;
    b.shield = c.rewindSec;
    const back = Math.min(b.chHistN, c.rewindBackSec, b.chHist.length);
    b.chRewindHp = back > 0 ? b.chHist[(b.chHistN - back) % b.chHist.length] : e.hp[i];
    banner(w, msg("rewind"), msg("rewindSub"));
    pushLog(w, "ALERT", msg("rewind"));
    w.cues |= CUE.alarm;
    return;
  }

  // ⑧ 시간 정지
  if (b.chStopLeft > 0) {
    b.chStopLeft -= dt;
    if (Math.floor(b.chStopLeft * 2) !== Math.floor((b.chStopLeft + dt) * 2)) w.cues |= CUE.tick;
    if (b.chStopLeft <= 0) {
      releaseStop(w);
      b.chStopT = c.stopCd * cdF;
    }
    return;
  }
  b.chStopT -= dt;
  if (b.chStopT <= 0) {
    b.chStopLeft = c.stopSec;
    w.frozen = c.stopSec;
    banner(w, msg("timeStop"), msg("timeStopSub"), c.stopSec);
    pushLog(w, "ALERT", msg("timeStop"));
    w.cues |= CUE.tick;
    return;
  }

  // ⑨ 시간 역주행
  if (b.chReverseIdx < c.reverseAt.length && e.hp[i] <= b.maxHp * c.reverseAt[b.chReverseIdx]) {
    b.chReverseIdx++;
    reverse(w);
  }

  // ⑦ 시간의 시계 — 12시/6시만 열린다
  if (e.hp[i] <= b.maxHp * c.clockAt) {
    b.chClockT -= dt;
    if (b.chClockT <= 0) {
      b.chClockOn = !b.chClockOn;
      b.chClockT = b.chClockOn ? c.clockOn : c.clockOff;
      b.gateOn = b.chClockOn;
      b.gateN = 2;
      b.gateA[0] = -Math.PI / 2;
      b.gateA[1] = Math.PI / 2;
      b.gateW = c.clockArc;
      if (b.chClockOn) {
        banner(w, msg("clock"), msg("clockSub"));
        pushLog(w, "ALERT", msg("clock"));
      }
    }
  }

  moveBoss(w, c.speed * (1 + c.grow.speed * g), 260, dt);
  e.phase[i] += dt * 0.25;
  bossContact(w, e.dmg[i]);

  const atk = atkMult(w.stage) * atkF;

  // ② 시간 추적탄
  b.chHomingT -= dt;
  if (b.chHomingT <= 0) {
    b.chHomingT = c.homingCd * cdF;
    const base = Math.atan2(w.player.y - e.y[i], w.player.x - e.x[i]);
    for (let k = 0; k < c.homingCount; k++) {
      const a = base + (k - (c.homingCount - 1) / 2) * 0.6;
      spawnBullet(w, e.x[i], e.y[i], Math.cos(a) * c.homingMin, Math.sin(a) * c.homingMin,
        c.homingDmg * atk, c.homingLife, 8, LOOK.homing, TAG.physical, { hostile: true });
    }
  }

  // ③ 시간 폭격 — 진행될수록 경고는 짧게, 빈도는 높게
  b.chRainT -= dt;
  if (b.chRainT <= 0) {
    b.chRainT = lerp(c.rainCd, g);
    rain(w, Math.round(lerp(c.rainCount, g)), lerp(c.rainWarn, g));
  }

  // ④ 시한폭탄
  b.chBombT -= dt;
  if (b.chBombT <= 0) {
    b.chBombT = c.bombEvery;
    for (let k = 0; k < c.bombCount; k++) {
      const j = spawnEnemy(w, "bomb", e.x[i], e.y[i], 1);
      if (j < 0) continue;
      e.phase[j] = (Math.PI * 2 * k) / c.bombCount;
      e.hp[j] = b.maxHp * c.bombHp;
      e.maxHp[j] = e.hp[j];
      e.r[j] = 14;
      e.life[j] = c.bombFuse;
      e.xp[j] = 3;
    }
    pushLog(w, "ALERT", msg("bombs"));
    w.cues |= CUE.alarm;
  }

  // ⑤ 시간의 분신 — 진짜도 같이 자리를 바꾼다
  b.chCloneT -= dt;
  if (b.chCloneT <= 0) {
    b.chCloneT = c.cloneCd;
    const ox = e.x[i];
    const oy = e.y[i];
    const slot = Math.floor(w.rand() * (c.cloneCount + 1));
    for (let k = 0; k <= c.cloneCount; k++) {
      const a = (Math.PI * 2 * k) / (c.cloneCount + 1) + w.rand() * 0.5;
      const x = ox + Math.cos(a) * 180;
      const y = oy + Math.sin(a) * 180;
      if (k === slot) {
        e.x[i] = x;
        e.y[i] = y;
        continue;
      }
      const j = spawnEnemy(w, "clone", x, y, 1);
      if (j < 0) continue;
      e.hp[j] = b.maxHp * c.cloneHp;
      e.maxHp[j] = e.hp[j];
      e.r[j] = e.r[i];
      e.speed[j] = c.speed * 0.5;
      e.dmg[j] = c.cloneDmg * atkMult(w.stage);
      e.life[j] = c.cloneLife;
      e.xp[j] = 3;
    }
    burst(w, ox, oy, 30, 3, 300);
    banner(w, msg("clones"), msg("clonesSub"));
    pushLog(w, "ALERT", msg("clones"));
  }
}
