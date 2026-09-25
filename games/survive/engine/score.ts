// 🦉 아울 서바이버즈 v2 — 점수·메타 (기획서 §11)
// 서버가 같은 식으로 다시 계산한다. 여기 수식을 바꾸면 마이그레이션도 같이 바꿔야 한다.

import { CFG, stageScoreMult } from "../config";
import { buildSummary } from "./levelup";
import type { World } from "./world";
import type { SurviveMeta } from "../types";

export const BUILD = "2.0.0";

/**
 * raw = (처치×3 + 생존초×6 + 레벨×40 + 진화×300 + 중간보스×250
 *        + 클리어×1000 + 장애물×8 + 무피격 500) × 스테이지 배율
 */
export function rawScore(w: World): number {
  const s = CFG.score;
  const base =
    w.run.kills * s.perKill +
    Math.floor(w.t) * s.perSec +
    w.player.level * s.perLevel +
    w.run.evolutions * s.perEvolution +
    (w.run.midbossKilled ? s.midboss : 0) +
    (w.cleared ? s.stageCleared : 0) +
    w.run.obstacles * s.perObstacle +
    (w.run.damageTaken === 0 ? s.noDamage : 0);
  return Math.max(0, Math.round(base * stageScoreMult(w.stage)));
}

export function buildMeta(w: World, device: "mobile" | "desktop"): SurviveMeta {
  return {
    stage: w.stage,
    cleared: w.cleared,
    duration_s: Math.round(w.t * 10) / 10,
    kills: w.run.kills,
    level: w.player.level,
    evolutions: w.run.evolutions,
    midboss: w.run.midbossKilled,
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

/** 🦉 아울 에너지 드랍 — 높은 스테이지를 클리어했을 때만 가끔 (서버 조건과 동일) */
export function rollOwlEnergy(w: World): void {
  if (w.owlEnergyFound) return;
  if (CFG.owlEnergy.requireClear && !w.cleared) return;
  if (w.stage < CFG.owlEnergy.minStage) return;
  if (w.rand() < CFG.owlEnergy.chance) w.owlEnergyFound = true;
}
