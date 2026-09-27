// 🍳 아울 레스토랑 — 서버에 보내는 메타 (supabase/migrations/20261005000000_chef.sql 의 chef_* 헬퍼가 읽는다)

export type ChefMeta = {
  duration_s: number;
  /** 낸 접시 수 (코스·×2 는 접시마다) */
  served_total: number;
  /** 별 1~5 접시 수 */
  served_by_star: [number, number, number, number, number];
  /** 끝낸 주문 수 — 단계는 이 값으로 정해진다 */
  orders: number;
  courses: number;
  doubles: number;
  rejects: number;
  bug_fails: number;
  max_combo: number;
  perfects: number;
  hotfixes: number;
  clean_builds: number;
  clean_orders: number;
  undos: number;
  /** 도달 단계 (16 = ∞) */
  stage_max: number;
  /** ∞ 레벨 (∞ 전에는 0, 들어가면 1부터) */
  inf_level: number;
  /** 요리 점수 합 — 서버는 상한만 건다 */
  dish_score: number;
  /** PERFECT·HOTFIX·CLEAN BUILD·FULL STACK 합 — 서버는 상한만 건다 */
  bonus_score: number;
  /** 가장 많이 만든 음식 */
  top_dish: string | null;
  top_count: number;
  end: "patience" | "closing" | "quit";
  owl_energy_found: boolean;
  device: "mobile" | "desktop";
  v: string;
};
