import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Sparkles, Ticket as TicketIcon, TriangleAlert } from "lucide-react";
import { LiveRefresh } from "@/components/LiveRefresh";
import { OwlEnergyBar } from "@/components/OwlEnergyBar";
import { RankDelta } from "@/components/RankDelta";
import { PlayerShell } from "@/components/PlayerShell";
import { RankBadge } from "@/components/RankBadge";
import { Card, Chip, SectionTitle, TermLabel } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { formatNumber } from "@/lib/format";
import { GAMES } from "@/lib/games";
import { getIsOpen, getLeaderboard, getMyPosition, getMyProfile, getOwlEnergy, getMyTickets } from "@/lib/queries";
import { rankInfo, rankLevelRange } from "@/lib/rank";

export const metadata: Metadata = { title: "로비" };

/** 게임 카드마다 다른 색이 유리 너머로 번진다 (accent → blur 색) */
const BLOOM: Record<string, string> = {
  amber: "bg-amber/20",
  cyan: "bg-aqua/20",
  rose: "bg-magenta/20",
};

export default async function LobbyPage({
  searchParams,
}: {
  searchParams: Promise<{ closed?: string }>;
}) {
  const profile = await getMyProfile();
  if (!profile) redirect("/auth/login");

  const [{ closed }, open, tickets, top, myPos, energy] = await Promise.all([
    searchParams,
    getIsOpen(),
    getMyTickets(),
    getLeaderboard(10),
    getMyPosition(profile.id),
    getOwlEnergy(),
  ]);

  const unused = tickets.filter((t) => t.status === "unused").length;
  const reserved = tickets.filter((t) => t.status === "reserved").length;
  const r = rankInfo(profile.rank_idx);
  const playable = open && energy.energy >= energy.cost;

  return (
    <PlayerShell profile={profile} energy={energy} current="/lobby">
      {/* 남이 올린 점수가 바로 반영되도록 주기적으로 갱신 */}
      <LiveRefresh intervalMs={30000} />
      {(!open || closed) && (
        <div className="mb-4 flex items-center gap-2 rounded-tile border border-alert/40 bg-alert/10 px-4 py-3 text-sm text-alert backdrop-blur-sm">
          <TriangleAlert className="size-4 shrink-0" />
          지금은 운영시간이 아니라 게임을 시작할 수 없어요.
        </div>
      )}

      {/* 내 랭크 — 유리판 위로 랭크 색이 번진다 */}
      <Card glow className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute -right-14 -top-20 size-56 rounded-full blur-3xl"
          style={{ background: r.colors[0], opacity: 0.2 }}
        />
        <div className="relative flex items-center gap-4">
          <RankBadge rankIdx={profile.rank_idx} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-xl font-black tracking-tight" style={{ color: r.colors[0] }}>
              {r.name}
            </p>
            <p className="num mt-0.5 text-xs text-mute">
              {rankLevelRange(profile.rank_idx)} · 티어 T{r.tier}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="text-mute">누적</span>
              <span className="num font-black text-ink">{formatNumber(profile.total_points)}P</span>
              {myPos && <RankDelta position={myPos.position} />}
            </p>
          </div>
        </div>
      </Card>

      {/* 아울 에너지 */}
      <OwlEnergyBar initial={energy} className="mt-3" />

      {/* 티켓 배너 — 앰버는 브랜드(티켓·에너지) 전용 색 */}
      <Link href="/ticket" className="group mt-3 block">
        <div className="grad-line glass relative flex items-center gap-3 overflow-hidden rounded-card px-5 py-4 transition-shadow group-hover:shadow-[0_0_34px_-12px_rgb(255_176_32/0.8),var(--shadow-card)]">
          <div className="pointer-events-none absolute -left-8 top-1/2 size-32 -translate-y-1/2 rounded-full bg-amber/20 blur-3xl" />
          <TicketIcon className="relative size-6 shrink-0 text-amber" />
          <div className="relative min-w-0 flex-1">
            <p className="font-extrabold text-amber-soft">
              {unused > 0 ? `사용 가능한 뽑기 티켓 ${unused}장` : "아직 뽑기 티켓이 없어요"}
            </p>
            <p className="truncate text-xs text-mute">
              {unused > 0
                ? "부스에서 쓸 코드를 발급받으세요"
                : reserved > 0
                  ? `발급된 코드에 ${reserved}장 예약중`
                  : "랭크가 오를 때마다 1장씩 받아요"}
            </p>
          </div>
          <ChevronRight className="relative size-5 shrink-0 text-dim transition-transform group-hover:translate-x-0.5" />
        </div>
      </Link>

      {/* 게임 */}
      <section className="mt-8">
        <TermLabel>games --play</TermLabel>
        <h2 className="mb-3 mt-1 text-lg font-extrabold tracking-tight">뭐 하고 놀까요?</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.values(GAMES).map((g) => (
            <Card key={g.id} className="relative flex flex-col overflow-hidden p-4">
              <div
                className={`pointer-events-none absolute -right-10 -top-12 size-40 rounded-full blur-3xl ${BLOOM[g.accent]}`}
              />
              <div className="relative flex items-start gap-3.5">
                <div className="grad-line grid size-14 shrink-0 place-items-center rounded-tile bg-white/5 text-3xl backdrop-blur-sm">
                  {g.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-extrabold tracking-tight">{g.title}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-mute">{g.tagline}</p>
                </div>
              </div>

              <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
                <Chip className="num text-[10px]">{g.durationLabel}</Chip>
                <Chip className="num text-[10px]">30~300P</Chip>
                <Chip tone="amber" className="num text-[10px]">
                  🦉 {energy.cost}
                </Chip>
              </div>

              <div className="relative mt-3 flex-1 content-end">
                {!open ? (
                  <div className="grid min-h-12 place-items-center rounded-2xl border border-line bg-white/5 text-sm text-dim">
                    운영시간에 열려요
                  </div>
                ) : !playable ? (
                  <div className="grid min-h-12 place-items-center rounded-2xl border border-alert/40 bg-alert/10 text-sm text-alert">
                    🦉 아울 에너지가 부족해요
                  </div>
                ) : (
                  <ButtonLink href={`/game/${g.id}`} block variant={g.accent === "cyan" ? "outline" : "primary"}>
                    플레이
                  </ButtonLink>
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
          title={
            <span className="flex items-center gap-2">
              실시간 랭킹
              <Sparkles className="size-4 text-neon" />
            </span>
          }
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
                className={`relative flex items-center gap-3 px-4 py-3 ${me ? "bg-neon/10" : ""}`}
              >
                {me && <span className="grad-fill absolute inset-y-0 left-0 w-0.5" />}
                <span
                  className={`num w-7 shrink-0 text-center text-sm font-black ${
                    row.position === 1 ? "text-neon text-glow" : row.position <= 3 ? "text-aqua" : "text-dim"
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
                <span className="num shrink-0 text-sm font-bold text-ink">
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
