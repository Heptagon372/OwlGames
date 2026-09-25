// 점수·메타 (기획서 §9) — 서버가 같은 공식으로 재계산해 검증한다.
import { CFG, stageById } from "../config";
import type { SurviveMeta } from "../types";
import type { World } from "./world";

export const BUILD_VERSION = "1.0.0";

export function survivedSec(w: World): number {
  return Math.min(CFG.runSec, Math.round(w.t * 10) / 10);
}

export function rawScore(w: World): number {
  const st = stageById(w.stage);
  const s = CFG.score;
  const base =
    w.run.kills * s.perKill +
    survivedSec(w) * s.perSec +
    w.player.level * s.perLevel +
    w.run.evolutions * s.perEvolution +
    w.run.eliteKills * s.perElite +
    (w.run.bossKilled ? s.boss : 0) +
    w.run.zonesCleared * s.perZone;
  return Math.max(0, Math.round(base * st.scoreMult));
}

/** 결과 화면에 보여줄 빌드 요약 (무기 → 패시브 순) */
export function buildSummary(w: World): string[] {
  const out: string[] = [];
  for (const weapon of w.weapons) out.push(weapon.evolved ?? weapon.id);
  for (const [id, level] of Object.entries(w.passives)) {
    if (level) out.push(`${id}${level}`);
  }
  return out;
}

export function buildMeta(w: World): SurviveMeta {
  return {
    duration_s: survivedSec(w),
    kills: w.run.kills,
    level: w.player.level,
    evolutions: w.run.evolutions,
    elite_kills: w.run.eliteKills,
    boss_killed: w.run.bossKilled,
    zones_cleared: w.run.zonesCleared,
    stage: w.stage,
    damage_taken: Math.round(w.run.damageTaken),
    build: buildSummary(w),
    owl_energy_found: w.run.owlEnergyFound,
    v: BUILD_VERSION,
  };
}
