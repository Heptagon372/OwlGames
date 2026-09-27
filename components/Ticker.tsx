"use client";

import { cn } from "@/lib/cn";
import { rankInfo } from "@/lib/rank";
import type { BoardEvent } from "@/lib/types";

function line(e: BoardEvent): string {
  if (e.kind === "draw") return `🎉 ${e.masked_name} 님 ${e.place}등 ${e.prize_name ?? ""} 당첨!`;
  return `⬆️ ${e.masked_name} 님 ${rankInfo(e.rank_idx ?? 0).name} 달성!`;
}

/** 전광판 하단 티커 (§9) */
export function Ticker({ events, className }: { events: BoardEvent[]; className?: string }) {
  // 소식이 아직 없으면 가짜 이벤트 대신 안내 한 줄만 흘린다
  const empty = events.length === 0;
  const row = (key: string) => (
    <div key={key} className="flex shrink-0 items-center gap-10 pr-10" aria-hidden={key === "b"}>
      {empty && (
        <span className="flex items-center gap-2 whitespace-nowrap text-xl font-bold">
          <span className="text-aqua">🦉 게임하고 랭크를 올려 S.OWL 부스에서 뽑기에 도전하세요</span>
          <span className="text-dim">·</span>
        </span>
      )}
      {events.map((e) => (
        <span key={`${key}-${e.id}`} className="flex items-center gap-2 whitespace-nowrap text-xl font-bold">
          <span className={e.kind === "draw" ? "text-neon" : "text-aqua"}>{line(e)}</span>
          <span className="text-dim">·</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className={cn("relative overflow-hidden border-t border-line bg-night/70 py-3", className)}>
      <div className="flex w-max animate-ticker">
        {row("a")}
        {row("b")}
      </div>
    </div>
  );
}
