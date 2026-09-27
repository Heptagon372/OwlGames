// 🧩 아울리스 — ScoreManager · 메타 (§24~§26, §35)
//
//   raw = 블록 점수(clear_score) + COUNTER×500 + EMERGENCY×300 + KO×1500 + 생존 보너스
//   블록 점수 = Σ 터진 블록 × 10 × 연쇄 배율 × AI LEVEL 배율 × 피버  +  Σ 40 × 연쇄² × (같은 배율)
//
// 서버는 연쇄 하나하나를 모르니 블록 점수를 다시 만들 수 없다. 대신 메타로 만들 수 있는 **상한**을 구해
// 그 위로는 깎고(clear_score 클램프), 나머지 항은 정확히 다시 계산한다.
// 여기 수식을 바꾸면 마이그레이션(20261002000000_owlis.sql)도 같이 바꾼다 — `serverRaw` 가 그 식의 TS 사본이다.

import { CFG, aiMult, comboMult, survivalBonus } from "../config";
import { levelLabel } from "./difficulty";
import type { Game } from "./game";
import type { OwlisMeta } from "../types";

export const BUILD = CFG.version;

export function rawScore(g: Game): number {
  const s = CFG.score;
  return Math.max(
    0,
    Math.round(g.clearScore) +
      g.counters * s.counter +
      g.emergencies * s.emergency +
      g.ko * s.ko +
      survivalBonus(Math.floor(g.t)),
  );
}

export function buildMeta(g: Game, device: "mobile" | "desktop"): OwlisMeta {
  const st = g.player.stats;
  return {
    duration_s: Math.round(g.t * 10) / 10,
    pieces: st.pieces,
    cleared: st.cleared,
    garbage_cleared: st.garbageCleared,
    chains: st.chains,
    max_combo: st.maxCombo,
    avg_combo: st.chains ? Math.round((st.comboSum / st.chains) * 100) / 100 : 0,
    attack_sent: st.sent,
    attack_received: st.received,
    counters: g.counters,
    emergencies: g.emergencies,
    ko: g.ko,
    fevers: g.fevers,
    level_max: Math.floor(g.diff.peak * 100) / 100,
    level_label: levelLabel(g.diff.peak),
    clear_score: Math.round(g.clearScore),
    end: g.end ?? "topout",
    owl_energy_found: g.owlEnergyFound,
    device,
    v: BUILD,
  };
}

/** 🦉 아울 에너지 드랍 — AI LEVEL 3 이상을 본 판에서만 가끔 (서버 조건과 동일) */
export function rollOwlEnergy(g: Game, rand: () => number = Math.random): void {
  if (g.owlEnergyFound) return;
  if (g.diff.peak < CFG.owlEnergy.minLevel) return;
  if (rand() < CFG.owlEnergy.chance) g.owlEnergyFound = true;
}

/* ── 서버 식의 TS 사본 (테스트가 SQL 과 같은 결과인지 대조한다) ─────────── */

/** 메타로 만들 수 있는 블록 점수 상한 */
export function clearScoreCap(m: Pick<OwlisMeta, "cleared" | "chains" | "max_combo" | "level_max">): number {
  const k = Math.max(1, m.max_combo);
  const mult = aiMult(m.level_max) * CFG.fever.scoreMult;
  return (m.cleared * CFG.score.cell * comboMult(k) + m.chains * CFG.score.chainBonus * k * k) * mult;
}

/** 서버가 다시 계산하는 원점수 (elapsed = 서버 경과시간) */
export function serverRaw(m: OwlisMeta, elapsed: number): number {
  const s = CFG.score;
  const clear = Math.min(Math.max(0, m.clear_score), clearScoreCap(m));
  const survived = Math.max(0, Math.min(m.duration_s, elapsed));
  return Math.max(
    0,
    clear +
      Math.min(m.counters, m.chains) * s.counter +
      Math.min(m.emergencies, m.chains) * s.emergency +
      m.ko * s.ko +
      survivalBonus(Math.floor(survived)),
  );
}

/** 서버 거부 기준 (app_config.game_guards.owlis 기본값) — 통과하면 null */
export const GUARDS = {
  maxPiecesPerSec: 4,
  maxCombo: 19,
  koMinSec: 20,
} as const;

export function serverReject(m: OwlisMeta, elapsed: number): string | null {
  const d = CFG.difficulty;
  if (m.pieces < 0 || m.pieces > elapsed * GUARDS.maxPiecesPerSec + 5) return "pieces";
  if (m.cleared > m.pieces * 2) return "cleared";
  if (m.max_combo > GUARDS.maxCombo || m.max_combo * CFG.matchMin > m.cleared) return "combo";
  if (m.chains * CFG.matchMin > m.cleared) return "chains";
  if (m.level_max > d.start + elapsed * (d.maxUp + d.timeRamp) + m.ko * d.koBump + 0.05) return "level";
  if (m.ko > Math.floor(elapsed / GUARDS.koMinSec) + 1) return "ko";
  if (m.counters > m.chains || m.emergencies > m.chains || m.fevers > m.chains) return "bonus";
  if (m.duration_s > elapsed + 2) return "duration";
  return null;
}
