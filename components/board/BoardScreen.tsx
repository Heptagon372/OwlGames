"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { RankBadge } from "@/components/RankBadge";
import { Ticker } from "@/components/Ticker";
import { Card } from "@/components/ui/Card";
import { DEMO_PRIZES } from "@/lib/demo";
import { fetchLeaderboard, fetchPrizes, fetchStats } from "@/lib/client-queries";
import { formatNumber, maskName } from "@/lib/format";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { PLACE_EMOJI } from "@/lib/config";
import type { BoardEvent, BoardStats, LeaderboardRow, PrizeRow } from "@/lib/types";

/** 부스 전광판 (§9) — 공개 읽기 전용, 가로 16:9 */
export function BoardScreen({
  initialTop,
  initialStats,
  initialPrizes,
  initialEvents,
}: {
  initialTop: LeaderboardRow[];
  initialStats: BoardStats;
  initialPrizes: PrizeRow[];
  initialEvents: BoardEvent[];
}) {
  const [top, setTop] = useState(initialTop);
  const [stats, setStats] = useState(initialStats);
  const [prizes, setPrizes] = useState(initialPrizes);
  const [events, setEvents] = useState(initialEvents);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshAll = useCallback(async () => {
    const [t, s, p] = await Promise.all([fetchLeaderboard(10), fetchStats(), fetchPrizes()]);
    setTop(t);
    setStats(s);
    setPrizes(p);
  }, []);

  // 랭킹은 5초 디바운스로 재조회 (§9)
  const scheduleRefresh = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(refreshAll, 5000);
  }, [refreshAll]);

  useEffect(() => {
    const supabase = getBrowserSupabase();

    if (!supabase) {
      // 데모: 가짜 이벤트를 흘려보낸다
      const names = ["김민준", "이서연", "박도윤", "최하은", "정시우", "강지아"];
      let id = 1000;
      const t = setInterval(() => {
        const draw = Math.random() < 0.5;
        const place = 3 + Math.floor(Math.random() * 3);
        setEvents((prev) =>
          [
            {
              id: id++,
              kind: draw ? "draw" : "rank_up",
              masked_name: maskName(names[Math.floor(Math.random() * names.length)]),
              rank_idx: Math.floor(Math.random() * 17),
              place: draw ? place : null,
              prize_name: draw ? DEMO_PRIZES[place - 1].name : null,
              created_at: new Date().toISOString(),
            } satisfies BoardEvent,
            ...prev,
          ].slice(0, 20),
        );
      }, 6000);
      return () => clearInterval(t);
    }

    const channel = supabase
      .channel("board-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "board_events" }, (payload) => {
        setEvents((prev) => [payload.new as BoardEvent, ...prev].slice(0, 20));
        scheduleRefresh();
      })
      .subscribe();

    const poll = setInterval(refreshAll, 60_000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [refreshAll, scheduleRefresh]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b border-line px-8 py-4">
        <Logo href="/board" />
        <p className="font-mono text-[1.1vw] tracking-[0.3em] text-aqua">S.OWL BOOTH LIVE</p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[1.35fr_1fr] gap-5 p-5">
        {/* 랭킹 */}
        <Card className="flex min-h-0 flex-col p-4">
          <h2 className="mb-3 shrink-0 text-[1.6vw] font-black">
            🏆 실시간 랭킹 <span className="text-[1vw] font-bold text-mute">TOP 10</span>
          </h2>
          <ol className="grid min-h-0 flex-1 grid-rows-[repeat(10,minmax(0,1fr))] gap-[0.4vw]">
            {top.map((row) => (
              <li
                key={row.user_id}
                className="flex min-h-0 items-center gap-3 overflow-hidden rounded-tile border border-line/60 bg-night/50 px-3"
              >
                <span
                  className={`num w-[2.4vw] text-center text-[1.6vw] font-black ${
                    row.position <= 3 ? "text-neon" : "text-dim"
                  }`}
                >
                  {row.position}
                </span>
                <RankBadge rankIdx={row.rank_idx} size="md" />
                <span className="min-w-0 flex-1 truncate text-[1.5vw] font-extrabold">{row.masked_name}</span>
                <span className="num text-[1.1vw] text-mute">Lv {row.level}</span>
                <span className="num w-[7vw] text-right text-[1.5vw] font-black text-neon">
                  {formatNumber(row.total_points)}P
                </span>
              </li>
            ))}
          </ol>
        </Card>

        <div className="grid min-h-0 grid-rows-[auto_1fr] gap-5">
          {/* 오늘 통계 */}
          <Card className="p-4">
            <h2 className="mb-3 text-[1.3vw] font-black">📊 오늘</h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "참가자", value: stats.participants },
                { label: "플레이", value: stats.plays },
                { label: "챌린저", value: stats.challengers },
              ].map((s) => (
                <div key={s.label} className="rounded-tile border border-line bg-night/60 py-[1vw] text-center">
                  <p className="num text-[2.4vw] leading-none font-black text-neon">{formatNumber(s.value)}</p>
                  <p className="mt-2 text-[0.9vw] text-mute">{s.label}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* 재고 */}
          <Card className="flex min-h-0 flex-col p-4">
            <h2 className="mb-3 text-[1.3vw] font-black">🎁 남은 상품</h2>
            <ul className="grid min-h-0 flex-1 grid-rows-[repeat(5,minmax(0,1fr))] gap-[0.4vw]">
              {prizes.map((p) => (
                <li
                  key={p.place}
                  className="flex min-h-0 items-center gap-3 overflow-hidden rounded-tile border border-line/60 bg-night/50 px-3"
                >
                  <span className="text-[1.6vw]">{PLACE_EMOJI[p.place - 1]}</span>
                  <span className="min-w-0 flex-1 truncate text-[1.2vw] font-bold">
                    <span className="num mr-2 text-neon">{p.place}등</span>
                    {p.name}
                  </span>
                  <span
                    className={`num text-[1.4vw] font-black ${p.stock > 0 ? "text-ink" : "text-alert line-through"}`}
                  >
                    {p.stock}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <Ticker events={events} className="shrink-0" />
    </div>
  );
}