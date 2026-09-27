// 🦉 아울 서바이버즈 v3 — 점수·메타 (기획서 §11)
// 서버가 같은 식으로 다시 계산한다. 여기 수식을 바꾸면 마이그레이션도 같이 바꿔야 한다.

import { CFG } from "../config";
import { buildSummary } from "./levelup";
import type { World } from "./world";
import type { SurviveMeta } from "../types";

export const BUILD = "3.0.0";

/**
 * raw = 처치×3 + 생존초×2 + 레벨×40 + 진화×300 + (도달 단계-1)×200
 *       + 보스×800 + 장애물×8 + 무피격 500
 *
 * v2 의 "스테이지 배율"은 없앴다 — 한 런에서 단계를 올라가는 구조라 단계 자체가 점수가 된다.
 */
export function rawScore(w: World): number {
  const s = CFG.score;
  const base =
    w.run.kills * s.perKill +
    Math.floor(w.t) * s.perSec +
    w.player.level * s.perLevel +
    w.run.evolutions * s.perEvolution +
    (Math.max(1, w.stage) - 1) * s.perStage +
    w.run.bosses * s.perBoss +
    w.run.obstacles * s.perObstacle +
    (w.run.damageTaken === 0 ? s.noDamage : 0);
  return Math.max(0, Math.round(base));
}

export function buildMeta(w: World, device: "mobile" | "desktop"): SurviveMeta {
  return {
    stage: w.stage,
    cleared: w.cleared,
    bosses: w.run.bosses,
    duration_s: Math.round(w.t * 10) / 10,
    kills: w.run.kills,
    level: w.player.level,
    evolutions: w.run.evolutions,
    obstacles: w.run.obstacles,
    damage_taken: w.run.damageTaken,
    revives_used: w.run.revivesUsed,
    theme: w.themeId,
    build: buildSummary(w),
    device,
    owl_energy_found: w.owlEnergyFound,
    v: BUILD,
  };
}

/** 🦉 아울 에너지 드랍 — 첫 보스(육각형)를 넘긴 판에서만 가끔 (서버 조건과 동일) */
export function rollOwlEnergy(w: World): void {
  if (w.owlEnergyFound) return;
  if (w.stage < CFG.owlEnergy.minStage) return;
  if (w.rand() < CFG.owlEnergy.chance) w.owlEnergyFound = true;
}
