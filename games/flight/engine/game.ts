// 아울러닝 상태 기계 — 렌더와 분리된 순수 로직 (기획서 §14)
import { CFG, type Color, type SizeKey, nextColor, phaseFromMeters } from "../config";
import type { DeathCause, Entity, FlightStats, ItemKind } from "../types";
import { bugY, ellipseRectDistance, isNearMiss, solidRects } from "./collision";
import * as Energy from "./energy";
import { clamp, growSize, hitbox, shrinkSize, stepPhysics } from "./owl";
import { drainMultFromMeters, effectiveScroll, phaseHint, rollSpecial, type SpecialState } from "./phases";
import * as Score from "./score";
import { createSpawner, type Spawner } from "./spawner";

export type Input = { flap: boolean; cycle: boolean; color: Color | null };

export type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; r: number };

export type Banner = { text: string; sub?: string; until: number } | null;

export type GameStatus = "ready" | "playing" | "falling" | "dead";

export type Game = {
  status: GameStatus;
  time: number;
  worldX: number;
  meters: number;
  scroll: number;
  /** 특수 구간 중 난이도 고정용 */
  frozenMeters: number | null;
  turboMeters: number;

  y: number;
  vy: number;
  size: SizeKey;
  sizeTween: number;
  color: Color;
  colorCd: number;
  iFrame: number;
  shield: boolean;
  rainbow: number;
  slow: number;
  edgeCd: number;

  energy: Energy.EnergyState;
  score: Score.ScoreState;
  special: SpecialState;
  nextSpecialAt: number;
  phaseMax: number;
  deathCause: DeathCause;
  deathAt: number;
  fallT: number;

  banner: Banner;
  flash: number;
  shake: number;
  particles: Particle[];
  spawner: Spawner;
  rand: () => number;
  /** 화면에 표시할 다음 게이트 색 */
  nextGate: Color | null;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createGame(seed = Date.now()): Game {
  const rand = mulberry32(seed);
  return {
    status: "ready",
    time: 0,
    worldX: 0,
    meters: 0,
    scroll: CFG.scroll.v0,
    frozenMeters: null,
    turboMeters: 0,
    y: CFG.view.h / 2,
    vy: 0,
    size: "M",
    sizeTween: 1,
    color: "R",
    colorCd: 0,
    iFrame: 0,
    shield: false,
    rainbow: 0,
    slow: 0,
    edgeCd: 0,
    energy: Energy.initEnergy("M"),
    score: Score.initScore(),
    special: null,
    nextSpecialAt: CFG.special.fromMeters,
    phaseMax: 0,
    deathCause: null,
    deathAt: 0,
    fallT: 0,
    banner: { text: phaseHint(0), until: 3 },
    flash: 0,
    shake: 0,
    particles: [],
    spawner: createSpawner(rand, CFG.view.w),
    rand,
    nextGate: null,
  };
}

const OWL_X = CFG.physics.owlX;

export function update(g: Game, dt: number, input: Input): void {
  if (g.status === "dead") {
    g.deathAt += dt;
    tickEffects(g, dt);
    return;
  }
  if (g.status === "ready") {
    if (!input.flap) {
      tickEffects(g, dt);
      return;
    }
    g.status = "playing";
  }

  g.time += dt;
  const phase = phaseFromMeters(g.meters);
  if (phase > g.phaseMax) {
    g.phaseMax = phase;
    const hint = phaseHint(phase);
    if (hint) g.banner = { text: `PHASE ${phase}`, sub: hint, until: g.time + 3 };
  }

  // ── 스크롤 ──────────────────────────────────────────────
  const base = effectiveScroll(g.meters, g.special, g.frozenMeters);
  g.scroll = base * (g.slow > 0 ? CFG.color.failSlow : 1);
  g.worldX += g.scroll * dt;
  const prevMeters = g.meters;
  g.meters = g.worldX / CFG.physics.pxPerMeter;
  if (g.special?.kind === "turbo") g.turboMeters += g.meters - prevMeters;

  // ── 특수 구간 ───────────────────────────────────────────
  if (!g.special && g.meters >= g.nextSpecialAt) {
    g.nextSpecialAt += CFG.special.everyMeters;
    const rolled = rollSpecial(g.meters, g.rand);
    if (rolled) {
      g.special = rolled;
      g.frozenMeters = g.meters;
      g.banner = { text: rolled.label, sub: rolled.desc, until: g.time + 2.5 };
    }
  } else if (g.special && g.meters >= g.special.endMeters) {
    g.score.specialCleared += 1;
    g.banner = { text: "구간 완주!", sub: `+${CFG.score.specialClear}점`, until: g.time + 2 };
    g.special = null;
    g.frozenMeters = null;
  }

  // ── 입력: 색 변경 ───────────────────────────────────────
  g.colorCd = Math.max(0, g.colorCd - dt);
  const wanted = input.color ?? (input.cycle ? nextColor(g.color) : null);
  if (wanted && wanted !== g.color && g.colorCd <= 0) {
    g.color = wanted;
    g.colorCd = CFG.color.cycleCooldown;
    Energy.add(g.energy, -CFG.energy.colorCost);
  }

  // ── 물리 ────────────────────────────────────────────────
  const canFlap = g.status === "playing" && g.energy.value > 0;
  const flapping = input.flap && canFlap;
  const flapMult = Energy.isLow(g.energy) ? CFG.energy.lowFlapMult : 1;
  const p = stepPhysics({ y: g.y, vy: g.vy }, flapping, dt, flapMult);
  g.y = p.y;
  g.vy = p.vy;
  if (flapping) Energy.drainFlap(g.energy, dt, drainMultFromMeters(g.meters));
  Energy.tickBuffs(g.energy, dt);

  // 천장·바닥 — 즉사 아님, 에너지 -10 + 튕김 (§2)
  const { rx, ry } = hitbox(g.size);
  g.edgeCd = Math.max(0, g.edgeCd - dt);
  if (g.y < ry || g.y > CFG.view.h - ry) {
    const atFloor = g.y > CFG.view.h - ry;
    g.y = clamp(g.y, ry, CFG.view.h - ry);
    g.vy = atFloor ? -60 : 60;
    if (g.edgeCd <= 0) {
      g.edgeCd = 0.6;
      Energy.add(g.energy, -CFG.energy.edgeHit);
      Score.breakCombo(g.score);
      g.flash = 0.15;
    }
    if (g.status === "falling" && atFloor) return die(g, "energy");
  }

  // ── 스폰·컬링 ───────────────────────────────────────────
  g.spawner.ensure(g.worldX, phase, g.special?.kind ?? null, base);
  g.spawner.cull(g.worldX);

  // ── 엔티티 판정 ─────────────────────────────────────────
  g.iFrame = Math.max(0, g.iFrame - dt);
  g.rainbow = Math.max(0, g.rainbow - dt);
  g.slow = Math.max(0, g.slow - dt);
  g.sizeTween = Math.min(1, g.sizeTween + dt / CFG.size.changeTweenSec);
  g.nextGate = null;

  for (const s of g.spawner.entities) {
    if (s.gone) continue;
    const sx = s.x - g.worldX;
    const right = sx + s.w;

    if (s.e.t === "gate") {
      // 예고 칩: 앞쪽 previewSec 안에 들어온 첫 게이트
      const previewDist = (g.phaseMax >= 4 ? CFG.color.previewSecLate : CFG.color.previewSec) * g.scroll;
      if (!g.nextGate && !s.judged && sx > OWL_X && sx - OWL_X < previewDist) g.nextGate = s.e.color;

      if (!s.judged && sx <= OWL_X + rx && right >= OWL_X - rx) {
        // 게이트 세로 범위 안에 있을 때만 판정
        if (g.y >= s.e.y && g.y <= s.e.y + s.e.h) {
          s.judged = true;
          if (!(g.rainbow > 0 || g.color === s.e.color)) {
            // 색 불일치 — 죽지 않는다 (§4)
            Energy.add(g.energy, -CFG.energy.gateFail);
            Score.breakCombo(g.score);
            g.slow = CFG.color.failSlowSec;
            g.iFrame = Math.max(g.iFrame, CFG.color.iFrame);
            g.flash = 0.25;
            g.shake = 0.2;
            burst(g, OWL_X, g.y, "#FF4D4D", 14);
            s.touched = true;
          }
        }
      }
    } else if (s.e.t === "item") {
      const cx = sx + CFG.entity.itemR;
      const cy = s.e.y;
      const magnet = CFG.size.magnet[g.size];
      if (Math.hypot(cx - OWL_X, cy - g.y) <= magnet) {
        s.gone = true;
        collectItem(g, s.e.kind);
      }
    } else if (right > OWL_X - rx - 4 && sx < OWL_X + rx + 4) {
      const t = (OWL_X + g.worldX - s.chunkX) / s.chunkScroll;
      let minD = Infinity;
      for (const r of solidRects(s.e, sx, g.size, t)) {
        minD = Math.min(minD, ellipseRectDistance(OWL_X, g.y, rx, ry, r));
      }
      s.minDist = Math.min(s.minDist ?? Infinity, minD);
      if (minD === 0) {
        if (s.e.t === "wall" && g.size === "L") {
          // L 전용 파괴 벽
          s.gone = true;
          g.score.itemScore += CFG.score.breakWall;
          g.shake = 0.25;
          burst(g, OWL_X + 20, g.y, "#FFB020", 18);
        } else if (g.iFrame > 0) {
          // 무적 중
        } else if (g.shield) {
          g.shield = false;
          g.iFrame = CFG.color.iFrame;
          s.gone = s.e.t === "bug";
          g.flash = 0.2;
          g.shake = 0.25;
          burst(g, OWL_X, g.y, "#3DD9EB", 20);
        } else {
          return die(g, "wall");
        }
      }
    }

    // 통과 처리
    if (!s.passed && right < OWL_X - rx) {
      s.passed = true;
      const scoring = s.e.t !== "item" && !(s.e.t === "gate" && s.touched);
      if (scoring) {
        Score.onPass(g.score, g.special?.kind ?? null, s.e.t === "gate");
        Energy.add(g.energy, CFG.energy.passGain);
        if (s.e.t !== "gate" && s.minDist !== undefined && isNearMiss(s.minDist)) {
          Score.onNearMiss(g.score, g.special?.kind ?? null);
          Energy.add(g.energy, CFG.energy.nearGain);
          burst(g, OWL_X - 10, g.y, "#6BF0A0", 6);
        }
      }
    }
  }

  // ── 에너지 고갈 / 추락 ──────────────────────────────────
  if (g.status === "playing" && g.energy.value <= 0) {
    g.status = "falling";
    g.fallT = CFG.energy.fallGraceSec;
    Score.breakCombo(g.score);
    g.banner = { text: "🪫 에너지 고갈", sub: "에너지를 먹으면 살아난다", until: g.time + 1.2 };
  } else if (g.status === "falling") {
    g.fallT -= dt;
    if (g.energy.value > 0) {
      g.status = "playing";
      g.banner = { text: "🪶 부활!", until: g.time + 1 };
    } else if (g.fallT <= 0) {
      return die(g, "energy");
    }
  }

  tickEffects(g, dt);
}

function collectItem(g: Game, kind: ItemKind): void {
  Score.onItem(g.score, kind, g.special?.kind ?? null);
  switch (kind) {
    case "feather":
      Energy.add(g.energy, g.status === "falling" ? CFG.energy.reviveTo : CFG.energy.feather);
      break;
    case "bigFeather":
      Energy.add(g.energy, g.status === "falling" ? CFG.energy.reviveTo : CFG.energy.bigFeather);
      break;
    case "grow":
      changeSize(g, growSize(g.size));
      break;
    case "shrink":
      changeSize(g, shrinkSize(g.size));
      break;
    case "shield":
      g.shield = true;
      break;
    case "efficiency":
      g.energy.efficiency = CFG.energy.efficiencySec;
      break;
    case "rainbow":
      g.rainbow = CFG.rainbow.sec;
      break;
    case "gem":
    case "star":
      break;
  }
  burst(g, OWL_X, g.y, "#FFD27A", 10);
}

function changeSize(g: Game, size: SizeKey): void {
  if (size === g.size) return;
  g.size = size;
  Energy.setSize(g.energy, size);
  g.sizeTween = 0;
  g.iFrame = Math.max(g.iFrame, CFG.size.changeIFrame);
}

function die(g: Game, cause: DeathCause): void {
  g.status = "dead";
  g.deathCause = cause;
  g.deathAt = 0;
  g.shake = 0.4;
  g.flash = 0.3;
  burst(g, OWL_X, g.y, cause === "wall" ? "#FF5C7A" : "#8D97BA", 28);
}

function tickEffects(g: Game, dt: number): void {
  g.flash = Math.max(0, g.flash - dt);
  g.shake = Math.max(0, g.shake - dt);
  for (let i = g.particles.length - 1; i >= 0; i--) {
    const p = g.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 420 * dt;
    if (p.life <= 0) g.particles.splice(i, 1);
  }
  if (g.banner && g.time > g.banner.until) g.banner = null;
}

export function burst(g: Game, x: number, y: number, color: string, count: number): void {
  // 파티클 상한 128 (§14)
  const room = Math.max(0, 128 - g.particles.length);
  for (let i = 0; i < Math.min(count, room); i++) {
    const a = (Math.PI * 2 * i) / count + g.rand();
    const sp = 80 + g.rand() * 200;
    g.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.45, max: 0.45, color, r: 2 + g.rand() * 2 });
  }
}

export function currentRaw(g: Game, includeEnergy = true): number {
  return Score.rawScore({
    meters: Math.floor(g.meters),
    turboMeters: Math.floor(g.turboMeters),
    s: g.score,
    energyLeft: Math.round(g.energy.value),
    includeEnergy,
  });
}

export function finalStats(g: Game): FlightStats {
  return Score.buildStats({
    meters: g.meters,
    durationSec: g.time,
    turboMeters: g.turboMeters,
    s: g.score,
    energyLeft: g.energy.value,
    phaseMax: g.phaseMax,
    size: g.size,
  });
}

export { bugY };
export type { Entity };
