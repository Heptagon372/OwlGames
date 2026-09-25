import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Clock, MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { TicketIssuer } from "./TicketIssuer";
import { PlayerShell } from "@/components/PlayerShell";
import { GachaOdds } from "@/components/GachaOdds";
import { RankBadge } from "@/components/RankBadge";
import { Card, TermLabel } from "@/components/ui/Card";
import { getAppConfig, getMyActiveCode, getMyProfile, getOwlEnergy, getMyTickets, getPrizes } from "@/lib/queries";
import { rankInfo, tierFromRank } from "@/lib/rank";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ticket");
  return { title: t("title") };
}

export default async function TicketPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/auth/login");

  const [tickets, activeCode, config, prizes, energy, t] = await Promise.all([
    getMyTickets(),
    getMyActiveCode(),
    getAppConfig(),
    getPrizes(),
    getOwlEnergy(),
    getTranslations("ticket"),
  ]);

  const unused = tickets.filter((t) => t.status === "unused").length;
  const used = tickets.filter((t) => t.status === "used").length;
  const tier = tierFromRank(profile.rank_idx);
  const booth = config.booth_location;
  const r = rankInfo(profile.rank_idx);

  return (
    <PlayerShell profile={profile} energy={energy} current="/ticket">
      <TermLabel>tickets --mine</TermLabel>
      <h1 className="display mb-4 mt-1 text-3xl">{t("title")}</h1>

      <Card className="flex items-center gap-4">
        <div className="text-5xl">🎟️</div>
        <div className="flex-1">
          <p className="num text-3xl font-black text-neon">{t("count", { count: unused })}</p>
          <p className="text-xs text-mute">{t("summary", { total: tickets.length, used })}</p>
        </div>
        <div className="text-right">
          <RankBadge rankIdx={profile.rank_idx} size="md" />
          <p className="rank-ink num mt-1 text-[11px]" style={{ color: r.colors[0] }}>
            T{tier}
          </p>
        </div>
      </Card>

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
