// 🧩 아울리스 — 서버로 보내는 메타 · 렌더로 넘기는 이펙트

import type { Msg } from "@/games/core/i18n";

/**
 * submit_game_session 으로 보내는 메타. 서버가 이 값으로 거부 여부를 판단하고 원점수를 다시 계산한다
 * (supabase/migrations/20261002000000_owlis.sql).
 */
export type OwlisMeta = {
  /** 생존 시간 (초) — 서버는 자기 경과시간과 비교해 짧은 쪽을 쓴다 */
  duration_s: number;
  /** 굳힌 블록 수 (두 칸짜리) */
  pieces: number;
  /** 터뜨린 색 블록 수 — 블록 수 × 2 를 넘을 수 없다 */
  cleared: number;
  garbage_cleared: number;
  /** 연쇄가 한 번이라도 난 횟수 */
  chains: number;
  max_combo: number;
  avg_combo: number;
  attack_sent: number;
  attack_received: number;
  counters: number;
  emergencies: number;
  ko: number;
  fevers: number;
  /** 도달한 최고 내부 난이도 (소수 둘째 자리) — 표시 LEVEL 은 여기서 나온다 */
  level_max: number;
  level_label: string;
  /** 블록을 터뜨려 번 점수 합 (연쇄 배율·AI 배율·피버 포함) */
  clear_score: number;
  end: "topout" | "time";
  owl_energy_found: boolean;
  device: "mobile" | "desktop";
  v: string;
};

/** 렌더가 받아 가는 순간 이펙트 (엔진은 목록에 넣기만 한다) */
export type Fx =
  | { k: "clear"; side: 0 | 1; chain: number; x: number; y: number; pts: number }
  | { k: "send"; from: 0 | 1; cells: number }
  | { k: "garbage"; side: 0 | 1; cells: number }
  | { k: "lock"; side: 0 | 1 }
  | { k: "ko" }
  | { k: "dead" };

export type Banner = { m: Msg; sub?: Msg; t: number; tone: "cyan" | "violet" | "red" | "gold" };
