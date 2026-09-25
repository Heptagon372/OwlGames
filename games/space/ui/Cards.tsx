"use client";

// 🚀 아울스페이스 — 스킬 3택 (기획서 §5.1)
// 칩 게이지가 차면 게임이 멈추고 카드가 뜬다. 세로 화면이라 카드를 세로로 쌓는다.

import { useEffect } from "react";
import type { SpaceTheme } from "../theme";
import type { Card } from "../types";

type Props = {
  cards: Card[];
  theme: SpaceTheme;
  onPick: (index: number) => void;
};

const KIND_LABEL: Record<Card["kind"], string> = { main: "메인샷", sub: "서브", passive: "패시브" };

export function Cards({ cards, theme, onPick }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "1" || e.key === "2" || e.key === "3") {
        const i = Number(e.key) - 1;
        if (i < cards.length) onPick(i);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cards.length, onPick]);

  return (
    <div
      className="absolute inset-0 z-20 grid place-items-center p-4"
      style={{ background: `${theme.bg}e8`, backdropFilter: "blur(2px)" }}
    >
      <div className="w-full max-w-sm">
        <p className="arcade mb-1 text-center text-xs" style={{ color: theme.chip }}>
          CHIP FULL
        </p>
        <p className="mb-4 text-center text-xl font-black" style={{ color: theme.text }}>
          강화를 하나 고르세요
        </p>

        <div className="grid gap-3">
          {cards.map((c, i) => (
            <button
              key={`${c.id}-${i}`}
              type="button"
              onClick={() => onPick(i)}
              className="flex min-h-[86px] items-center gap-3 rounded-2xl px-4 py-3 text-left transition-transform active:scale-95"
              style={{
                background: theme.surface,
                border: `2px solid ${c.kind === "main" ? `${theme.player}aa` : `${theme.dim}55`}`,
              }}
            >
              <span className="text-3xl">{c.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-extrabold" style={{ color: theme.text }}>
                    {c.name}
                  </span>
                  <span
                    className="num rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                    style={{ color: theme.player, background: `${theme.player}22` }}
                  >
                    {c.level}
                  </span>
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: theme.dim }}>
                  {c.desc}
                </span>
              </span>
              <span className="num text-[10px]" style={{ color: `${theme.dim}aa` }}>
                {KIND_LABEL[c.kind]} · {i + 1}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
