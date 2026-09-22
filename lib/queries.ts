import "server-only";

import { cache } from "react";
import { mergeConfig, type AppConfig, isOpenNow } from "./config";
import {
  DEMO_DRAWS,
  DEMO_LEADERBOARD,
  DEMO_PRIZES,
  DEMO_PROFILE,
  DEMO_SESSIONS,
  DEMO_TICKETS,
  demoGameBests,
} from "./demo";
import { getServerSupabase } from "./supabase/server";
import type {
  DrawRow,
  GameBestRow,
  GameId,
  GameSessionRow,
  LeaderboardRow,
  PrizeRow,
  Profile,
  RedeemCodeRow,
  TicketRow,
} from "./types";

// 서버 컴포넌트용 조회 함수. 데모 모드면 가짜 데이터를 돌려준다.
// cache()로 한 요청 안의 중복 조회를 합친다.

export const getMyProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await getServerSupabase();
  if (!supabase) return DEMO_PROFILE;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return (data as Profile | null) ?? null;
});

export const getAppConfig = cache(async (): Promise<AppConfig> => {
  const supabase = await getServerSupabase();
  if (!supabase) return mergeConfig(null);
  const { data } = await supabase.from("app_config").select("key, value");
  return mergeConfig(data);
});

export const getIsOpen = cache(async (): Promise<boolean> => {
  const supabase = await getServerSupabase();
  if (!supabase) return isOpenNow(await getAppConfig());
  const { data, error } = await supabase.rpc("is_open");
  if (error) return isOpenNow(await getAppConfig());
  return Boolean(data);
});

export async function getLeaderboard(limit = 50): Promise<LeaderboardRow[]> {
  const supabase = await getServerSupabase();
  if (!supabase) return DEMO_LEADERBOARD.slice(0, limit);
  const { data } = await supabase.from("leaderboard").select("*").order("position").limit(limit);
  return (data as LeaderboardRow[] | null) ?? [];
}

/** 내 순위 (TOP N 밖일 때 표시용) */
export async function getMyPosition(userId: string): Promise<LeaderboardRow | null> {
  const supabase = await getServerSupabase();
  if (!supabase) return DEMO_LEADERBOARD.find((r) => r.user_id === userId) ?? null;
  const { data } = await supabase.from("leaderboard").select("*").eq("user_id", userId).maybeSingle();
  return (data as LeaderboardRow | null) ?? null;
}

export async function getGameBests(game: GameId, limit = 50): Promise<GameBestRow[]> {
  const supabase = await getServerSupabase();
  if (!supabase) return demoGameBests(game).slice(0, limit);
  const { data } = await supabase
    .from("game_bests")
    .select("*")
    .eq("game", game)
    .order("position")
    .limit(limit);
  return (data as GameBestRow[] | null) ?? [];
}

export async function getMySessions(limit = 30): Promise<GameSessionRow[]> {
  const supabase = await getServerSupabase();
  if (!supabase) return DEMO_SESSIONS;
  const profile = await getMyProfile();
  if (!profile) return [];
  // staff는 RLS상 전체 세션이 보이므로 본인 것만 명시적으로 거른다
  const { data } = await supabase
    .from("game_sessions")
    .select("*")
    .eq("user_id", profile.id)
    .neq("status", "active")
    .order("started_at", { ascending: false })
    .limit(limit);
  return (data as GameSessionRow[] | null) ?? [];
}

export async function getMyTickets(): Promise<TicketRow[]> {
  const supabase = await getServerSupabase();
  if (!supabase) return DEMO_TICKETS;
  const profile = await getMyProfile();
  if (!profile) return [];
  const { data } = await supabase
    .from("tickets")
    .select("id, earned_rank_idx, status, redeem_code_id, created_at, used_at")
    .eq("user_id", profile.id)
    .order("created_at");
  return (data as TicketRow[] | null) ?? [];
}

export async function getMyActiveCode(): Promise<RedeemCodeRow | null> {
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const profile = await getMyProfile();
  if (!profile) return null;
  const { data } = await supabase
    .from("redeem_codes")
    .select("id, code, ticket_count, expires_at, status, created_at")
    .eq("user_id", profile.id)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as RedeemCodeRow | null) ?? null;
}

export type MyDraw = DrawRow & { prize_name: string | null };

export async function getMyDraws(): Promise<MyDraw[]> {
  const supabase = await getServerSupabase();
  if (!supabase) return DEMO_DRAWS;
  const profile = await getMyProfile();
  if (!profile) return [];
  const [{ data: draws }, prizes] = await Promise.all([
    supabase.from("draws").select("*").eq("user_id", profile.id).order("drawn_at", { ascending: false }),
    getPrizes(),
  ]);
  const names = new Map(prizes.map((p) => [p.place, p.name]));
  return ((draws as DrawRow[] | null) ?? []).map((d) => ({
    ...d,
    prize_name: d.place ? (names.get(d.place) ?? null) : null,
  }));
}

export const getPrizes = cache(async (): Promise<PrizeRow[]> => {
  const supabase = await getServerSupabase();
  if (!supabase) return DEMO_PRIZES;
  const { data } = await supabase.from("prizes").select("*").order("place");
  return (data as PrizeRow[] | null) ?? [];
});
