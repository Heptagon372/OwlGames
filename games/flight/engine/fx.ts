// 속도감 연출 (렌더 전용 상태) — 게임 로직·점수에는 전혀 영향을 주지 않는다.
// 스피드 라인 · 잔상 · 바람 먼지 · 터보 링 · 화면 줌.
import { CFG } from "../config";
import type { Game } from "./game";

export type SpeedLine = { x: number; y: number; len: number; w: number; a: number; v: number };
export type Dust = { x: number; y: number; vx: number; vy: number; r: number; a: number };
export type Ring = { r: number; a: number };

export type Fx = {
  lines: SpeedLine[];
  dust: Dust[];
  rings: Ring[];
  /** 부엉이 잔상 (최근 y) */
  trail: number[];
  /** 터보 등에서 살짝 당겨지는 줌 */
  zoom: number;
  /** 0~1 — 현재 속도가 최고 속도에 얼마나 가까운지 */
  speedT: number;
  spawnAcc: number;
};

export function createFx(): Fx {
  return { lines: [], dust: [], rings: [], trail: [], zoom: 1, speedT: 0, spawnAcc: 0 };
}

const W = CFG.view.w;
const H = CFG.view.h;

export function updateFx(fx: Fx, g: Game, dt: number, reduced: boolean): void {
  const target = (g.scroll - CFG.scroll.v0) / (CFG.scroll.vMax * CFG.special.turboMult - CFG.scroll.v0);
  fx.speedT += (Math.max(0, Math.min(1, target)) - fx.speedT) * Math.min(1, dt * 4);

  // 터보 구간에서는 화면을 살짝 당긴다
  const zoomTarget = g.special?.kind === "turbo" ? 1.06 : 1;
  fx.zoom += (zoomTarget - fx.zoom) * Math.min(1, dt * 3);

  if (reduced) {
    fx.lines.length = 0;
    fx.dust.length = 0;
    fx.rings.length = 0;
    fx.trail.length = 0;
    return;
  }

  // 잔상 (최근 12프레임)
  if (g.status !== "ready") {
    fx.trail.unshift(g.y);
    if (fx.trail.length > 12) fx.trail.length = 12;
  }

  // 스피드 라인 — 빠를수록 많이, 길게
  const rate = 6 + fx.speedT * 46;
  fx.spawnAcc += rate * dt;
  while (fx.spawnAcc >= 1) {
    fx.spawnAcc -= 1;
    if (fx.lines.length > 90) break;
    const fast = Math.random() < 0.4;
    fx.lines.push({
      x: W + 40,
      y: Math.random() * H,
      len: 50 + Math.random() * (90 + fx.speedT * 220),
      w: fast ? 2 : 1,
      a: 0.12 + Math.random() * (0.18 + fx.speedT * 0.4),
      v: g.scroll * (1.25 + Math.random() * 0.9),
    });
  }
  for (let i = fx.lines.length - 1; i >= 0; i--) {
    const l = fx.lines[i];
    l.x -= l.v * dt;
    if (l.x + l.len < -40) fx.lines.splice(i, 1);
  }

  // 바람 먼지 — 부엉이 주변을 스쳐 지나간다
  if (g.status === "playing" && Math.random() < 0.25 + fx.speedT * 0.55) {
    fx.dust.push({
      x: W + 10,
      y: Math.random() * H,
      vx: g.scroll * (1.1 + Math.random() * 0.5),
      vy: (Math.random() - 0.5) * 30,
      r: 1 + Math.random() * 2.2,
      a: 0.25 + Math.random() * 0.35,
    });
  }
  for (let i = fx.dust.length - 1; i >= 0; i--) {
    const d = fx.dust[i];
    d.x -= d.vx * dt;
    d.y += d.vy * dt;
    if (d.x < -20) fx.dust.splice(i, 1);
  }

  // 터보 링
  if (g.special?.kind === "turbo") {
    if (fx.rings.length < 6 && Math.random() < dt * 6) fx.rings.push({ r: 30, a: 0.55 });
    for (let i = fx.rings.length - 1; i >= 0; i--) {
      const r = fx.rings[i];
      r.r += (420 + fx.speedT * 300) * dt;
      r.a -= dt * 0.75;
      if (r.a <= 0) fx.rings.splice(i, 1);
    }
  } else {
    fx.rings.length = 0;
  }
}
