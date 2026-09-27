// ⚠️ 레이저 · 🚀 추적 미사일 (2.0 §7 · §13 · §16) — 화면 좌표 위험 요소.
// 둘 다 즉사가 아니라 에너지 피해이고, 반드시 경고(경고선 · LOCK ON)가 먼저 뜬다.
import { CFG } from "../config";
import type { LaserPattern } from "../types";

const W = CFG.view.w;
const H = CFG.view.h;

export type Laser = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thick: number;
  /** 이 시간이 지나야 경고가 시작된다 (폭격 순서) */
  delay: number;
  warn: number;
  fire: number;
  /** 경과 시간 (FREEZE 중엔 느리게 흐른다) */
  t: number;
  /** 폭격 레인 순번 (1부터, 화면에 번호로 표시) */
  order?: number;
  /** LASER WARNING 이벤트 (화면 전체가 붉어지는 큰 경고) */
  big?: boolean;
  hit?: boolean;
};

export type Missile = {
  x: number;
  y: number;
  state: "lock" | "fly";
  /** lock: 경과 시간 */
  t: number;
  /** 조준선 y (락온 후반엔 고정) */
  aimY: number;
  delay: number;
  dead?: boolean;
};

export function laserState(l: Laser): "wait" | "warn" | "fire" | "done" {
  if (l.t < l.delay) return "wait";
  if (l.t < l.delay + l.warn) return "warn";
  if (l.t < l.delay + l.warn + l.fire) return "fire";
  return "done";
}

/** 발사까지 남은 초 (카운트다운 3·2·1 표시용) */
export function laserCountdown(l: Laser): number {
  return Math.max(0, l.delay + l.warn - l.t);
}

function hline(y: number, thick: number, warn: number, extra: Partial<Laser> = {}): Laser {
  return { x1: -40, y1: y, x2: W + 40, y2: y, thick, delay: 0, warn, fire: CFG.laser.fire, t: 0, ...extra };
}

/** 트리거 → 레이저 묶음 */
export function buildLasers(pattern: LaserPattern, ys: number[], warnMult: number): Laser[] {
  const warn = CFG.laser.warn * warnMult;
  const thick = CFG.laser.thick;
  switch (pattern) {
    case "single":
      return [hline(ys[0], thick, warn)];
    case "double":
      return ys.map((y) => hline(y, thick, warn));
    case "diag":
    case "cross": {
      const out: Laser[] = [
        { x1: W + 40, y1: ys[0], x2: -40, y2: ys[1], thick: thick - 4, delay: 0, warn, fire: CFG.laser.fire, t: 0 },
      ];
      if (pattern === "cross" && ys[2] !== undefined) out.push(hline(ys[2], thick, warn));
      return out;
    }
    case "event": {
      // 안전 띠 170px 만 남기고 위·아래를 굵은 빔으로 덮는다
      const safeTop = ys[0];
      const safeBottom = safeTop + 170;
      const w = CFG.laser.eventWarn * warnMult;
      const out: Laser[] = [];
      if (safeTop > 8) out.push(hline(safeTop / 2, safeTop, w, { big: true, fire: 0.7 }));
      if (safeBottom < H - 8) out.push(hline((safeBottom + H) / 2, H - safeBottom, w, { big: true, fire: 0.7 }));
      return out;
    }
  }
}

/** 4레인 순차 폭격 — 한 번에 한 레인만 켜진다 */
export const BARRAGE_LANES = [95, 205, 315, 425];

export function buildBarrage(order: number[], warnMult: number): Laser[] {
  const warn = 1.2 * warnMult;
  const gap = CFG.laser.barrageGap * Math.max(0.8, warnMult);
  return order.map((lane, i) =>
    hline(BARRAGE_LANES[lane], CFG.laser.barrageThick, warn, { delay: i * gap, order: i + 1, fire: 0.45 }),
  );
}

/** 점(부엉이 중심)과 선분 사이 거리 */
export function segDist(px: number, py: number, l: Laser): number {
  const dx = l.x2 - l.x1;
  const dy = l.y2 - l.y1;
  const len2 = dx * dx + dy * dy || 1;
  const k = Math.max(0, Math.min(1, ((px - l.x1) * dx + (py - l.y1) * dy) / len2));
  return Math.hypot(px - (l.x1 + dx * k), py - (l.y1 + dy * k));
}

/** 켜진 레이저가 부엉이를 태우는가 (히트박스를 살짝 봐준다) */
export function laserHits(l: Laser, ox: number, oy: number, ry: number): boolean {
  return laserState(l) === "fire" && segDist(ox, oy, l) <= l.thick / 2 + ry * 0.8;
}

/** 레이저가 부엉이 기둥(x=ox)에서 막는 y 구간 (봇이 피할 때 쓴다) */
export function laserSpanAt(l: Laser, ox: number): { y0: number; y1: number } | null {
  const dx = l.x2 - l.x1;
  if (Math.abs(dx) < 1) return null;
  const k = (ox - l.x1) / dx;
  if (k < 0 || k > 1) return null;
  const y = l.y1 + (l.y2 - l.y1) * k;
  const slope = Math.abs((l.y2 - l.y1) / dx);
  const half = (l.thick / 2) * Math.sqrt(1 + slope * slope);
  return { y0: y - half, y1: y + half };
}

export function newMissile(delay: number, aimY: number): Missile {
  return { x: W + 40, y: aimY, state: "lock", t: 0, aimY, delay };
}

/**
 * 미사일 한 프레임. `dt`는 FREEZE 가 반영된 월드 시간, `scroll`은 현재 스크롤 속도.
 * 락온: 처음엔 부엉이를 따라가다가 마지막 freezeSec 동안 조준점이 멈춘다 → 그때 피하면 된다.
 */
export function stepMissile(m: Missile, dt: number, ownY: number, scroll: number, homingMult = 1): void {
  const c = CFG.missile;
  if (m.state === "lock") {
    m.t += dt;
    if (m.t < m.delay) return;
    if (m.t - m.delay < c.lockSec - c.freezeSec) m.aimY = ownY;
    if (m.t - m.delay >= c.lockSec) {
      m.state = "fly";
      m.y = m.aimY;
      m.x = W + 40;
    }
    return;
  }
  m.x -= (scroll + c.speed) * dt;
  const dy = ownY - m.y;
  const maxStep = c.homing * homingMult * dt;
  m.y += Math.max(-maxStep, Math.min(maxStep, dy));
  if (m.x < -60) m.dead = true;
}
