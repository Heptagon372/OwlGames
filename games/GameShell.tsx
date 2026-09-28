"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { stopMusic } from "@/lib/sound";
import { enterFullscreen, exitFullscreen, isTouchDevice } from "@/lib/fullscreen";
import { ArrowLeft, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { ResultModal } from "./ResultModal";
import { useGameSession } from "./core/useGameSession";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DifficultyChip } from "@/components/DifficultyChip";
import { GAMES } from "@/lib/games";
import { GameLogo } from "@/components/GameLogo";
import type { GameId } from "@/lib/types";
import type { GameComponentProps } from "./core/types";

const Loading = () => (
  <div className="grid h-full place-items-center font-mono text-sm text-mute">loading...</div>
);

const GAME_COMPONENTS: Record<GameId, React.ComponentType<GameComponentProps>> = {
  flight: dynamic(() => import("./flight").then((m) => m.FlightGame), { ssr: false, loading: Loading }),
  survive: dynamic(() => import("./survive").then((m) => m.SurviveGame), { ssr: false, loading: Loading }),
  owlis: dynamic(() => import("./owlis").then((m) => m.OwlisGame), { ssr: false, loading: Loading }),
  chef: dynamic(() => import("./chef").then((m) => m.ChefGame), { ssr: false, loading: Loading }),
};

/** 가로 고정 게임 — 전체화면에 들어갈 때 가로로 잠가 본다 (안드로이드) */
const LANDSCAPE = new Set<GameId>(["flight", "survive"]);

/** 인트로 → 카운트다운 → 플레이 → 제출 → 결과 */
export function GameShell({ game, points }: { game: GameId; points: { base: number; rate: number } }) {
  const t = useTranslations("gameShell");
  const tc = useTranslations("common");
  const tg = useTranslations("games");
  const title = tg(`${game}.title`);
  const rules = tg.raw(`${game}.rules`) as string[];
  const router = useRouter();
  const { phase, result, meta, position, error, start, finish, reset } = useGameSession(game);
  const [count, setCount] = useState<number | null>(null);
  const GameComponent = GAME_COMPONENTS[game];
  const inPlay = phase === "playing" || phase === "submitting";

  // 로비 배경음악(MusicDock)은 게임 화면에서 끈다 — 게임마다 자기 소리를 쓴다 (서바이버즈는 자기 BGM)
  useEffect(() => {
    stopMusic(0.6);
  }, []);

  // 폰에서는 게임을 시작할 때 전체화면으로 — 브라우저 주소창·하단 버튼이 화면을 가리지 않게 (§5-40)
  const begin = () => {
    if (isTouchDevice()) void enterFullscreen(LANDSCAPE.has(game) ? "landscape" : undefined);
    start();
  };
  useEffect(() => () => void exitFullscreen(), []);

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
      {/* 상단 바 — 인트로·결과에만. 플레이 중에는 숨기고 나가기는 각 게임의 ⏸ 메뉴가 맡는다 (§5-40) */}
      {!inPlay && (
        <div className="relative flex shrink-0 items-center px-3 pb-1 pt-[max(4px,env(safe-area-inset-top))]">
          <Link href="/lobby" className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-bold text-mute transition-colors hover:text-ink">
            <ArrowLeft className="size-4" />
            {tc("toLobby")}
          </Link>
        </div>
      )}

      {/* 노치·상태 표시줄(홈 화면 앱 · 전체화면) 밑으로 게임이 들어가지 않게 */}
      <div
        className={`relative min-h-0 flex-1 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] ${inPlay ? "pt-[env(safe-area-inset-top)]" : ""}`}
      >
        {phase === "intro" || phase === "starting" ? (
          <div className="grid h-full place-items-center overflow-y-auto p-5">
            <Card glow className="w-full max-w-sm text-center">
              <GameLogo game={game} alt="" className="mx-auto h-36 w-full" />
              <h1 className="sr-only">{title}</h1>
              <p className="mt-1 text-sm text-mute">{tg(`${game}.tagline`)}</p>
              <DifficultyChip level={GAMES[game].difficulty} className="mt-2 text-[11px]" />
              <ul className="mt-5 grid gap-2 text-left">
                {rules.map((r) => (
                  <li key={r} className="glass flex gap-2 rounded-tile px-3 py-2.5 text-sm">
                    <span className="text-aqua">▸</span>
                    <span className="text-mute">{r}</span>
                  </li>
                ))}
              </ul>
              <p className="num mt-4 text-xs text-dim">{t("duration", { duration: tg(`${game}.duration`), base: points.base, rate: points.rate })}</p>
              <Button size="lg" block className="mt-5" onClick={begin} disabled={phase === "starting"}>
                <Play className="size-5" />
                {phase === "starting" ? t("starting") : t("start")}
              </Button>
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
            <p className="font-mono text-sm tracking-[0.3em] text-aqua">{t("submitting")}</p>
          </div>
        )}

        {phase === "error" && (
          <div className="grid h-full place-items-center p-5">
            <Card className="w-full max-w-sm text-center">
              <p className="text-3xl">😵</p>
              <p className="mt-3 font-bold">{error}</p>
              <div className="mt-5 grid gap-2">
                <Button block onClick={reset}>
                  {t("errorRetry")}
                </Button>
                <ButtonLink href="/lobby" variant="ghost" block>
                  {tc("toLobby")}
                </ButtonLink>
              </div>
            </Card>
          </div>
        )}
      </div>

      {phase === "result" && result && <ResultModal game={game} result={result} meta={meta} position={position} onRetry={begin} />}
    </div>
  );
}
