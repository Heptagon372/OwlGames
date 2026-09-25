// 🚀 아울스페이스 — 패턴 실행기 (기획서 §13 DSL)
//
// 보스 패턴은 전부 data/patterns.ts 의 데이터다. 이 파일은 그 데이터를 읽어 탄을 뿌리기만 한다.
// 각도 규약: **0도 = 화면 아래쪽(+y)**, 시계 방향이 +.

import { CFG, bulletSpeedMult, densityMult } from "../config";
import { PATTERNS, PATTERN_IDS } from "../data/patterns";
import type { Shot } from "../types";
import { spawnEBullet, spawnLaser, SHOT_TYPES, type World } from "./world";

const RAD = Math.PI / 180;

export function patternIndex(id: string): number {
  return PATTERN_IDS.indexOf(id);
}

export function patternById(idx: number) {
  return PATTERNS[PATTERN_IDS[idx]] ?? null;
}

export function setPattern(w: World, i: number, id: string): void {
  w.enemies.patIdx[i] = patternIndex(id);
  w.enemies.patT[i] = 0;
  w.enemies.patFired[i] = 0;
}

function dirTo(w: World, x: number, y: number): number {
  // 🦉 페이크 아울(S12) — 분신이 살아 있으면 조준탄의 절반이 분신을 노린다
  const p = w.player;
  const useDecoy = p.decoyT > 0 && w.rand() < 0.5;
  const tx = useDecoy ? p.decoyX : p.x;
  const ty = useDecoy ? p.decoyY : p.y;
  // 0도가 아래쪽이므로 atan2(dx, dy)
  return Math.atan2(tx - x, ty - y) / RAD;
}

function emit(w: World, x: number, y: number, angleDeg: number, speed: number, r: number, look: number): void {
  const a = angleDeg * RAD;
  spawnEBullet(w, x, y, Math.sin(a) * speed, Math.cos(a) * speed, r, look);
}

/** 한 발(또는 한 무리) 발사 */
export function emitShot(w: World, x: number, y: number, shot: Shot, rotate = 0, srcIdx = -1): void {
  const speed = shot.speed * bulletSpeedMult(w.stage) * (w.info.rule === "fast" ? 1.2 : 1);
  const density = densityMult(w.stage) * (w.info.rule === "dense" ? 1.3 : 1);
  const count = Math.max(1, Math.round(shot.count * (shot.type === "laser" ? 1 : density)));
  const r = shot.r ?? 6;
  const base = (shot.angle ?? 0) + rotate;

  switch (shot.type) {
    case "fan": {
      const spread = shot.spread ?? 40;
      const aim = base + dirTo(w, x, y) * 0;
      for (let k = 0; k < count; k++) {
        const a = aim + (count === 1 ? 0 : -spread / 2 + (spread * k) / (count - 1));
        emit(w, x, y, a, speed, r, 0);
      }
      break;
    }
    case "ring": {
      for (let k = 0; k < count; k++) emit(w, x, y, base + (360 * k) / count, speed, r, 0);
      break;
    }
    case "aimed": {
      const aim = dirTo(w, x, y) + base;
      const spread = shot.spread ?? 0;
      for (let k = 0; k < count; k++) {
        const a = aim + (count === 1 ? 0 : -spread / 2 + (spread * k) / (count - 1));
        emit(w, x, y, a, speed, r, 0);
      }
      break;
    }
    case "spiral": {
      for (let k = 0; k < count; k++) emit(w, x, y, base + (360 * k) / count, speed, r, 0);
      break;
    }
    case "random": {
      for (let k = 0; k < count; k++) {
        // 아래쪽으로 치우친 무작위 (위로만 쏘면 안 맞는다)
        const a = base + (w.rand() - 0.5) * 210;
        emit(w, x, y, a, speed * (0.7 + w.rand() * 0.6), r, 0);
      }
      break;
    }
    case "laser": {
      const warn = shot.warnSec ?? 0.6;
      const spread = shot.spread ?? 0;
      const aim = count === 1 ? dirTo(w, x, y) + base : base;
      for (let k = 0; k < count; k++) {
        const a = aim + (count === 1 ? 0 : -spread / 2 + (spread * k) / (count - 1));
        spawnLaser(w, x, y, a, 14 + (shot.r ?? 0), warn, srcIdx);
      }
      break;
    }
  }
}

/** repeat 예약을 큐에 넣는다 */
function queueVolley(w: World, srcIdx: number, shot: Shot): void {
  const v = w.volleys;
  let i = -1;
  for (let k = 0; k < v.cap; k++) if (!v.alive[k]) { i = k; break; }
  if (i < 0) return;
  const rep = shot.repeat;
  if (!rep) return;
  v.alive[i] = 1;
  v.src[i] = srcIdx;
  v.next[i] = rep.intervalSec;
  v.left[i] = rep.times - 1;
  v.interval[i] = rep.intervalSec;
  v.rotate[i] = rep.rotateDeg ?? 0;
  v.angle[i] = shot.angle ?? 0;
  v.type[i] = SHOT_TYPES.indexOf(shot.type);
  v.count[i] = shot.count;
  v.speed[i] = shot.speed;
  v.spread[i] = shot.spread ?? 0;
  v.r[i] = shot.r ?? 6;
  v.warn[i] = shot.warnSec ?? 0.6;
}

export function tickVolleys(w: World, dt: number): void {
  const v = w.volleys;
  const e = w.enemies;
  for (let i = 0; i < v.cap; i++) {
    if (!v.alive[i]) continue;
    const src = v.src[i];
    if (src >= 0 && !e.alive[src]) { v.alive[i] = 0; continue; }
    v.next[i] -= dt;
    if (v.next[i] > 0) continue;

    v.next[i] = v.interval[i];
    v.angle[i] += v.rotate[i];
    const x = src >= 0 ? e.x[src] : CFG.screen.w / 2;
    const y = src >= 0 ? e.y[src] : 0;
    emitShot(
      w, x, y,
      {
        at: 0,
        type: SHOT_TYPES[v.type[i]],
        count: v.count[i],
        speed: v.speed[i],
        spread: v.spread[i],
        angle: v.angle[i],
        r: v.r[i],
        warnSec: v.warn[i],
      },
      0,
      src,
    );

    v.left[i] -= 1;
    if (v.left[i] <= 0) v.alive[i] = 0;
  }
}

/** 적 하나의 패턴을 한 프레임 굴린다 */
export function tickPattern(w: World, i: number, dt: number): void {
  const e = w.enemies;
  const pat = patternById(e.patIdx[i]);
  if (!pat) return;

  const before = e.patT[i];
  e.patT[i] += dt;

  for (let s = 0; s < pat.shots.length && s < 8; s++) {
    const shot = pat.shots[s];
    const bit = 1 << s;
    if (e.patFired[i] & bit) continue;
    if (e.patT[i] < shot.at) continue;
    e.patFired[i] |= bit;
    emitShot(w, e.x[i], e.y[i], shot, 0, i);
    if (shot.repeat) queueVolley(w, i, shot);
  }

  if (e.patT[i] >= pat.loopSec) {
    e.patT[i] = 0;
    e.patFired[i] = 0;
  }
  void before;
}
