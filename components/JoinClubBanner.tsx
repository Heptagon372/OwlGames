import { ArrowUpRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { OwlMark } from "@/components/brand/OwlMark";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

/** S.OWL 동아리 가입 안내 (광고 배너). 외부 링크라 새 탭 + rel 을 붙인다 */
export const CLUB_APPLY_URL = "https://sowlapply.cloud/";

export async function JoinClubBanner({ className }: { className?: string }) {
  const t = await getTranslations("club");

  return (
    <Card glow className={cn("relative overflow-hidden", className)}>
      {/* 흐르는 빛줄기 — 광고처럼 눈이 한 번 가게 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-shimmer bg-linear-to-r from-transparent via-white/10 to-transparent"
      />
      <div className="relative flex flex-wrap items-center gap-4">
        <OwlMark className="size-12 shrink-0" />
        <div className="min-w-[200px] flex-1">
          <p className="num text-[11px] font-bold tracking-[0.22em] text-aqua">{t("label")}</p>
          <p className="display mt-1 text-xl leading-snug">{t("title")}</p>
          <p className="mt-1 text-sm leading-relaxed text-mute">{t("body")}</p>
        </div>
        <a
          href={CLUB_APPLY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="grad-fill inline-flex min-h-12 w-full items-center justify-center gap-1.5 rounded-tile px-5 font-bold text-night transition-transform hover:scale-[1.02] sm:w-auto"
        >
          {t("cta")}
          <ArrowUpRight className="size-4" />
        </a>
      </div>
      <p className="num relative mt-3 text-center text-[11px] text-dim sm:text-right">sowlapply.cloud</p>
    </Card>
  );
}
