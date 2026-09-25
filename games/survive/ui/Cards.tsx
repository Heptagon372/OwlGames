"use client";

// 🦉 아울 서바이버즈 v2 — 레벨업 카드 (기획서 §10.4)
// 카드가 뜨면 게임 전체가 멈춘다. 최소 높이 180px, 간격 16px — 세로에서도 누르기 쉽게.

import { useEffect } from "react";
import type { Theme } from "../theme";
import type { Card } from "../types";

type Props = {
  cards: Card[];
  level: number;
  rerolls: number;
  skips: number;
  theme: Theme;
  onPick: (index: number) => void;
  onReroll: () => void;
  onSkip: () => void;
};

export function Cards({ cards, level, rerolls, skips, theme, onPick, onReroll, onSkip }: Props) {
  // PC: 1·2·3 선택, R 리롤 (§2)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "1" || e.key === "2" || e.key === "3") {
        const i = Number(e.key) - 1;
        if (i < cards.length) onPick(i);
      } else if (e.key.toLowerCase() === "r") onReroll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cards.length, onPick, onReroll]);

  return (
    <div
      className="absolute inset-0 z-20 grid place-items-center p-4"
      style={{ background: `${theme.bg}e6`, backdropFilter: "blur(2px)" }}
    >
      <div className="w-full max-w-3xl">
        <p className="arcade mb-1 text-center text-xs" style={{ color: theme.accent }}>
          LEVEL UP
        </p>
        <p className="mb-4 text-center text-2xl font-black" style={{ color: theme.text }}>
          Lv.{level} — 하나 고르세요
        </p>

        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {cards.map((c, i) => {
            const evo = c.kind === "evolution";
            return (
              <button
                key={`${c.id}-${i}`}
                type="button"
                onClick={() => onPick(i)}
                className="flex min-h-[180px] flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-4 text-center transition-transform active:scale-95"
                style={{
                  background: theme.surface,
                  border: `2px solid ${evo ? "#FACC15" : `${theme.dim}55`}`,
                  boxShadow: evo ? "0 0 24px rgba(250,204,21,0.35)" : "none",
                }}
              >
                <span className="text-4xl">{c.emoji}</span>
                <span className="text-sm font-extrabold" style={{ color: theme.text }}>
                  {c.name}
                </span>
                <span
                  className="num rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{
                    color: evo ? "#FACC15" : theme.accent,
                    background: evo ? "rgba(250,204,21,0.15)" : `${theme.accent}22`,
                  }}
                >
                  {c.level}
                </span>
                <span className="px-1 text-[11px] leading-snug" style={{ color: theme.dim }}>
                  {c.desc}
                </span>
                <span className="num text-[10px]" style={{ color: `${theme.dim}aa` }}>
                  {i + 1}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex justify-center gap-3">
          <button
            type="button"
            onClick={onReroll}
            disabled={rerolls <= 0}
            className="min-h-11 rounded-full px-5 text-sm font-bold disabled:opacity-40"
            style={{ border: `1.5px solid ${theme.dim}66`, color: theme.text }}
          >
            🔄 리롤 {rerolls}
          </button>
          <button
            type="button"
            onClick={onSkip}
            disabled={skips <= 0}
            className="min-h-11 rounded-full px-5 text-sm font-bold disabled:opacity-40"
            style={{ border: `1.5px solid ${theme.dim}66`, color: theme.dim }}
          >
            ⏭️ 스킵 {skips}
          </button>
        </div>
      </div>
    </div>
  );
}
