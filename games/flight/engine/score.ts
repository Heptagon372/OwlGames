// 점수·콤보·메타 집계 (기획서 §11 + 2.0 §28)
//
// raw = 거리 + 통과×10×콤보배율 + NEAR MISS×50×콤보배율 + PERFECT×40 + 아이템 기본점수
//     + 남은 에너지×2 + bonus
// bonus = 배율(FEVER·SCORE×2·OVERDRIVE·색 체인·DANGER·터보·팬텀 월드)로 더 번 몫 + 고정 보너스
//         (체인·단계 완주·∞ 진입·미사일 파괴·벽 부수기·깃털 비 연속). 서버가 상한을 건다.
// 서버 재계산식(supabase/migrations/20261002000000_owlrunning_v2.sql)과 같은 식이어야 한다.
import { CFG, comboMult, type SizeKey } from "../config";
import type { FlightStats, ItemKind, ItemTier } from "../types";

export const BUILD = "2.0.0";

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
  magnet: 40,
  double: 40,
  rage: 80,
  phantom: 80,
  crown: 100,
  golden: CFG.events.goldenScore,
};

export const ITEM_TIER: Record<ItemKind, ItemTier> = {
  feather: "common",
  star: "common",
  gem: "common",
  grow: "common",
  shrink: "common",
  bigFeather: "rare",
  shield: "rare",
  efficiency: "rare",
  rainbow: "rare",
  magnet: "rare",
  double: "rare",
  owlEnergy: "rare",
  rage: "legendary",
  phantom: "legendary",
  crown: "legendary",
  golden: "legendary",
};

export type ScoreState = {
  combo: number;
  comboMax: number;
  passCount: number;
  nearMiss: number;
  perfect: number;
  items: number;
  /** 아이템 기본 점수 합 (배율 제외) */
  itemScore: number;
  passScore: number;
  nearScore: number;
  /** 배율·고정 보너스로 더 번 점수 */
  bonusScore: number;
  /** 콤보 배율 평균 계산용 */
  multSum: number;
  multCount: number;
  feverCount: number;
  powerCount: number;
  events: number;
};

export function initScore(): ScoreState {
  return {
    combo: 0,
    comboMax: 0,
    passCount: 0,
    nearMiss: 0,
    perfect: 0,
    items: 0,
    itemScore: 0,
    passScore: 0,
    nearScore: 0,
    bonusScore: 0,
    multSum: 0,
    multCount: 0,
    feverCount: 0,
    powerCount: 0,
    events: 0,
  };
}

/** 배율 몫을 bonus 로 — 돌려주는 값은 화면에 띄울 총점 */
function withMult(s: ScoreState, base: number, mult: number): number {
  const m = Math.max(1, Math.min(CFG.multCap, mult));
  s.bonusScore += base * (m - 1);
  return base * m;
}

/** 장애물·게이트 통과. `mult` = 지금 켜져 있는 점수 배율 */
export function onPass(s: ScoreState, mult = 1): number {
  s.combo += 1;
  s.comboMax = Math.max(s.comboMax, s.combo);
  s.passCount += 1;
  const cm = comboMult(s.combo);
  s.multSum += cm;
  s.multCount += 1;
  const base = CFG.score.perPass * cm;
  s.passScore += base;
  return withMult(s, base, mult);
}

export function onNearMiss(s: ScoreState, mult = 1): number {
  s.nearMiss += 1;
  const cm = comboMult(s.combo);
  s.multSum += cm;
  s.multCount += 1;
  const base = CFG.score.nearMiss * cm;
  s.nearScore += base;
  return withMult(s, base, mult);
}

/** 색 게이트 PERFECT (+40) */
export function onPerfect(s: ScoreState, mult = 1): number {
  s.perfect += 1;
  return withMult(s, CFG.perfect.score, mult);
}

export function onItem(s: ScoreState, kind: ItemKind, mult = 1): number {
  s.items += 1;
  const base = ITEM_SCORE[kind];
  s.itemScore += base;
  return withMult(s, base, mult);
}

/** 고정 보너스 (체인·단계 완주·미사일 파괴 …) — 배율을 곱해서 넣는다 */
export function addBonus(s: ScoreState, amount: number, mult = 1): number {
  const v = amount * Math.max(1, Math.min(CFG.multCap, mult));
  s.bonusScore += v;
  return v;
}

export function breakCombo(s: ScoreState): void {
  s.combo = 0;
}

export function rawScore(args: {
  meters: number;
  s: ScoreState;
  energyLeft: number;
  /** 남은 에너지 보너스는 종료 시에만 더한다 (HUD 점수가 날갯짓마다 줄어 보이지 않게) */
  includeEnergy?: boolean;
}): number {
  const { meters, s, energyLeft, includeEnergy = true } = args;
  return Math.max(
    0,
    Math.round(
      meters * CFG.score.perMeter +
        s.passScore +
        s.nearScore +
        s.perfect * CFG.perfect.score +
        s.itemScore +
        s.bonusScore +
        (includeEnergy ? energyLeft * CFG.score.energyLeft : 0),
    ),
  );
}

export function buildStats(args: {
  meters: number;
  durationSec: number;
  s: ScoreState;
  energyLeft: number;
  phaseMax: number;
  stageMax: number;
  size: SizeKey;
  owlEnergyFound: boolean;
}): FlightStats {
  const { meters, durationSec, s, energyLeft, phaseMax, stageMax, size, owlEnergyFound } = args;
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
    stage_max: stageMax,
    perfect_count: s.perfect,
    fever_count: s.feverCount,
    power_count: s.powerCount,
    special_cleared: s.events,
    bonus_score: Math.round(s.bonusScore),
    owl_energy_found: owlEnergyFound,
    size_end: size,
    build: BUILD,
  };
}
