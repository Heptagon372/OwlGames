import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Clock, MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { TicketIssuer } from "./TicketIssuer";
import { PlayerShell } from "@/components/PlayerShell";
import { GachaOdds } from "@/components/GachaOdds";
import { GachaTicket } from "@/components/GachaTicket";
import { RankBadge } from "@/components/RankBadge";
import { Card, TermLabel } from "@/components/ui/Card";
import { getAppConfig, getMyActiveCode, getMyProfile, getOwlEnergy, getMyTickets, getPrizes } from "@/lib/queries";
import { MAX_RANK, rankInfo, tierFromRank } from "@/lib/rank";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ticket");
  return { title: t("title") };
}

export default async function TicketPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/auth/login");

  const [tickets, activeCode, config, prizes, energy, t, tAbout] = await Promise.all([
    getMyTickets(),
    getMyActiveCode(),
    getAppConfig(),
    getPrizes(),
    getOwlEnergy(),
    getTranslations("ticket"),
    getTranslations("about"),
  ]);

  const unused = tickets.filter((t) => t.status === "unused").length;
  const used = tickets.filter((t) => t.status === "used").length;
  // 티어는 티켓을 얻은 랭크 기준 (DECISIONS §5-28) — 다음에 뽑힐 티켓(가장 오래된 것)의 티어를 보여준다.
  // 남은 티켓이 없으면 다음에 얻을 티켓(= 다음 랭크, 챌린저면 보너스 티켓 = T11)의 티어
  const nextTicket = tickets.find((t) => t.status !== "used");
  const tier = tierFromRank(nextTicket ? nextTicket.earned_rank_idx : profile.rank_idx + 1);
  const booth = config.booth_location;
  const r = rankInfo(profile.rank_idx);

  return (
    <PlayerShell profile={profile} energy={energy} current="/ticket">
      <TermLabel>tickets --mine</TermLabel>
      <h1 className="display mb-4 mt-1 text-3xl">{t("title")}</h1>

      <GachaTicket
        stub={
          <>
            <RankBadge rankIdx={profile.rank_idx} size="md" />
            <p className="rank-ink num mt-1 text-center text-[11px]" style={{ color: r.colors[0] }}>
              {t("nextTier")} T{tier}
            </p>
          </>
        }
      >
        <p className="num text-center text-4xl font-black text-neon text-glow">{t("count", { count: unused })}</p>
        <p className="mt-1 text-center text-xs text-mute">{t("summary", { total: tickets.length, used })}</p>
      </GachaTicket>

      {profile.rank_idx >= MAX_RANK && (
        <p className="mt-4 rounded-tile border border-amber/40 bg-amber/10 px-4 py-3 text-sm leading-relaxed text-amber">
          {t("bonusNote")}
        </p>
      )}

      {profile.review_required && (
        <p className="mt-4 rounded-tile border border-amber/40 bg-amber/10 px-4 py-3 text-sm leading-relaxed text-amber">
          {t("reviewNote")}
        </p>
      )}

      <TicketIssuer unused={unused} initialCode={activeCode} ttlMin={config.redeem_code_ttl_min} />

      <section className="mt-8">
        <TermLabel>{t("oddsLabel")}</TermLabel>
        <h2 className="mb-3 mt-1 text-lg font-extrabold">{t("oddsTitle")}</h2>
        <Card>
          <GachaOdds table={config.gacha_table} currentTier={tier} prizes={prizes} />
        </Card>
        <p className="mt-3 rounded-tile border border-aqua/25 bg-aqua/5 px-4 py-3 text-xs leading-relaxed text-aqua">
          {t.rich("oddsNote", { b: (c) => <span className="font-bold">{c}</span> })}
        </p>
        <Link
          href="/about"
          className="mt-2 inline-flex min-h-11 items-center gap-1 px-1 text-xs font-bold text-mute underline decoration-neon/40 underline-offset-4 transition-colors hover:text-neon"
        >
          {tAbout("prizes.title")}
          <ChevronRight className="size-3.5" />
        </Link>
      </section>

      <section className="mt-8">
        <TermLabel>{t("boothLabel")}</TermLabel>
        <h2 className="mb-3 mt-1 text-lg font-extrabold">{t("boothTitle")}</h2>
        <Card className="grid gap-3">
          <p className="flex items-center gap-2 font-bold">
            <MapPin className="size-4 text-neon" />
            {booth.building} {booth.floor} · {booth.spot}
          </p>
          <p className="flex items-center gap-2 text-sm text-mute">
            <Clock className="size-4 text-neon" />
            {config.open_hours.start} ~ {config.open_hours.end} (KST)
          </p>
          {booth.map_url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={booth.map_url} alt={t("mapAlt")} className="rounded-tile border border-line" />
          )}
          <p className="text-xs text-dim">
            {booth.note ?? t("boothNote")}
          </p>
        </Card>
      </section>
    </PlayerShell>
  );
}
