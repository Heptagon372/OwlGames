// app_config 키 타입과 기본값 (마이그레이션 시드와 동일).
// 서버에서 읽지 못하면 이 값으로 화면을 그린다.

import type { GameId, OwlEnergy } from "./types";
import type { LevelCurve } from "./rank";

export type OpenHours = { start: string; end: string; tz: string };
export type ForceOpen = "auto" | "open" | "closed";
export type GameLimits = Record<GameId, { min_sec: number; max_sec: number }>;
/** 티어("1"~"6") → [1등, 2등, 3등, 4등, 5등] 확률(%) */
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
};

export const DEFAULT_CONFIG: AppConfig = {
  open_hours: { start: "09:00", end: "18:00", tz: "Asia/Seoul" },
  force_open: "auto",
  level_curve: { base: 30, step: 5 },
  game_k: { flight: 100, survive: 20, owlis: 40, chef: 200 },
  // 난이도: 아울리스 < 레스토랑 < 서바이버즈 ≤ 아울러닝 → 어려울수록 분당 포인트가 크다
  game_points: { base: 50, per_min: { owlis: 8, chef: 10, survive: 12, flight: 15 } },
  game_limits: {
    flight: { min_sec: 3, max_sec: 185 },
    survive: { min_sec: 20, max_sec: 2400 },
    owlis: { min_sec: 10, max_sec: 1800 },
    chef: { min_sec: 15, max_sec: 1210 },
  },
  // [1등, 2등, 3등, 4등, 5등, 6등] · 나머지가 꽝 (DB 기본값과 같아야 한다 — §6 · DECISIONS §5-29)
  // 1등(게이밍 PC) 0.05% → 3% · 6등(젤리) 25% → 40% · 꽝 57.95% → 14%
  gacha_table: {
    "1": [0.05, 0.5, 1.5, 3, 12, 25],
    "2": [0.1, 0.8, 2, 4, 14, 28],
    "3": [0.3, 1.2, 3, 5, 16, 31],
    "4": [0.8, 1.8, 4, 6, 18, 34],
    "5": [1.5, 2.5, 5, 8, 20, 37],
    "6": [3, 4, 7, 10, 22, 40],
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
