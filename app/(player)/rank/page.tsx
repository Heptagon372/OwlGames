import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LiveRefresh } from "@/components/LiveRefresh";
import { PlayerShell } from "@/components/PlayerShell";
import { RankDelta } from "@/components/RankDelta";
import { RankBadge } from "@/components/RankBadge";
import { Card, Chip, TermLabel } from "@/components/ui/Card";
import { formatNumber } from "@/lib/format";
import { GAMES, isGameId } from "@/lib/games";
import { getGameBests, getLeaderboard, getMyPosition, getMyProfile, getOwlEnergy } from "@/lib/queries";
import { cn } from "@/lib/cn";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("rank");
  return { title: t("title") };
}

export default async function RankPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const profile = await getMyProfile();
  if (!profile) redirect("/auth/login");

  const { tab } = await searchParams;
  const active = tab && (tab === "all" || isGameId(tab)) ? tab : "all";

  const [rows, bests, myPos, energy, t, tc, tg] = await Promise.all([
    active === "all" ? getLeaderboard(50) : Promise.resolve([]),
    active !== "all" && isGameId(active) ? getGameBests(active, 50) : Promise.resolve([]),
    getMyPosition(profile.id),
    getOwlEnergy(),
    getTranslations("rank"),
    getTranslations("common"),
    getTranslations("games"),
  ]);

  // 탭 라벨은 언어에 따라 바뀌므로 요청 안에서 만든다
  const tabs = [
    { key: "all", label: t("tabAll") },
    ...Object.values(GAMES).map((g) => ({ key: g.id, label: tg(`${g.id}.title`) })),
  ];

  const list =
    active === "all"
      ? rows.map((r) => ({
          key: r.user_id,
          position: r.position,
          maskedName: r.masked_name,
          rankIdx: r.rank_idx,
          sub: tc("level", { level: r.level }),
          value: `${formatNumber(r.total_points)}P`,
          me: r.user_id === profile.id,
        }))
      : bests.map((b) => ({
          key: b.user_id,
          position: b.position,
          maskedName: b.masked_name,
          rankIdx: b.rank_idx,
          sub: tc("scoreUnit"),
          value: formatNumber(b.best_score),
          me: b.user_id === profile.id,
        }));

  return (
    <PlayerShell profile={profile} energy={energy} current="/rank">
      <LiveRefresh intervalMs={20000} />
      <TermLabel>{t("label", { tab: active })}</TermLabel>
      <div className="mb-4 mt-1 flex items-end justify-between gap-2">
        <h1 className="display text-3xl">{t("title")}</h1>
        <span className="flex items-center gap-1.5 text-xs text-dim">
          <span className="inline-block size-1.5 animate-pulse rounded-full bg-ok" />
          {t("autoRefresh")}
        </span>
      </div>

      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.key === "all" ? "/rank" : `/rank?tab=${tab.key}`}
            className={cn(
              "min-h-11 shrink-0 rounded-full border px-4 py-2.5 text-sm font-bold transition-colors",
              active === tab.key
                ? "border-neon bg-neon/15 text-neon"
                : "border-line text-mute hover:border-line-strong hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {active === "all" && myPos && (
        <Card className="mb-4 flex items-center gap-3 border-neon/40">
          <span className="num w-10 text-center text-xl font-black text-neon">{myPos.position}</span>
          <RankBadge rankIdx={myPos.rank_idx} size="md" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">
              {profile.name}{" "}
              <Chip tone="neon" className="ml-1">
                {tc("me")}
              </Chip>
            </p>
            <p className="num text-xs text-mute">{tc("level", { level: myPos.level })}</p>
            <RankDelta position={myPos.position} className="mt-1 text-[11px]" />
          </div>
          <span className="num font-black text-neon">{formatNumber(myPos.total_points)}P</span>
        </Card>
      )}

      <Card className="divide-y divide-line p-0">
        {list.map((row) => (
          <div key={row.key} className={cn("flex items-center gap-3 px-4 py-3", row.me && "bg-neon/10")}>
            <span
              className={cn(
                "num w-7 shrink-0 text-center text-sm font-bold",
                row.position === 1 && "text-neon text-glow",
                row.position > 1 && row.position <= 3 && "text-neon",
                row.position > 3 && "text-dim",
              )}
            >
              {row.position}
            </span>
            <RankBadge rankIdx={row.rankIdx} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">
                {row.maskedName}
                {row.me && (
                  <Chip tone="neon" className="ml-2">
                    {tc("me")}
                  </Chip>
                )}
              </p>
              <p className="num text-[11px] text-dim">{row.sub}</p>
            </div>
            <span className="num shrink-0 font-bold text-neon">{row.value}</span>
          </div>
        ))}
        {list.length === 0 && <p className="px-4 py-10 text-center text-sm text-dim">{t("empty")}</p>}
      </Card>

      <p className="mt-4 text-center text-xs text-dim">{t("maskNote")}</p>
    </PlayerShell>
  );
}
