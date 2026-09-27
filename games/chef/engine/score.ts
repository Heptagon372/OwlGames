// 🍳 아울 레스토랑 — 점수 · 메타 · 서버 식의 TS 사본 (GDD §29 · §32)
//
//   raw = 요리 점수(dish_score) + 보너스(bonus_score) + STAGE CLEAR 누계 + ∞ LV × 500
//
// 서버는 접시 하나하나를 모르니 요리·보너스 점수를 다시 만들 수 없다. 메타로 만들 수 있는 **상한**으로 깎고(아울리스 방식),
// STAGE CLEAR·∞ 는 정확히 다시 계산한다. 단계는 클라이언트 값을 믿지 않고 끝낸 주문 수로 다시 구한다.
// 여기 식을 바꾸면 20261005000000_chef.sql 의 chef_raw · chef_reject_reason 도 같이 바꾼다.

import { CFG, INF_STAGE, scoreMultOf, stageClearTotal, stageOf } from "../config";
import type { ChefMeta } from "../types";
import type { Game } from "./game";

export const BUILD = CFG.version;

function infBonus(infLevel: number): number {
  return CFG.score.infLevel * Math.max(0, infLevel - 1);
}

export function rawScore(g: Game): number {
  return Math.max(0, Math.round(g.dishScore + g.bonusScore + stageClearTotal(g.stage) + infBonus(g.infLevel)));
}

export function buildMeta(g: Game, device: "mobile" | "desktop", end?: ChefMeta["end"]): ChefMeta {
  const st = g.stats;
  let top: string | null = null;
  let topN = 0;
  for (const [id, n] of Object.entries(st.dishes)) {
    if ((n ?? 0) > topN) {
      topN = n ?? 0;
      top = id;
    }
  }
  return {
    duration_s: Math.round(g.t * 10) / 10,
    served_total: st.served,
    served_by_star: [...st.byStar],
    orders: st.orders,
    courses: st.courses,
    doubles: st.doubles,
    rejects: st.rejects,
    bug_fails: st.bugFails,
    max_combo: st.maxCombo,
    perfects: st.perfects,
    hotfixes: st.hotfixes,
    clean_builds: st.cleanBuilds,
    clean_orders: st.cleanOrders,
    undos: st.undos,
    stage_max: g.stage,
    inf_level: g.infLevel,
    dish_score: Math.round(g.dishScore),
    bonus_score: Math.round(g.bonusScore),
    top_dish: top,
    top_count: topN,
    end: end ?? g.end ?? "quit",
    owl_energy_found: g.owlEnergyFound,
    device,
    v: BUILD,
  };
}

/* ── 서버 식의 TS 사본 ──────────────────────────────────────── */

/** 요리 점수 상한 — 모든 접시가 인내도 100%·최대 콤보로 나갔다고 본다 */
export function dishCap(m: Pick<ChefMeta, "served_by_star" | "max_combo" | "orders" | "courses">): number {
  const s = CFG.score;
  const combo = s.combo * Math.min(Math.max(0, m.max_combo - 1), s.comboCap);
  const mult = scoreMultOf(stageOf(m.orders, m.courses));
  let sum = 0;
  for (let k = 0; k < 5; k++) sum += Math.max(0, m.served_by_star[k] ?? 0) * s.base[k + 1];
  return sum * (1 + s.fast + combo) * mult;
}

/** 보너스 상한 */
export function bonusCap(m: Pick<ChefMeta, "perfects" | "hotfixes" | "clean_orders" | "courses" | "orders">): number {
  const s = CFG.score;
  const mult = scoreMultOf(stageOf(m.orders, m.courses));
  return (m.perfects * s.perfect + m.hotfixes * s.hotfix + m.clean_orders * s.clean + m.courses * s.fullStack) * mult;
}

/** 서버가 다시 계산하는 원점수 */
export function serverRaw(m: ChefMeta): number {
  const stage = stageOf(m.orders, m.courses);
  const inf = stage >= INF_STAGE ? Math.max(1, m.inf_level) : 0;
  return Math.max(
    0,
    Math.min(Math.max(0, m.dish_score), dishCap(m)) +
      Math.min(Math.max(0, m.bonus_score), bonusCap(m)) +
      stageClearTotal(stage) +
      infBonus(inf),
  );
}

/** 서버 거부 기준 (app_config.game_guards.chef 기본값) */
export const GUARDS = {
  /** 테이블 3개를 동시에 돌려도 접시 하나에 최소 이만큼 */
  minSecPerPlate: 1.2,
} as const;

export function serverReject(m: ChefMeta, elapsed: number): string | null {
  const stars = m.served_by_star.reduce((a, b) => a + b, 0);
  if (
    [m.served_total, m.orders, m.courses, m.max_combo, m.perfects, m.hotfixes, m.clean_orders, m.clean_builds].some(
      (x) => !Number.isFinite(x) || x < 0,
    )
  )
    return "values";
  if (stars !== m.served_total) return "stars";
  if (m.served_total > elapsed / GUARDS.minSecPerPlate + 3) return "speed";
  if (m.orders > m.served_total || m.courses * 4 > m.served_total || m.courses > m.orders) return "orders";
  if (m.stage_max !== stageOf(m.orders, m.courses)) return "stage";
  if (m.stage_max >= INF_STAGE ? m.inf_level < 1 || m.inf_level > Math.floor(elapsed / CFG.infinite.levelSec) + 1 : m.inf_level !== 0)
    return "inf";
  if (m.max_combo > m.served_total || m.perfects > m.served_total || m.hotfixes > m.served_total) return "bonus";
  if (m.clean_orders > m.orders || m.clean_builds * 2 > m.clean_orders) return "clean";
  if (m.duration_s > elapsed + 2) return "duration";
  return null;
}
