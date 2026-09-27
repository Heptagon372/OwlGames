import { cn } from "@/lib/cn";

/**
 * 아울게임즈 배너 — 사용자 그림 (scripts/slice-brand.py → public/assets/brand/banner*.webp).
 * 검은 배경이 지워져 있어서 밤하늘 위에 그대로 올라가고,
 * 라이트 테마에서는 CSS(.brand-night/.brand-day)가 진한 사본으로 바꿔 끼운다.
 */
export function BrandBanner({ className, priority }: { className?: string; priority?: boolean }) {
  const common = cn("pointer-events-none mx-auto h-auto w-full select-none", className);
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/brand/banner.webp"
        alt="OWL GAMES · 아울게임즈"
        width={1405}
        height={815}
        draggable={false}
        fetchPriority={priority ? "high" : undefined}
        className={cn("brand-night block", common)}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/brand/banner-light.webp"
        alt=""
        aria-hidden
        width={1405}
        height={815}
        draggable={false}
        className={cn("brand-day", common)}
      />
    </>
  );
}
