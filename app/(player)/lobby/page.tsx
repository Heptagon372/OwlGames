import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Ticket as TicketIcon, TriangleAlert } from "lucide-react";
import { PlayerShell } from "@/components/PlayerShell";
import { RankBadge } from "@/components/RankBadge";
import { Card, Chip, SectionTitle, TermLabel } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { formatNumber } from "@/lib/format";
import { GAMES } from "@/lib/games";
import { getIsOpen, getLeaderboard, getMyPosition, getMyProfile, getMyTickets } from "@/lib/queries";
import { rankInfo, rankLevelRange } from "@/lib/rank";

export const metadata: Metadata = { title: "로비" };

export default async function LobbyPage({
  searchParams,
}: {
  searchParams: Promise<{ closed?: string }>;
}) {
  const profile = await getMyProfile();
  if (!profile) redirect("/auth/login");

  const [{ closed }, open, tickets, top, myPos] = await Promise.all([
    searchParams,
    getIsOpen(),
    getMyTickets(),
    getLeaderboard(10),
    getMyPosition(profile.id),
  ]);

  const unused = tickets.filter((t) => t.status === "unused").length;
  const reserved = tickets.filter((t) => t.status === "reserved").length;
  const r = rankInfo(profile.rank_idx);

  return (
    <PlayerShell profile={profile} current="/lobby">
      {(!open || closed) && (
        <div className="mb-4 flex items-center gap-2 rounded-tile border border-alert/40 bg-alert/10 px-4 py-3 text-sm text-alert">
          <TriangleAlert className="size-4 shrink-0" />
          지금은 운영시간이 아니라 게임을 시작할 수 없어요.
        </div>
      )}

      {/* 내 랭크 카드 */}
      <Card className="flex items-center gap-4">
        <RankBadge rankIdx={profile.rank_idx} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-xl font-black" style={{ color: r.colors[0] }}>
            {r.name}
          </p>
          <p className="num mt-0.5 text-xs text-mute">
            {rankLevelRange(profile.rank_idx)} · 티어 T{r.tier}
          </p>
          <p className="mt-2 text-sm">
            누적 <span className="num font-bold text-neon">{formatNumber(profile.total_points)}P</span>
            {myPos && <span className="ml-2 text-mute">전체 {myPos.position}위</span>}
          </p>
        </div>
      </Card>

      {/* 티켓 배너 */}
      <Link href="/ticket" className="mt-3 block">
        <div className="flex items-center gap-3 rounded-card border border-neon/40 bg-linear-to-r from-neon/15 to-transparent px-5 py-4 transition-colors hover:border-neon/70">
          <TicketIcon className="size-6 shrink-0 text-neon" />
          <div className="min-w-0 flex-1">
            <p className="font-extrabold text-neon">
              {unused > 0 ? `사용 가능한 뽑기 티켓 ${unused}장` : "아직 뽑기 티켓이 없어요"}
            </p>
            <p className="truncate text-xs text-neon-soft/80">
              {unused > 0
                ? "부스에서 쓸 코드를 발급받으세요"
                : reserved > 0
                  ? `발급된 코드에 ${reserved}장 예약중`
                  : "랭크가 오를 때마다 1장씩 받아요"}
            </p>
          </div>
          <ChevronRight className="size-5 shrink-0 text-neon/70" />
        </div>
      </Link>

      {/* 게임 */}
      <section className="mt-8">
        <TermLabel>games --play</TermLabel>
        <h2 className="mb-3 mt-1 text-lg font-extrabold">뭐 하고 놀까요?</h2>
        <div className="grid gap-3">
          {Object.values(GAMES).map((g) => (
            <Card key={g.id} className="relative overflow-hidden">
              <div className="flex items-center gap-4">
                <div className="grid size-16 shrink-0 place-items-center rounded-tile border border-line bg-night text-4xl">
                  {g.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-extrabold">{g.title}</p>
                  <p className="mt-0.5 text-sm text-mute">{g.tagline}</p>
                  <p className="num mt-1.5 text-[11px] text-dim">
                    {g.id === "flight" ? `최대 ${g.duration}초` : `${g.duration}초`} · 30~300P
                  </p>
                </div>
              </div>
              <div className="mt-4">
                {open ? (
                  <ButtonLink href={`/game/${g.id}`} block variant={g.accent === "amber" ? "primary" : "outline"}>
                    플레이
                  </ButtonLink>
                ) : (
                  <div className="grid min-h-12 place-items-center rounded-2xl border border-line bg-night/60 text-sm text-dim">
                    운영시간에 열려요
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* 미니 랭킹 */}
      <section className="mt-8">
        <SectionTitle
          label="ranking --top 10"
          title="실시간 랭킹"
          action={
            <Link href="/rank" className="flex items-center gap-1 text-sm font-bold text-aqua hover:underline">
              전체 보기 <ChevronRight className="size-4" />
            </Link>
          }
        />
        <Card className="divide-y divide-line p-0">
          {top.map((row) => {
            const me = row.user_id === profile.id;
            return (
              <div
                key={row.user_id}
                className={`flex items-center gap-3 px-4 py-3 ${me ? "bg-neon/10" : ""}`}
              >
                <span
                  className={`num w-7 shrink-0 text-center text-sm font-bold ${
                    row.position <= 3 ? "text-neon" : "text-dim"
                  }`}
                >
                  {row.position}
                </span>
                <RankBadge rankIdx={row.rank_idx} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">
                    {row.masked_name}
                    {me && <Chip tone="neon" className="ml-2">나</Chip>}
                  </p>
                  <p className="num text-[11px] text-mute">Lv {row.level}</p>
                </div>
                <span className="num shrink-0 text-sm font-bold text-neon">
                  {formatNumber(row.total_points)}P
                </span>
              </div>
            );
          })}
          {top.length === 0 && <p className="px-4 py-8 text-center text-sm text-dim">아직 기록이 없어요</p>}
        </Card>
      </section>
    </PlayerShell>
  );
}
