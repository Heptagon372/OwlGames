import { cn } from "@/lib/cn";
import { PLACE_EMOJI } from "@/lib/config";

/** 그림이 있는 등수 (public/assets/prizes/prize-1~6.webp) */
const ART_PLACES = 6;

/** 상품 그림 — 사용자 그림 (scripts/slice-prizes.py → public/assets/prizes/prize-N.webp).
 *  등수가 없으면(꽝) 🫥, 그림이 없는 등수는 이모지로 그린다. 크기는 className(size-*)으로 준다.
 *  그림은 실제 상품과 다를 수 있다 — 상품을 보여 주는 화면에는 `common.prizeArtNote` 를 같이 띄운다 (DECISIONS §5-45). */
export function PrizeArt({ place, className, alt }: { place: number | null | undefined; className?: string; alt?: string }) {
  if (!place) {
    return (
      <span className={cn("inline-grid shrink-0 place-items-center leading-none", className)} aria-hidden>
        🫥
      </span>
    );
  }
  if (place > ART_PLACES) {
    return (
      <span className={cn("inline-grid shrink-0 place-items-center leading-none", className)} aria-hidden>
        {PLACE_EMOJI[place - 1] ?? "🎁"}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 작은 정적 그림 (RankBadge 와 같은 방식)
    <img
      src={`/assets/prizes/prize-${place}.webp`}
      alt={alt ?? ""}
      aria-hidden={alt ? undefined : true}
      width={320}
      height={320}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cn("pointer-events-none shrink-0 select-none object-contain", className)}
    />
  );
}
