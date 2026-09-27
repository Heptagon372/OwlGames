import type { ReactNode } from "react";
import { OwlMark } from "@/components/brand/OwlMark";
import { cn } from "@/lib/cn";

/**
 * 뽑기 티켓 — 네온 테두리 + 뜯는 선(천공) + 오른쪽 반쪽(스텁).
 *
 * 실물 티켓처럼 보이게 하는 장치 세 가지:
 *   1) 시안→바이올렛→마젠타 헤어라인 테두리 + 바깥 글로우 (§13)
 *   2) 가운데 점선 + 위아래 반원 노치 — 티켓을 뜯는 자리
 *   3) 왼쪽 위/오른쪽 아래 모서리의 사선
 *
 * 스텁(`stub`)은 폰 세로에서는 아래로 내려간다 (노치도 같이 돈다).
 */
export function GachaTicket({
  children,
  stub,
  className,
  label = "GACHA TICKET",
}: {
  children: ReactNode;
  stub?: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "grad-line glow-iris relative overflow-hidden rounded-card bg-[color-mix(in_oklab,var(--color-night)_88%,var(--color-neon))]",
        className,
      )}
    >
      {/* 모서리 사선 */}
      <span aria-hidden className="pointer-events-none absolute -left-6 -top-6 size-24 rotate-45 border-b border-aqua/40" />
      <span aria-hidden className="pointer-events-none absolute -left-4 -top-8 size-24 rotate-45 border-b border-neon/30" />
      <span aria-hidden className="pointer-events-none absolute -bottom-6 -right-6 size-24 rotate-45 border-t border-magenta/40" />
      <span aria-hidden className="pointer-events-none absolute -bottom-8 -right-4 size-24 rotate-45 border-t border-neon/30" />

      <div className="flex flex-col sm:flex-row">
        {/* 본권 */}
        <div className="relative flex-1 px-5 py-6">
          <div className="flex items-center justify-center gap-3">
            <OwlMark className="size-9 shrink-0" />
            <p className="display grad-text text-2xl leading-none">OWL GAMES</p>
          </div>
          <p className="mt-2 text-center font-mono text-[11px] tracking-[0.42em] text-neon-soft">{label}</p>
          <div className="mt-4">{children}</div>
        </div>

        {stub !== undefined && (
          <>
            {/* 뜯는 선 — 가로에서는 세로 점선, 세로에서는 가로 점선 */}
            <div aria-hidden className="relative shrink-0">
              <span className="absolute left-1/2 top-0 hidden h-full -translate-x-1/2 border-l border-dashed border-neon/45 sm:block" />
              <span className="absolute left-0 top-1/2 w-full -translate-y-1/2 border-t border-dashed border-neon/45 sm:hidden" />
              {/* 노치 (본체 배경색으로 파낸 반원) */}
              <span className="absolute -top-2.5 left-1/2 hidden size-5 -translate-x-1/2 rounded-full bg-night sm:block" />
              <span className="absolute -bottom-2.5 left-1/2 hidden size-5 -translate-x-1/2 rounded-full bg-night sm:block" />
              <span className="absolute -left-2.5 top-1/2 size-5 -translate-y-1/2 rounded-full bg-night sm:hidden" />
              <span className="absolute -right-2.5 top-1/2 size-5 -translate-y-1/2 rounded-full bg-night sm:hidden" />
              <span className="block h-4 w-full sm:h-full sm:w-5" />
            </div>

            {/* 스텁 */}
            <div className="flex w-full flex-col items-center justify-center gap-1 px-5 py-5 sm:w-[168px]">
              <OwlMark className="size-7" />
              <p className="font-mono text-[10px] tracking-[0.3em] text-neon-soft">OWL GAMES</p>
              <span aria-hidden className="my-1 h-px w-10 bg-neon/40" />
              {stub}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
