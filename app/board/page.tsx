import type { Metadata } from "next";
import { BoardScreen } from "@/components/board/BoardScreen";
import { getLeaderboard, getPrizes } from "@/lib/queries";
import { getServerSupabase } from "@/lib/supabase/server";
import { EMPTY_BOARD_STATS, type BoardEvent, type BoardStats } from "@/lib/types";

export const metadata: Metadata = { title: "전광판" };
export const dynamic = "force-dynamic";

async function getBoardStats(): Promise<BoardStats> {
  const supabase = await getServerSupabase();
  if (!supabase) return EMPTY_BOARD_STATS;
  const { data } = await supabase.rpc("board_stats");
  return (data as BoardStats | null) ?? EMPTY_BOARD_STATS;
}

async function getBoardEvents(): Promise<BoardEvent[]> {
  const supabase = await getServerSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from("board_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);
  return (data as BoardEvent[] | null) ?? [];
}

export default async function BoardPage() {
  const [top, stats, prizes, events] = await Promise.all([
    getLeaderboard(10),
    getBoardStats(),
    getPrizes(),
    getBoardEvents(),
  ]);

  return <BoardScreen initialTop={top} initialStats={stats} initialPrizes={prizes} initialEvents={events} />;
}
