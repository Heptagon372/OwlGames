import { cn } from "@/lib/cn";
import { gameEmoji, isGameId } from "@/lib/games";
import type { GameId } from "@/lib/types";

/** 게임 로고 (사용자 제공 그림 — scripts/slice-game-logos.py). 이름이 그림에 들어 있어서 alt 로 이름을 준다 */
export function GameLogo({ game, alt, className }: { game: GameId; alt: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/assets/logos/${game}.webp`}
      alt={alt}
      draggable={false}
      className={cn("pointer-events-none select-none object-contain drop-shadow-[0_6px_18px_rgb(0_0_0/0.45)]", className)}
    />
  );
}

/** 줄 안에 들어가는 작은 로고 (세션 행처럼 game 이 문자열일 때). 내린 게임은 로고가 없어서 이모지로 */
export function GameMark({ game, className }: { game: string; className?: string }) {
  if (!isGameId(game)) return <span className={cn("text-xl", className)}>{gameEmoji(game)}</span>;
  return <GameLogo game={game} alt="" className={cn("h-8 w-12 shrink-0 drop-shadow-none", className)} />;
}
