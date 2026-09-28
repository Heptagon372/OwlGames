"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { RankBadge } from "./RankBadge";
import { rankInfo } from "@/lib/rank";
import { playLevelUp, preloadLevelUp } from "@/lib/sound";

type Props = {
  open: boolean;
  /** 랭크업이면 rankIdx, 레벨업만이면 level */
  kind: "level" | "rank";
  level: number;
  rankIdx: number;
  ticketsGained?: number;
  onDone: () => void;
};

/** 연출 길이(ms) — 랭크업은 빛이 모였다 터지는 데 0.5초가 더 든다 */
const DURATION = { level: 2200, rank: 5000 } as const;

/** 매번 같은 모양으로 흩어지게 — 인덱스로 만드는 0~1 난수 */
function rnd(i: number, k: number): number {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
/** 폭발 때 뱃지에서 사방으로 튀는 불꽃 줄기 */
const SPARKS = Array.from({ length: 36 }, (_, i) => ({
  a: `${(i / 36) * 360 + rnd(i, 1) * 8}deg`,
  dist: `${34 + rnd(i, 2) * 40}vmax`,
  len: `${36 + rnd(i, 3) * 70}px`,
  d: `${0.8 + rnd(i, 4) * 0.7}s`,
  white: i % 3 === 0,
}));
/** 화면 아래에서 계속 올라오는 불씨 */
const EMBERS = Array.from({ length: 26 }, (_, i) => ({
  x: `${rnd(i, 5) * 100}%`,
  s: `${3 + rnd(i, 6) * 5}px`,
  d: `${2.6 + rnd(i, 7) * 2.4}s`,
  delay: `${0.6 + rnd(i, 8) * 2.6}s`,
  drift: `${(rnd(i, 9) - 0.5) * 18}vw`,
  tone: i % 3,
}));

/** 레벨업·랭크업 연출 (§13) — 랭크업은 빛 폭발이 화면 끝까지 번진다 (DECISIONS §5-48) */
export function LevelUpOverlay({ open, kind, level, rankIdx, ticketsGained = 0, onDone }: Props) {
  const tl = useTranslations("levelUp");
  // 결과 화면이 뜰 때 미리 받아 둬야 연출이 열리는 순간 샘플이 준비돼 있다
  useEffect(() => preloadLevelUp(), []);
  useEffect(() => {
    if (!open) return;
    playLevelUp(kind);
    const t = setTimeout(onDone, DURATION[kind]);
    return () => clearTimeout(t);
  }, [open, kind, onDone]);

  if (!open) return null;

  return (
    <button
      type="button"
      onClick={onDone}
      aria-label={tl("continueAria")}
      // 랭크업은 빛이 번져 보이도록 테마와 상관없이 밤하늘처럼 어둡게 깐다
      className={`fixed inset-0 z-[70] flex cursor-default flex-col items-center justify-center gap-6 overflow-hidden px-6 backdrop-blur-md ${
        kind === "rank" ? "bg-[#070b18]/95" : "bg-night/95"
      }`}
    >
      {kind === "rank" ? (
        <RankUp level={level} rankIdx={rankIdx} ticketsGained={ticketsGained} />
      ) : (
        <LevelUp level={level} color={rankInfo(rankIdx).colors[0]} ticketsGained={ticketsGained} />
      )}
      <p className={`absolute bottom-10 z-[2] font-mono text-xs ${kind === "rank" ? "text-white/50" : "text-dim"}`}>{tl("continue")}</p>
    </button>
  );
}

/** 랭크업 — 빛이 모인다 → 섬광·충격파·불꽃과 함께 뱃지가 꽂힌다 → 랭크 색 빛이 화면 가장자리까지 남아 일렁인다 */
function RankUp({ level, rankIdx, ticketsGained }: { level: number; rankIdx: number; ticketsGained: number }) {
  const tl = useTranslations("levelUp");
  const tr = useTranslations("ranks");
  const r = rankInfo(rankIdx);
  const [a, b] = r.colors;
  const ember = [a, "#ffb020", "#fff4d6"];

  return (
    <div className="ru-stage contents" style={{ "--ru-a": a, "--ru-b": b } as React.CSSProperties}>
      {/* 화면 전체에 번지는 빛 — 뒤에서부터: 남는 빛 · 빛줄기 두 겹 · 아래 불빛 · 폭발 빛 */}
      <div className="ru-layer ru-wash" aria-hidden />
      <div className="ru-layer ru-rays ru-rays-a" aria-hidden />
      <div className="ru-layer ru-rays ru-rays-b" aria-hidden />
      <div className="ru-layer ru-fire" aria-hidden />
      <div className="ru-layer ru-flash" aria-hidden />
      {EMBERS.map((e, i) => (
        <span
          key={i}
          className="ru-layer ru-ember"
          aria-hidden
          style={{ "--x": e.x, "--s": e.s, "--d": e.d, "--delay": e.delay, "--drift": e.drift, "--c": ember[e.tone] } as React.CSSProperties}
        />
      ))}

      <div className="ru-shake relative z-[1] flex flex-col items-center gap-6">
        <p className="ru-title font-mono text-sm font-bold text-white">{tl("rankUp")}</p>

        <div className="relative">
          <div className="ru-layer ru-halo" aria-hidden />
          <div className="ru-layer ru-core" aria-hidden />
          <div className="ru-layer ru-ring" aria-hidden />
          <div className="ru-layer ru-ring ru-ring-2" aria-hidden />
          {SPARKS.map((s, i) => (
            <span
              key={i}
              className="ru-layer ru-spark"
              aria-hidden
              style={{ "--a": s.a, "--dist": s.dist, "--len": s.len, "--d": s.d, "--c": s.white ? "#fff" : a } as React.CSSProperties}
            />
          ))}
          <div className="ru-slam relative scale-125">
            <RankBadge rankIdx={rankIdx} size="xl" />
          </div>
        </div>

        <div className="ru-late relative mt-2 text-center" style={{ "--late": "0.35s" } as React.CSSProperties}>
          <div className="ru-layer ru-scrim -z-[1]" aria-hidden />
          {/* 배경이 늘 어두우므로 라이트 테마용 .rank-ink 필터는 걸지 않는다 */}
          <p className="ru-name text-4xl font-black" style={{ color: a }}>
            {tr(String(rankIdx))}
          </p>
          <p className="mt-1 font-mono text-sm text-white/75">{tl("reached", { level })}</p>
        </div>

        {ticketsGained > 0 && (
          <div
            className="ru-late rounded-2xl border border-amber/50 bg-amber/10 px-6 py-3 text-xl font-extrabold text-amber-soft shadow-amber"
            style={{ "--late": "0.8s" } as React.CSSProperties}
          >
            {tl("ticket", { count: ticketsGained })}
          </div>
        )}
      </div>

      {/* 폭발 순간의 흰 섬광 — 뱃지까지 덮는다 */}
      <div className="ru-layer ru-white" aria-hidden />
    </div>
  );
}

/** 레벨업만 — 은은한 빛줄기 + 숫자 */
function LevelUp({ level, color, ticketsGained }: { level: number; color: string; ticketsGained: number }) {
  const tl = useTranslations("levelUp");
  return (
    <>
      <div
        className="pointer-events-none absolute size-[150vmax] animate-spin-slow opacity-20"
        style={{
          background: `conic-gradient(from 0deg, transparent 0 8deg, ${color}55 8deg 10deg, transparent 10deg 20deg)`,
          maskImage: "radial-gradient(closest-side, black 20%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(closest-side, black 20%, transparent 70%)",
        }}
        aria-hidden
      />

      <p className="animate-rise font-mono text-sm tracking-[0.4em] text-aqua">{tl("levelUp")}</p>

      <div className="relative animate-pop">
        <div className="grid size-32 place-items-center rounded-full grad-line glass text-5xl font-black text-neon-soft shadow-[0_0_70px_rgb(167_139_250/0.5)]">
          <span className="num">{level}</span>
        </div>
      </div>

      <div className="animate-rise text-center" style={{ animationDelay: "0.25s" }}>
        <p className="text-2xl font-black">
          {tl.rich("levelReached", { level, n: (c) => <span className="num text-neon">{c}</span> })}
        </p>
      </div>

      {ticketsGained > 0 && (
        <div
          className="animate-pop rounded-2xl border border-amber/50 bg-amber/10 px-6 py-3 text-xl font-extrabold text-amber-soft shadow-amber"
          style={{ animationDelay: "0.7s" }}
        >
          {tl("ticket", { count: ticketsGained })}
        </div>
      )}
    </>
  );
}
