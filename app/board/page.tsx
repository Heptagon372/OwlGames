import type { Metadata } from "next";
import { BoardScreen } from "@/components/board/BoardScreen";
import { DEMO_BOARD_EVENTS, DEMO_STATS } from "@/lib/demo";
import { getLeaderboard, getPrizes } from "@/lib/queries";
import { getServerSupabase } from "@/lib/supabase/server";
import type { BoardEvent, BoardStats } from "@/lib/types";

export const metadata: Metadata = { title: "전광판" };
export const dynamic = "force-dynamic";

async function getBoardStats(): Promise<BoardStats> {
  const supabase = await getServerSupabase();
  if (!supabase) return DEMO_STATS;
  const { data } = await supabase.rpc("board_stats");
  return (data as BoardStats | null) ?? { participants: 0, plays: 0, challengers: 0, draws: 0 };
}

async function getBoardEvents(): Promise<BoardEvent[]> {
  const supabase = await getServerSupabase();
  if (!supabase) return DEMO_BOARD_EVENTS;
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
