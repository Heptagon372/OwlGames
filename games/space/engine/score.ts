// 🚀 아울스페이스 — 점수·메타 (기획서 §10)
// 서버가 같은 식으로 다시 계산한다. 여기 수식을 바꾸면 마이그레이션도 같이 바꿔야 한다.

import { CFG, stageScoreMult } from "../config";
import { buildSummary } from "./levelup";
import type { World } from "./world";
import type { SpaceMeta } from "../types";

export const BUILD = "1.0.0";

/**
 * raw = (처치×4 + 그레이즈×15 + 칩×2 + 생존초×5 + 보스×500 + 클리어×1000
 *        + 남은생명×300 + 무피격 600 + 남은봄×100) × 스테이지 배율
 */
export function rawScore(w: World): number {
  const s = CFG.score;
  const base =
    w.run.kills * s.perKill +
    w.run.graze * s.perGraze +
    w.run.chips * s.perChip +
    Math.floor(w.t) * s.perSec +
    (w.run.bossKilled ? s.bossKilled : 0) +
    (w.cleared ? s.stageCleared : 0) +
    Math.max(0, w.player.lives) * s.perLife +
    (w.run.damageTaken === 0 && w.cleared ? s.noMiss : 0) +
    Math.max(0, w.player.bombs) * s.perBombUnused;
  return Math.max(0, Math.round(base * stageScoreMult(w.stage)));
}

export function buildMeta(w: World, device: "mobile" | "desktop"): SpaceMeta {
  return {
    stage: w.stage,
    cleared: w.cleared,
    duration_s: Math.round(w.t * 10) / 10,
    kills: w.run.kills,
    graze: w.run.graze,
    chips: w.run.chips,
    lives_left: Math.max(0, w.player.lives),
    bombs_unused: Math.max(0, w.player.bombs),
    damage_taken: w.run.damageTaken,
    boss_killed: w.run.bossKilled,
    skills: buildSummary(w),
    theme: w.themeId,
    device,
    owl_energy_found: w.owlEnergyFound,
    v: BUILD,
  };
}

/** 🦉 아울 에너지 드랍 — 3스테이지 이상을 클리어했을 때만 (서버 조건과 동일) */
export function rollOwlEnergy(w: World): void {
  if (w.owlEnergyFound) return;
  if (CFG.owlEnergy.requireClear && !w.cleared) return;
  if (w.stage < CFG.owlEnergy.minStage) return;
  if (w.rand() < CFG.owlEnergy.chance) w.owlEnergyFound = true;
}
