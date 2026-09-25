"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { RankBadge } from "./RankBadge";
import { rankInfo } from "@/lib/rank";

type Props = {
  open: boolean;
  /** 랭크업이면 rankIdx, 레벨업만이면 level */
  kind: "level" | "rank";
  level: number;
  rankIdx: number;
  ticketsGained?: number;
  onDone: () => void;
};

/** 랭크업 연출 (§13): 풀스크린 암전 → 뱃지 확대 → 🎟️ 뽑기 티켓 +1 */
export function LevelUpOverlay({ open, kind, level, rankIdx, ticketsGained = 0, onDone }: Props) {
  const tl = useTranslations("levelUp");
  const tr = useTranslations("ranks");
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(onDone, kind === "rank" ? 4200 : 2200);
    return () => clearTimeout(t);
  }, [open, kind, onDone]);

  if (!open) return null;
  const r = rankInfo(rankIdx);

  return (
    <button
      type="button"
      onClick={onDone}
      aria-label={tl("continueAria")}
      className="fixed inset-0 z-[70] flex cursor-default flex-col items-center justify-center gap-6 bg-night/95 px-6 backdrop-blur-md"
    >
      {/* 빛줄기 */}
      <div
        className="pointer-events-none absolute size-[150vmax] animate-spin-slow opacity-20"
        style={{
          background: `conic-gradient(from 0deg, transparent 0 8deg, ${r.colors[0]}55 8deg 10deg, transparent 10deg 20deg)`,
          maskImage: "radial-gradient(closest-side, black 20%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(closest-side, black 20%, transparent 70%)",
        }}
        aria-hidden
      />

      <p className="animate-rise font-mono text-sm tracking-[0.4em] text-aqua">
        {kind === "rank" ? tl("rankUp") : tl("levelUp")}
      </p>

      <div className="relative animate-pop">
        {kind === "rank" ? (
          <RankBadge rankIdx={rankIdx} size="xl" />
        ) : (
          <div className="grid size-32 place-items-center rounded-full grad-line glass text-5xl font-black text-neon-soft shadow-[0_0_70px_rgb(167_139_250/0.5)]">
            <span className="num">{level}</span>
          </div>
        )}
      </div>

      <div className="animate-rise text-center" style={{ animationDelay: "0.25s" }}>
        {kind === "rank" ? (
          <>
            <p className="rank-ink text-3xl font-black text-glow" style={{ color: r.colors[0] }}>
              {tr(String(rankIdx))}
            </p>
            <p className="mt-1 font-mono text-sm text-mute">{tl("reached", { level })}</p>
          </>
        ) : (
          <p className="text-2xl font-black">
            {tl.rich("levelReached", { level, n: (c) => <span className="num text-neon">{c}</span> })}
          </p>
        )}
      </div>

      {ticketsGained > 0 && (
        <div
          className="animate-pop rounded-2xl border border-amber/50 bg-amber/10 px-6 py-3 text-xl font-extrabold text-amber-soft shadow-amber"
          style={{ animationDelay: "0.7s" }}
        >
          {tl("ticket", { count: ticketsGained })}
        </div>
      )}

      <p className="absolute bottom-10 font-mono text-xs text-dim">{tl("continue")}</p>
    </button>
  );
}
