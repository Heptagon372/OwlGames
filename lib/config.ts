// app_config 키 타입과 기본값 (마이그레이션 시드와 동일).
// 서버에서 읽지 못하면 이 값으로 화면을 그린다.

import type { GameId, OwlEnergy } from "./types";
import type { LevelCurve } from "./rank";

export type OpenHours = { start: string; end: string; tz: string };
export type ForceOpen = "auto" | "open" | "closed";
export type GameLimits = Record<GameId, { min_sec: number; max_sec: number }>;
/** 티어("1"~"11") → [1등, 2등, …, 6등] 확률(%). 남는 몫이 꽝 */
export type GachaTable = Record<string, number[]>;
export type BoothLocation = {
  building: string;
  floor: string;
  spot: string;
  map_url: string | null;
  note?: string;
};

export type OwlEnergyConfig = {
  regen_min: number;
  cap: number;
  hard_cap: number;
  cost: number;
  drop_min_phase: number;
  drop_min_distance: number;
  drop_daily_cap: number;
};

/** 포인트 식 (20261007_points_v2 · public.game_points 와 같은 값): 기본 + 분당 × 플레이 분 + 원점수 ÷ K */
export type GamePoints = { base: number; per_min: Record<GameId, number> };

/** 로비 카운트다운 (20261016_countdown). ends_at = ISO 8601(시간대 포함). 표시 전용 */
export type Countdown = { enabled: boolean; ends_at: string };

/** 첫 관리자를 만들 수 있는 학번 (bootstrap_only = 관리자가 한 명도 없을 때만 동작) */
export type MasterAdmin = { student_ids: string[]; bootstrap_only: boolean };

export type AppConfig = {
  open_hours: OpenHours;
  force_open: ForceOpen;
  level_curve: LevelCurve;
  game_k: Record<GameId, number>;
  game_points: GamePoints;
  game_limits: GameLimits;
  gacha_table: GachaTable;
  booth_location: BoothLocation;
  student_id_pattern: string;
  redeem_code_ttl_min: number;
  owl_energy: OwlEnergyConfig;
  master_admin: MasterAdmin;
  /** 가입 자동 승인 (관리자 → 가입 승인 탭). 켜면 새 가입자가 바로 verified (20261013_balance_v4) */
  auto_approve: boolean;
  countdown: Countdown;
};

export const DEFAULT_CONFIG: AppConfig = {
  open_hours: { start: "09:00", end: "18:00", tz: "Asia/Seoul" },
  force_open: "auto",
  // Lv 100 = 49,500P = 챌린저 (20261020_rank_v2 · lib/rank.ts 의 DEFAULT_CURVE)
  level_curve: { base: 50, step: 9 },
  game_k: { flight: 100, survive: 20, owlis: 40, chef: 200 },
  // 난이도: 아울리스 < 레스토랑 < 서바이버즈 ≤ 아울러닝 → 어려울수록 분당 포인트가 크다
  game_points: { base: 50, per_min: { owlis: 8, chef: 10, survive: 12, flight: 22 } },
  game_limits: {
    flight: { min_sec: 3, max_sec: 660 },
    survive: { min_sec: 20, max_sec: 2460 },
    owlis: { min_sec: 10, max_sec: 1860 },
    chef: { min_sec: 15, max_sec: 1270 },
  },
  // [1등, 2등, 3등, 4등, 5등, 6등] · 나머지가 꽝 (DB 기본값과 같아야 한다 — 20261020_rank_v2 · DECISIONS §5-47)
  // 한 줄 안에서 1등 < 2등 < … < 6등 < 꽝. 1등 0.1% → 5%(챌린저) · 꽝 49.9% → 25%
  gacha_table: {
    "1": [0.1, 1, 3, 6, 15, 25],
    "2": [0.5, 1.6, 3.7, 6.8, 15.3, 24.6],
    "3": [1, 2.2, 4.4, 7.6, 15.6, 24.2],
    "4": [1.5, 2.8, 5.1, 8.4, 15.9, 23.8],
    "5": [2, 3.4, 5.8, 9.2, 16.2, 23.4],
    "6": [2.5, 4, 6.5, 10, 16.5, 23],
    "7": [3, 4.6, 7.2, 10.8, 16.8, 22.6],
    "8": [3.5, 5.2, 7.9, 11.6, 17.1, 22.2],
    "9": [4, 5.8, 8.6, 12.4, 17.4, 21.8],
    "10": [4.5, 6.4, 9.3, 13.2, 17.7, 21.4],
    "11": [5, 7, 10, 14, 18, 21],
  },
  booth_location: {
    building: "(미정) 건물",
    floor: "1층",
    spot: "S.OWL 부스",
    map_url: null,
    note: "부스 위치는 행사 전 공지됩니다",
  },
  student_id_pattern: "^[0-9]{9}$",
  redeem_code_ttl_min: 10,
  owl_energy: {
    regen_min: 10,
    cap: 10,
    hard_cap: 20,
    cost: 1,
    drop_min_phase: 3,
    drop_min_distance: 900,
    drop_daily_cap: 5,
  },
  master_admin: { student_ids: ["999999999"], bootstrap_only: true },
  auto_approve: false,
  countdown: { enabled: true, ends_at: "2026-09-29T18:00:00+09:00" },
};

export function mergeConfig(rows: { key: string; value: unknown }[] | null | undefined): AppConfig {
  // structuredClone은 iOS 15.3 이하에 없어서 JSON 복제로 폴백
  const cfg: AppConfig =
    typeof structuredClone === "function"
      ? structuredClone(DEFAULT_CONFIG)
      : (JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as AppConfig);
  for (const row of rows ?? []) {
    if (row.key in cfg) (cfg as Record<string, unknown>)[row.key] = row.value;
  }
  return cfg;
}

/** 에너지 상태를 못 읽었을 때 보여줄 값 (0개 — 서버가 판정하기 전에는 있다고 가정하지 않는다) */
export function emptyEnergy(cfg: OwlEnergyConfig): OwlEnergy {
  return {
    energy: 0,
    cap: cfg.cap,
    hard_cap: cfg.hard_cap,
    cost: cfg.cost,
    next_refill_sec: 0,
    full_in_sec: 0,
  };
}

/** 운영시간 판정 (표시용 — 최종 판단은 서버 is_open()) */
export function isOpenNow(cfg: Pick<AppConfig, "open_hours" | "force_open">, now: Date = new Date()): boolean {
  if (cfg.force_open === "open") return true;
  if (cfg.force_open === "closed") return false;
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: cfg.open_hours.tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return hm >= cfg.open_hours.start && hm < cfg.open_hours.end;
}

export const PLACE_LABEL = ["1등", "2등", "3등", "4등", "5등"] as const;
export const PLACE_EMOJI = ["🖥️", "🖱️", "⌨️", "🔑", "🍪", "🍬"] as const;
