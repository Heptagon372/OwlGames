// 점수·콤보·메타 집계 (기획서 §11)
import { CFG, comboMult, type SizeKey } from "../config";
import type { FlightStats, ItemKind } from "../types";
import type { SpecialKind } from "./phases";

export const BUILD = "1.0.0";

export const ITEM_SCORE: Record<ItemKind, number> = {
  feather: 10,
  bigFeather: 30,
  grow: 20,
  shrink: 20,
  shield: 40,
  efficiency: 30,
  rainbow: 60,
  gem: 150,
  star: 50,
  owlEnergy: CFG.owlEnergy.score,
};

export type ScoreState = {
  combo: number;
  comboMax: number;
  passCount: number;
  nearMiss: number;
  items: number;
  itemScore: number;
  passScore: number;
  nearScore: number;
  specialCleared: number;
  /** 특수 구간 배율로 추가로 얻은 점수 (서버 재계산에 함께 보낸다) */
  bonusScore: number;
  /** 콤보 배율 평균 계산용 */
  multSum: number;
  multCount: number;
};

export function initScore(): ScoreState {
  return {
    combo: 0,
    comboMax: 0,
    passCount: 0,
    nearMiss: 0,
    items: 0,
    itemScore: 0,
    passScore: 0,
    nearScore: 0,
    specialCleared: 0,
    bonusScore: 0,
    multSum: 0,
    multCount: 0,
  };
}

export function onPass(s: ScoreState, special: SpecialKind | null, isGate: boolean): number {
  s.combo += 1;
  s.comboMax = Math.max(s.comboMax, s.combo);
  s.passCount += 1;
  const mult = comboMult(s.combo);
  s.multSum += mult;
  s.multCount += 1;
  const bonus = special === "colorRush" && isGate ? 2 : 1;
  const base = CFG.score.perPass * mult;
  const gained = base * bonus;
  s.passScore += gained;
  s.bonusScore += gained - base;
  return gained;
}

export function onNearMiss(s: ScoreState, special: SpecialKind | null): number {
  s.nearMiss += 1;
  const mult = comboMult(s.combo);
  const bonus = special === "night" ? 2 : 1;
  const base = CFG.score.nearMiss * mult;
  const gained = base * bonus;
  s.nearScore += gained;
  s.bonusScore += gained - base;
  return gained;
}

export function onItem(s: ScoreState, kind: ItemKind, special: SpecialKind | null): number {
  s.items += 1;
  const bonus = special === "featherStorm" ? 1.5 : 1;
  const gained = ITEM_SCORE[kind] * bonus;
  s.itemScore += gained;
  s.bonusScore += gained - ITEM_SCORE[kind];
  return gained;
}

export function breakCombo(s: ScoreState): void {
  s.combo = 0;
}

/** 거리 점수 (TURBO 구간은 ×2) */
export function distanceScore(meters: number, turboMeters: number): number {
  return meters * CFG.score.perMeter + turboMeters * CFG.score.perMeter;
}

export function rawScore(args: {
  meters: number;
  turboMeters: number;
  s: ScoreState;
  energyLeft: number;
  /** 남은 에너지 보너스는 종료 시에만 더한다 (HUD 점수가 날갯짓마다 줄어 보이지 않게) */
  includeEnergy?: boolean;
}): number {
  const { meters, turboMeters, s, energyLeft, includeEnergy = true } = args;
  return Math.max(
    0,
    Math.round(
      distanceScore(meters, turboMeters) +
        s.passScore +
        s.nearScore +
        s.itemScore +
        s.specialCleared * CFG.score.specialClear +
        (includeEnergy ? energyLeft * CFG.score.energyLeft : 0),
    ),
  );
}

/** 특수 구간 배율로 추가된 점수 (TURBO 거리 보너스 포함) */
export function specialBonusScore(s: ScoreState, turboMeters: number): number {
  return Math.round(s.bonusScore + turboMeters * CFG.score.perMeter);
}

export function buildStats(args: {
  meters: number;
  durationSec: number;
  turboMeters: number;
  s: ScoreState;
  energyLeft: number;
  phaseMax: number;
  size: SizeKey;
  owlEnergyFound: boolean;
}): FlightStats {
  const { meters, durationSec, turboMeters, s, energyLeft, phaseMax, size, owlEnergyFound } = args;
  return {
    distance_m: Math.floor(meters),
    duration_s: Math.round(durationSec * 10) / 10,
    pass_count: s.passCount,
    near_miss: s.nearMiss,
    combo_max: s.comboMax,
    combo_mult_avg: s.multCount ? Math.round((s.multSum / s.multCount) * 100) / 100 : 1,
    items: s.items,
    item_score: Math.round(s.itemScore),
    energy_left: Math.round(energyLeft),
    phase_max: phaseMax,
    special_cleared: s.specialCleared,
    special_bonus_score: specialBonusScore(s, turboMeters),
    owl_energy_found: owlEnergyFound,
    size_end: size,
    build: BUILD,
  };
}
