"use client";

// 부스·전광판·관리자 화면에서 쓰는 브라우저 측 조회. Supabase 가 없으면 빈 값.

import { getBrowserSupabase } from "./supabase/client";
import {
  EMPTY_BOARD_STATS,
  type AuditRow,
  type BoardEvent,
  type BoardStats,
  type GameSessionRow,
  type LeaderboardRow,
  type PendingUser,
  type PrizeRow,
  type Profile,
} from "./types";

export async function fetchPendingUsers(): Promise<PendingUser[]> {
  const supabase = getBrowserSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from("profiles")
    .select("id, name, student_id, created_at")
    .eq("verified", false)
    .order("created_at", { ascending: true })
    .limit(100);
  return (data as PendingUser[] | null) ?? [];
}

export async function fetchUsers(query: string): Promise<Profile[]> {
  const supabase = getBrowserSupabase();
  if (!supabase) return [];
  let req = supabase.from("profiles").select("*").order("total_points", { ascending: false }).limit(50);
  const q = query.trim();
  if (q) req = req.or(`name.ilike.%${q}%,student_id.ilike.%${q}%`);
  const { data } = await req;
  return (data as Profile[] | null) ?? [];
}

/** 관리자 감사 로그 (admin_audit) — RLS 로 관리자만 읽힌다 */
export async function fetchAuditLog(limit = 50): Promise<AuditRow[]> {
  const supabase = getBrowserSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from("admin_audit")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as AuditRow[] | null) ?? [];
}

export async function fetchLeaderboard(limit = 10): Promise<LeaderboardRow[]> {
  const supabase = getBrowserSupabase();
  if (!supabase) return [];
  const { data } = await supabase.from("leaderboard").select("*").order("position").limit(limit);
  return (data as LeaderboardRow[] | null) ?? [];
}

export async function fetchStats(): Promise<BoardStats> {
  const supabase = getBrowserSupabase();
  if (!supabase) return EMPTY_BOARD_STATS;
  const { data } = await supabase.rpc("board_stats");
  return (data as BoardStats | null) ?? EMPTY_BOARD_STATS;
}

export async function fetchPrizes(): Promise<PrizeRow[]> {
  const supabase = getBrowserSupabase();
  if (!supabase) return [];
  const { data } = await supabase.from("prizes").select("*").order("place");
  return (data as PrizeRow[] | null) ?? [];
}

export async function fetchBoardEvents(limit = 20): Promise<BoardEvent[]> {
  const supabase = getBrowserSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from("board_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as BoardEvent[] | null) ?? [];
}

/** 지금 내 등수 (leaderboard 뷰) — 결과 화면·로비의 실시간 등수 표시용 */
export async function fetchMyPosition(): Promise<number | null> {
  const supabase = getBrowserSupabase();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("leaderboard").select("position").eq("user_id", user.id).maybeSingle();
  const pos = (data as { position?: number } | null)?.position;
  return typeof pos === "number" ? pos : null;
}

/**
 * 아울 서바이버즈 진행도 (v3) — profiles.meta.survive_stage / survive_theme.
 * `stage` 는 **지금까지 도달한 최고 단계**다 (0 = 아직 없음). 시작 화면의 최고 기록으로만 쓴다.
 */
export async function fetchSurviveProgress(): Promise<{ stage: number; theme: "dark" | "light" }> {
  const supabase = getBrowserSupabase();
  if (!supabase) return { stage: 0, theme: "dark" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { stage: 0, theme: "dark" };
  const { data } = await supabase.from("profiles").select("meta").eq("id", user.id).maybeSingle();
  const meta = (data?.meta ?? {}) as Record<string, unknown>;
  const raw = Number(meta.survive_stage ?? 0);
  const theme = meta.survive_theme === "light" ? "light" : "dark";
  return { stage: Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0, theme };
}

/** 아울리스 개인 기록 (§35) — profiles.meta.owlis_record. 서버가 제출 때 최고치만 갱신한다 */
export type OwlisRecord = {
  /** 최고 원점수 */
  best: number;
  /** 가장 오래 버틴 시간 (초) */
  sec: number;
  combo: number;
  /** 본 적 있는 최고 내부 난이도 (표시 LEVEL 은 lib 쪽에서 계산) */
  level: number;
  games: number;
};

export async function fetchOwlisRecord(): Promise<OwlisRecord> {
  const empty: OwlisRecord = { best: 0, sec: 0, combo: 0, level: 0, games: 0 };
  const supabase = getBrowserSupabase();
  if (!supabase) return empty;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;
  const { data } = await supabase.from("profiles").select("meta").eq("id", user.id).maybeSingle();
  const rec = ((data?.meta ?? {}) as Record<string, unknown>).owlis_record as Record<string, unknown> | undefined;
  if (!rec) return empty;
  const n = (k: string) => {
    const v = Number(rec[k] ?? 0);
    return Number.isFinite(v) ? Math.max(0, v) : 0;
  };
  return { best: n("best"), sec: n("sec"), combo: n("combo"), level: n("level"), games: n("games") };
}

/** 아울 레스토랑 개인 기록 — profiles.meta.chef_record. 서버가 제출 때 최고치만 갱신한다 */
export type ChefRecord = {
  best: number;
  /** 도달한 최고 단계 (16 = ∞) */
  stage: number;
  /** 그 판의 ∞ LV (∞ 에 들어간 적 없으면 0) */
  inf: number;
  combo: number;
  games: number;
};

export async function fetchChefRecord(): Promise<ChefRecord> {
  const empty: ChefRecord = { best: 0, stage: 0, inf: 0, combo: 0, games: 0 };
  const supabase = getBrowserSupabase();
  if (!supabase) return empty;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;
  const { data } = await supabase.from("profiles").select("meta").eq("id", user.id).maybeSingle();
  const rec = ((data?.meta ?? {}) as Record<string, unknown>).chef_record as Record<string, unknown> | undefined;
  if (!rec) return empty;
  const n = (k: string) => {
    const v = Number(rec[k] ?? 0);
    return Number.isFinite(v) ? Math.max(0, v) : 0;
  };
  return { best: n("best"), stage: n("stage"), inf: n("inf"), combo: n("combo"), games: n("games") };
}

export type UnclaimedDraw = {
  id: string;
  place: number | null;
  drawn_at: string;
  user_id: string;
  profiles?: { name: string; student_id: string } | null;
};

export async function fetchUnclaimedDraws(): Promise<UnclaimedDraw[]> {
  const supabase = getBrowserSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from("draws")
    // draws는 profiles를 user_id·staff_id 두 번 참조하므로 FK를 지정해야 한다 (PGRST201)
    .select("id, place, drawn_at, user_id, profiles!draws_user_id_fkey(name, student_id)")
    .eq("claimed", false)
    .not("place", "is", null)
    .order("drawn_at", { ascending: false })
    .limit(50);
  return (data as unknown as UnclaimedDraw[] | null) ?? [];
}

export async function fetchRejectedSessions(): Promise<GameSessionRow[]> {
  const supabase = getBrowserSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from("game_sessions")
    .select("*")
    .eq("status", "rejected")
    .order("started_at", { ascending: false })
    .limit(50);
  return (data as GameSessionRow[] | null) ?? [];
}
