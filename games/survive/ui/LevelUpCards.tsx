"use client";

// 레벨업 카드 3장 (기획서 §5.2 · §14) — 선택하는 동안 게임은 멈춘다.
import { useEffect } from "react";
import { RefreshCw, SkipForward } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Card } from "../types";

export function LevelUpCards({
  cards,
  level,
  rerolls,
  onPick,
  onReroll,
  onSkip,
}: {
  cards: Card[];
  level: number;
  rerolls: number;
  onPick: (index: number) => void;
  onReroll: () => void;
  onSkip: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "1" || e.key === "2" || e.key === "3") onPick(Number(e.key) - 1);
      if (e.key.toLowerCase() === "r") onReroll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPick, onReroll]);

  if (!cards.length) return null;

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-night/85 px-4 backdrop-blur-sm">
      <p className="arcade text-sm text-neon">LEVEL {level}</p>
      <div className="grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.map((card, i) => {
          const evolve = card.kind === "evolve";
          return (
            <button
              key={`${card.kind}-${card.id}-${i}`}
              type="button"
              onClick={() => onPick(i)}
              className={cn(
                "group relative flex min-h-[132px] flex-col items-center justify-center gap-1.5 rounded-card border-2 bg-panel/90 p-4 text-center transition-transform active:scale-95",
                evolve
                  ? "animate-pulse-glow border-neon shadow-[0_0_30px_rgba(255,176,32,0.5)]"
                  : "border-line hover:border-aqua/60",
              )}
            >
              <span className="num absolute left-2 top-2 text-[10px] text-dim">{i + 1}</span>
              {evolve && <span className="arcade text-[10px] text-neon">EVOLVE</span>}
              <span className="text-3xl">{card.emoji}</span>
              <span className="font-extrabold">{card.label}</span>
              <span className="text-xs leading-relaxed text-mute">{card.desc}</span>
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onReroll}
          disabled={rerolls <= 0}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-2xl border border-line bg-night/70 px-4 text-sm font-bold text-mute disabled:opacity-40"
        >
          <RefreshCw className="size-4" /> 리롤 {rerolls}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-2xl border border-line bg-night/70 px-4 text-sm font-bold text-mute"
        >
          <SkipForward className="size-4" /> 건너뛰기 (+XP)
        </button>
      </div>
    </div>
  );
}
