"use client";

// 부스·전광판·관리자 화면에서 쓰는 브라우저 측 조회. 데모 모드면 가짜 데이터.

import {
  DEMO_ALL_USERS,
  DEMO_BOARD_EVENTS,
  DEMO_DRAWS,
  DEMO_LEADERBOARD,
  DEMO_PENDING,
  DEMO_PRIZES,
  DEMO_SESSIONS,
  DEMO_AUDIT,
  DEMO_STATS,
  type PendingUser,
} from "./demo";
import { getBrowserSupabase } from "./supabase/client";
import type {
  AuditRow,
  BoardEvent,
  BoardStats,
  GameSessionRow,
  LeaderboardRow,
  PrizeRow,
  Profile,
} from "./types";

export async function fetchPendingUsers(): Promise<PendingUser[]> {
  const supabase = getBrowserSupabase();
  if (!supabase) return DEMO_PENDING;
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
  if (!supabase) {
    const q = query.trim();
    return DEMO_ALL_USERS.filter((u) => !q || u.name.includes(q) || u.student_id.includes(q));
  }
  let req = supabase.from("profiles").select("*").order("total_points", { ascending: false }).limit(50);
  const q = query.trim();
  if (q) req = req.or(`name.ilike.%${q}%,student_id.ilike.%${q}%`);
  const { data } = await req;
  return (data as Profile[] | null) ?? [];
}

/** 관리자 감사 로그 (admin_audit) — RLS 로 관리자만 읽힌다 */
export async function fetchAuditLog(limit = 50): Promise<AuditRow[]> {
  const supabase = getBrowserSupabase();
  if (!supabase) return DEMO_AUDIT.slice(0, limit);
  const { data } = await supabase
    .from("admin_audit")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as AuditRow[] | null) ?? [];
}

export async function fetchLeaderboard(limit = 10): Promise<LeaderboardRow[]> {
  const supabase = getBrowserSupabase();
  if (!supabase) return DEMO_LEADERBOARD.slice(0, limit);
  const { data } = await supabase.from("leaderboard").select("*").order("position").limit(limit);
  return (data as LeaderboardRow[] | null) ?? [];
}

export async function fetchStats(): Promise<BoardStats> {
  const supabase = getBrowserSupabase();
  if (!supabase) return DEMO_STATS;
  const { data } = await supabase.rpc("board_stats");
  return (data as BoardStats | null) ?? { participants: 0, plays: 0, challengers: 0, draws: 0 };
}

export async function fetchPrizes(): Promise<PrizeRow[]> {
  const supabase = getBrowserSupabase();
  if (!supabase) return DEMO_PRIZES;
  const { data } = await supabase.from("prizes").select("*").order("place");
  return (data as PrizeRow[] | null) ?? [];
}

export async function fetchBoardEvents(limit = 20): Promise<BoardEvent[]> {
  const supabase = getBrowserSupabase();
  if (!supabase) return DEMO_BOARD_EVENTS;
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
  if (!supabase) {
    const me = DEMO_LEADERBOARD.find((r) => r.user_id === "demo-me");
    return me?.position ?? null;
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("leaderboard").select("position").eq("user_id", user.id).maybeSingle();
  const pos = (data as { position?: number } | null)?.position;
  return typeof pos === "number" ? pos : null;
}

/** 아울 서바이버즈 난이도 해금 단계 (profiles.meta.survive_unlock) */
/**
 * 아울 서바이버즈 진행도 (v2) — profiles.meta.survive_stage / survive_theme.
 * `stage` 는 **클리어한 최고 스테이지**다 (0 = 아직 없음). 선택 가능한 건 stage + 1 까지.
 */
export async function fetchSurviveProgress(): Promise<{ stage: number; theme: "dark" | "light" }> {
  const supabase = getBrowserSupabase();
  if (!supabase) return { stage: 4, theme: "dark" }; // 데모에서는 5스테이지까지 열어둔다
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

export type UnclaimedDraw = {
  id: string;
  place: number | null;
  drawn_at: string;
  user_id: string;
  profiles?: { name: string; student_id: string } | null;
};

export async function fetchUnclaimedDraws(): Promise<UnclaimedDraw[]> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return DEMO_DRAWS.filter((d) => d.place && !d.claimed).map((d) => ({
      id: d.id,
      place: d.place,
      drawn_at: d.drawn_at,
      user_id: d.user_id,
      profiles: { name: "홍길동", student_id: "202612345" },
    }));
  }
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
  if (!supabase) return DEMO_SESSIONS.filter((s) => s.status === "rejected");
  const { data } = await supabase
    .from("game_sessions")
    .select("*")
    .eq("status", "rejected")
    .order("started_at", { ascending: false })
    .limit(50);
  return (data as GameSessionRow[] | null) ?? [];
}
