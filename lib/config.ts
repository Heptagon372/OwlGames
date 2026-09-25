// app_config 키 타입과 기본값 (마이그레이션 시드와 동일).
// 서버에서 읽지 못하면 이 값으로 화면을 그린다.

import type { GameId } from "./types";
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

/** 첫 관리자를 만들 수 있는 학번 (bootstrap_only = 관리자가 한 명도 없을 때만 동작) */
export type MasterAdmin = { student_ids: string[]; bootstrap_only: boolean };

export type AppConfig = {
  open_hours: OpenHours;
  force_open: ForceOpen;
  level_curve: LevelCurve;
  game_k: Record<GameId, number>;
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
  game_k: { typer: 4, flight: 20, phish: 10, logic: 20, survive: 20 },
  game_limits: {
    typer: { min_sec: 10, max_sec: 65 },
    flight: { min_sec: 3, max_sec: 185 },
    phish: { min_sec: 20, max_sec: 95 },
    logic: { min_sec: 10, max_sec: 185 },
    survive: { min_sec: 20, max_sec: 200 },
  },
  gacha_table: {
    "1": [0.01, 0.5, 3, 10, 20],
    "2": [0.02, 0.8, 4, 12, 23],
    "3": [0.03, 1.2, 5, 14, 26],
    "4": [0.05, 1.6, 6.5, 16, 28],
    "5": [0.08, 2.2, 8, 18, 30],
    "6": [0.1, 3.0, 10, 20, 32],
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
export const PLACE_EMOJI = ["🖥️", "🖱️", "🟫", "🍪", "🍬"] as const;
