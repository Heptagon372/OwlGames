// 자동 봇 시뮬레이션 (기획서 §16-6) — 밸런스 튜닝·회귀 검증용.
// 게임 로직을 헤드리스로 돌려 "평범한 플레이어"의 결과 분포를 본다.
// 정책: 앞 구간에서 막히지 않은 통로를 찾아 그 중심을 목표로 삼고, 수직속도를 P 제어한다.
import { CFG, type SizeKey } from "../config";
import type { DeathCause, FlightStats } from "../types";
import { solidRects } from "./collision";
import { hitbox } from "./owl";
import { createGame, currentRaw, finalStats, update, type Game, type Input } from "./game";

export type BotResult = {
  durationSec: number;
  raw: number;
  meters: number;
  cause: DeathCause;
  stats: FlightStats;
};

const OWL_X = CFG.physics.owlX;
/** 앞쪽 몇 px까지 보고 통로를 찾을지 */
const LOOK_PX = 340;
const TOP = 40;
const BOTTOM = CFG.view.h - 40;

type Span = { y0: number; y1: number };

/** 앞 구간에서 막힌 y 구간들 */
function hazardSpans(g: Game, size: SizeKey): Span[] {
  const { ry } = hitbox(size);
  const margin = ry + 14;
  const spans: Span[] = [];
  for (const s of g.spawner.entities) {
    if (s.gone) continue;
    const sx = s.x - g.worldX;
    if (sx + s.w < OWL_X - 10 || sx > OWL_X + LOOK_PX) continue;
    if (s.e.t === "item" || s.e.t === "gate") continue;
    const t = (OWL_X + g.worldX - s.chunkX) / s.chunkScroll;
    for (const r of solidRects(s.e, sx, size, t)) {
      spans.push({ y0: r.y - margin, y1: r.y + r.h + margin });
    }
  }
  return spans;
}

/** 막힌 구간을 뺀 열린 통로들 */
function freeGaps(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.y0 - b.y0);
  const gaps: Span[] = [];
  let cursor = TOP;
  for (const s of sorted) {
    if (s.y0 > cursor) gaps.push({ y0: cursor, y1: Math.min(s.y0, BOTTOM) });
    cursor = Math.max(cursor, s.y1);
    if (cursor >= BOTTOM) break;
  }
  if (cursor < BOTTOM) gaps.push({ y0: cursor, y1: BOTTOM });
  return gaps.filter((gp) => gp.y1 - gp.y0 > 24);
}

function targetY(g: Game): number {
  const gaps = freeGaps(hazardSpans(g, g.size));
  if (!gaps.length) return g.y;

  const items = g.spawner.entities.filter((s) => {
    if (s.gone || s.e.t !== "item") return false;
    const dx = s.x - g.worldX - OWL_X;
    return dx > 0 && dx < LOOK_PX;
  });

  // 넓고 가까운 통로를 고르되, 아이템이 들어 있으면 가산점
  let best = gaps[0];
  let bestScore = -Infinity;
  for (const gp of gaps) {
    const center = (gp.y0 + gp.y1) / 2;
    let score = Math.min(gp.y1 - gp.y0, 220) - Math.abs(center - g.y) * 1.1;
    for (const s of items) {
      const iy = s.e.t === "item" ? s.e.y : 0;
      if (iy >= gp.y0 && iy <= gp.y1) score += 60;
    }
    if (score > bestScore) {
      bestScore = score;
      best = gp;
    }
  }

  // 통로 안에 아이템이 있으면 그쪽으로
  for (const s of items) {
    const iy = s.e.t === "item" ? s.e.y : 0;
    if (iy > best.y0 + 30 && iy < best.y1 - 30) return iy;
  }
  const center = (best.y0 + best.y1) / 2;
  return Math.max(best.y0 + 26, Math.min(best.y1 - 26, center));
}

/** 프레임마다 깜빡이며 날갯짓하지 않도록 이력(hysteresis)을 둔다 — 사람처럼 길게 누른다 */
const flapState = new WeakMap<Game, boolean>();

export function botInput(g: Game): Input {
  const target = targetY(g);
  // 목표 y로 가기 위한 희망 수직속도 (P 제어) → 지금 속도가 그보다 빠르면 날갯짓
  const low = g.energy.value <= g.energy.max * CFG.energy.lowRatio;
  const desiredVy = Math.max(-420, Math.min(460, (target - g.y) * 3.2)) + (low ? 110 : 0);
  const wasFlapping = flapState.get(g) ?? false;
  const band = 45;
  const flap = wasFlapping ? g.vy > desiredVy - band : g.vy > desiredVy + band;
  flapState.set(g, flap);
  return {
    flap,
    cycle: false,
    color: g.nextGate && g.nextGate !== g.color ? g.nextGate : null,
  };
}

export function simulate(seed: number, maxSec = CFG.platform.maxSessionSec - 5): BotResult {
  const g = createGame(seed);
  const dt = CFG.physics.dt;
  let t = 0;
  let first = true;
  while (g.status !== "dead" && t < maxSec) {
    const input = first ? { flap: true, cycle: false, color: null } : botInput(g);
    first = false;
    update(g, dt, input);
    t += dt;
  }
  return {
    durationSec: g.time,
    raw: currentRaw(g),
    meters: Math.floor(g.meters),
    cause: g.deathCause,
    stats: finalStats(g),
  };
}

export function summarize(results: BotResult[]) {
  const sorted = (key: (r: BotResult) => number) => results.map(key).sort((a, b) => a - b);
  const median = (arr: number[]) => arr[Math.floor(arr.length / 2)];
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const durations = sorted((r) => r.durationSec);
  const raws = sorted((r) => r.raw);
  const meters = sorted((r) => r.meters);
  const points = raws.map((raw) => CFG.platform.basePoints + Math.min(CFG.platform.maxBonus, Math.floor(raw / CFG.platform.K)));
  return {
    runs: results.length,
    durationMean: round(mean(durations)),
    durationMedian: round(median(durations)),
    rawMedian: Math.round(median(raws)),
    rawMean: Math.round(mean(raws)),
    metersMedian: median(meters),
    pointsMedian: median(points),
    byCause: {
      wall: results.filter((r) => r.cause === "wall").length,
      energy: results.filter((r) => r.cause === "energy").length,
      alive: results.filter((r) => r.cause === null).length,
    },
  };
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}
