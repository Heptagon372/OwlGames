"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Play } from "lucide-react";
import { ResultModal } from "./ResultModal";
import { useGameSession } from "./core/useGameSession";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { GAMES } from "@/lib/games";
import { isDemo } from "@/lib/env";
import type { GameId } from "@/lib/types";
import type { GameComponentProps } from "./core/types";

const Loading = () => (
  <div className="grid h-full place-items-center font-mono text-sm text-mute">loading...</div>
);

const GAME_COMPONENTS: Record<GameId, React.ComponentType<GameComponentProps>> = {
  typer: dynamic(() => import("./typer/TyperGame").then((m) => m.TyperGame), { ssr: false, loading: Loading }),
  flight: dynamic(() => import("./flight").then((m) => m.FlightGame), { ssr: false, loading: Loading }),
  phish: dynamic(() => import("./phish/PhishGame").then((m) => m.PhishGame), { ssr: false, loading: Loading }),
  logic: dynamic(() => import("./logic").then((m) => m.LogicGame), { ssr: false, loading: Loading }),
  survive: dynamic(() => import("./survive").then((m) => m.SurviveGame), { ssr: false, loading: Loading }),
  space: dynamic(() => import("./space").then((m) => m.SpaceGame), { ssr: false, loading: Loading }),
};

/** 인트로 → 카운트다운 → 플레이 → 제출 → 결과 */
export function GameShell({ game }: { game: GameId }) {
  const gameMeta = GAMES[game];
  const router = useRouter();
  const { phase, result, meta, position, error, start, finish, reset } = useGameSession(game);
  const [count, setCount] = useState<number | null>(null);
  const GameComponent = GAME_COMPONENTS[game];

  // 3 · 2 · 1 카운트다운
  useEffect(() => {
    if (phase !== "playing") return;
    setCount(3);
    const t = setInterval(() => {
      setCount((c) => {
        if (c === null) return null;
        if (c <= 1) {
          clearInterval(t);
          return null;
        }
        return c - 1;
      });
    }, 800);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (phase === "result") router.refresh();
  }, [phase, router]);

  return (
    <div className="fixed inset-0 flex flex-col bg-night">
      {/* 상단 바 */}
      <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2">
        <Link href="/lobby" className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-bold text-mute hover:text-ink">
          <ArrowLeft className="size-4" />
          로비
        </Link>
        <p className="font-mono text-xs tracking-widest text-aqua">
          {gameMeta.emoji} {gameMeta.title}
        </p>
        <span className="w-16" />
      </div>

      <div className="relative min-h-0 flex-1">
        {phase === "intro" || phase === "starting" ? (
          <div className="grid h-full place-items-center overflow-y-auto p-5">
            <Card className="w-full max-w-sm text-center">
              <div className="text-6xl">{gameMeta.emoji}</div>
              <h1 className="mt-3 text-2xl font-black">{gameMeta.title}</h1>
              <p className="mt-1 text-sm text-mute">{gameMeta.tagline}</p>
              <ul className="mt-5 grid gap-2 text-left">
                {gameMeta.rules.map((r) => (
                  <li key={r} className="flex gap-2 rounded-tile border border-line bg-night/60 px-3 py-2.5 text-sm">
                    <span className="text-neon">▸</span>
                    <span className="text-mute">{r}</span>
                  </li>
                ))}
              </ul>
              <p className="num mt-4 text-xs text-dim">
                {gameMeta.durationLabel} · 한 판 30~300P
              </p>
              <Button size="lg" block className="mt-5" onClick={start} disabled={phase === "starting"}>
                <Play className="size-5" />
                {phase === "starting" ? "세션 준비 중..." : "시작하기"}
              </Button>
              {isDemo && <p className="mt-3 font-mono text-[11px] text-neon-soft">DEMO · 점수는 저장되지 않아요</p>}
            </Card>
          </div>
        ) : null}

        {(phase === "playing" || phase === "submitting") && (
          <div className="h-full">{count === null ? <GameComponent onEnd={finish} /> : null}</div>
        )}

        {count !== null && (
          <div className="absolute inset-0 grid place-items-center bg-night/80 backdrop-blur-sm">
            <span key={count} className="num animate-pop text-8xl font-black text-neon text-glow">
              {count}
            </span>
          </div>
        )}

        {phase === "submitting" && (
          <div className="absolute inset-0 grid place-items-center bg-night/85 backdrop-blur-sm">
            <p className="font-mono text-sm tracking-[0.3em] text-aqua">SUBMITTING...</p>
          </div>
        )}

        {phase === "error" && (
          <div className="grid h-full place-items-center p-5">
            <Card className="w-full max-w-sm text-center">
              <p className="text-3xl">😵</p>
              <p className="mt-3 font-bold">{error}</p>
              <div className="mt-5 grid gap-2">
                <Button block onClick={reset}>
                  다시 시도
                </Button>
                <ButtonLink href="/lobby" variant="ghost" block>
                  로비로
                </ButtonLink>
              </div>
            </Card>
          </div>
        )}
      </div>

      {phase === "result" && result && <ResultModal game={game} result={result} meta={meta} position={position} onRetry={start} />}
    </div>
  );
}
