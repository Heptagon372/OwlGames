import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PlayerShell } from "@/components/PlayerShell";
import { RankBadge } from "@/components/RankBadge";
import { Card, Chip, TermLabel } from "@/components/ui/Card";
import { formatNumber } from "@/lib/format";
import { GAMES, isGameId } from "@/lib/games";
import { getGameBests, getLeaderboard, getMyPosition, getMyProfile } from "@/lib/queries";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "랭킹" };

const TABS = [
  { key: "all", label: "누적 포인트" },
  ...Object.values(GAMES).map((g) => ({ key: g.id, label: g.title })),
];

export default async function RankPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const profile = await getMyProfile();
  if (!profile) redirect("/auth/login");

  const { tab } = await searchParams;
  const active = tab && (tab === "all" || isGameId(tab)) ? tab : "all";

  const [rows, bests, myPos] = await Promise.all([
    active === "all" ? getLeaderboard(50) : Promise.resolve([]),
    active !== "all" && isGameId(active) ? getGameBests(active, 50) : Promise.resolve([]),
    getMyPosition(profile.id),
  ]);

  const list =
    active === "all"
      ? rows.map((r) => ({
          key: r.user_id,
          position: r.position,
          maskedName: r.masked_name,
          rankIdx: r.rank_idx,
          sub: `Lv ${r.level}`,
          value: `${formatNumber(r.total_points)}P`,
          me: r.user_id === profile.id,
        }))
      : bests.map((b) => ({
          key: b.user_id,
          position: b.position,
          maskedName: b.masked_name,
          rankIdx: b.rank_idx,
          sub: isGameId(active) ? GAMES[active].scoreUnit : "",
          value: formatNumber(b.best_score),
          me: b.user_id === profile.id,
        }));

  return (
    <PlayerShell profile={profile} current="/rank">
      <TermLabel>ranking --board {active}</TermLabel>
      <h1 className="mb-4 mt-1 text-2xl font-black">랭킹</h1>

      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "all" ? "/rank" : `/rank?tab=${t.key}`}
            className={cn(
              "min-h-11 shrink-0 rounded-full border px-4 py-2.5 text-sm font-bold transition-colors",
              active === t.key
                ? "border-neon bg-neon/15 text-neon"
                : "border-line text-mute hover:border-line-strong hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {active === "all" && myPos && (
        <Card className="mb-4 flex items-center gap-3 border-neon/40">
          <span className="num w-10 text-center text-xl font-black text-neon">{myPos.position}</span>
          <RankBadge rankIdx={myPos.rank_idx} size="md" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">
              {profile.name} <Chip tone="neon" className="ml-1">나</Chip>
            </p>
            <p className="num text-xs text-mute">Lv {myPos.level}</p>
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
                {row.me && <Chip tone="neon" className="ml-2">나</Chip>}
              </p>
              <p className="num text-[11px] text-dim">{row.sub}</p>
            </div>
            <span className="num shrink-0 font-bold text-neon">{row.value}</span>
          </div>
        ))}
        {list.length === 0 && <p className="px-4 py-10 text-center text-sm text-dim">아직 기록이 없어요</p>}
      </Card>

      <p className="mt-4 text-center text-xs text-dim">이름은 개인정보 보호를 위해 가운데 글자를 가려요.</p>
    </PlayerShell>
  );
}
