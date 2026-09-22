import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Clock, MapPin } from "lucide-react";
import { TicketIssuer } from "./TicketIssuer";
import { PlayerShell } from "@/components/PlayerShell";
import { GachaOdds } from "@/components/GachaOdds";
import { RankBadge } from "@/components/RankBadge";
import { Card, TermLabel } from "@/components/ui/Card";
import { getAppConfig, getMyActiveCode, getMyProfile, getMyTickets, getPrizes } from "@/lib/queries";
import { rankInfo, tierFromRank } from "@/lib/rank";

export const metadata: Metadata = { title: "뽑기 티켓" };

export default async function TicketPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/auth/login");

  const [tickets, activeCode, config, prizes] = await Promise.all([
    getMyTickets(),
    getMyActiveCode(),
    getAppConfig(),
    getPrizes(),
  ]);

  const unused = tickets.filter((t) => t.status === "unused").length;
  const used = tickets.filter((t) => t.status === "used").length;
  const tier = tierFromRank(profile.rank_idx);
  const booth = config.booth_location;
  const r = rankInfo(profile.rank_idx);

  return (
    <PlayerShell profile={profile} current="/ticket">
      <TermLabel>tickets --mine</TermLabel>
      <h1 className="mb-4 mt-1 text-2xl font-black">뽑기 티켓</h1>

      <Card className="flex items-center gap-4">
        <div className="text-5xl">🎟️</div>
        <div className="flex-1">
          <p className="num text-3xl font-black text-neon">{unused}장</p>
          <p className="text-xs text-mute">사용 가능 · 지금까지 {tickets.length}장 획득 / {used}장 사용</p>
        </div>
        <div className="text-right">
          <RankBadge rankIdx={profile.rank_idx} size="md" />
          <p className="num mt-1 text-[11px]" style={{ color: r.colors[0] }}>
            T{tier}
          </p>
        </div>
      </Card>

      <TicketIssuer unused={unused} initialCode={activeCode} ttlMin={config.redeem_code_ttl_min} />

      <section className="mt-8">
        <TermLabel>gacha --odds</TermLabel>
        <h2 className="mb-3 mt-1 text-lg font-extrabold">뽑기 확률</h2>
        <Card>
          <GachaOdds table={config.gacha_table} currentTier={tier} prizes={prizes} />
        </Card>
        <p className="mt-3 rounded-tile border border-aqua/25 bg-aqua/5 px-4 py-3 text-xs leading-relaxed text-aqua">
          확률은 <span className="font-bold">뽑는 시점의 랭크</span> 기준이에요. 티켓을 모아뒀다가 랭크를 올린 뒤
          뽑으면 더 좋은 확률로 뽑을 수 있어요.
        </p>
      </section>

      <section className="mt-8">
        <TermLabel>booth --location</TermLabel>
        <h2 className="mb-3 mt-1 text-lg font-extrabold">부스로 오세요</h2>
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
            <img src={booth.map_url} alt="부스 위치 지도" className="rounded-tile border border-line" />
          )}
          <p className="text-xs text-dim">
            {booth.note ?? "뽑기는 부스에서만 진행돼요. 부원에게 코드를 보여주세요."}
          </p>
        </Card>
      </section>
    </PlayerShell>
  );
}
