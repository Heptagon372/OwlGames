import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OwlEnergyBar } from "@/components/OwlEnergyBar";
import { PlayerShell } from "@/components/PlayerShell";
import { RankBadge } from "@/components/RankBadge";
import { SignOutButton } from "@/components/SignOutButton";
import { Card, Chip, TermLabel } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { PLACE_EMOJI } from "@/lib/config";
import { formatDateTime, formatNumber } from "@/lib/format";
import { GAMES } from "@/lib/games";
import { getMyDraws, getMyProfile, getOwlEnergy, getMySessions } from "@/lib/queries";
import { rankInfo } from "@/lib/rank";

export const metadata: Metadata = { title: "내 기록" };

export default async function MePage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/auth/login");

  const [sessions, draws, energy] = await Promise.all([getMySessions(30), getMyDraws(), getOwlEnergy()]);
  const r = rankInfo(profile.rank_idx);
  const played = sessions.filter((s) => s.status === "submitted");
  const bestPoints = played.reduce((m, s) => Math.max(m, s.points ?? 0), 0);

  return (
    <PlayerShell profile={profile} energy={energy} current="/me">
      <TermLabel>whoami</TermLabel>
      <h1 className="mb-4 mt-1 text-2xl font-black">내 기록</h1>

      <Card className="flex items-center gap-4">
        <RankBadge rankIdx={profile.rank_idx} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-black">{profile.name}</p>
          <p className="num text-xs text-mute">{profile.student_id}</p>
          <p className="mt-1 text-sm font-bold" style={{ color: r.colors[0] }}>
            {r.name} · Lv {profile.level}
          </p>
        </div>
        {profile.role !== "user" && <Chip tone="aqua">{profile.role}</Chip>}
      </Card>

      <OwlEnergyBar initial={energy} className="mt-3" />

      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { label: "누적 포인트", value: `${formatNumber(profile.total_points)}P` },
          { label: "플레이 수", value: `${played.length}회` },
          { label: "한 판 최고", value: `${bestPoints}P` },
        ].map((s) => (
          <Card key={s.label} className="px-3 py-4 text-center">
            <p className="num text-lg font-black text-neon">{s.value}</p>
            <p className="mt-1 text-[11px] text-mute">{s.label}</p>
          </Card>
        ))}
      </div>

      {profile.role !== "user" && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <ButtonLink href="/booth" variant="outline" block>
            부스 키오스크
          </ButtonLink>
          {profile.role === "admin" && (
            <ButtonLink href="/admin" variant="outline" block>
              관리자
            </ButtonLink>
          )}
        </div>
      )}

      <section className="mt-8">
        <TermLabel>draws --history</TermLabel>
        <h2 className="mb-3 mt-1 text-lg font-extrabold">뽑기 내역</h2>
        <Card className="divide-y divide-line p-0">
          {draws.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3">
              <span className="text-2xl">{d.place ? PLACE_EMOJI[d.place - 1] : "🫥"}</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {d.place ? `${d.place}등 · ${d.prize_name ?? ""}` : "꽝"}
                </p>
                <p className="num text-[11px] text-dim">{formatDateTime(d.drawn_at)} · T{d.tier}</p>
              </div>
              {d.place ? (
                <Chip tone={d.claimed ? "ok" : "alert"}>{d.claimed ? "수령 완료" : "미수령"}</Chip>
              ) : null}
            </div>
          ))}
          {draws.length === 0 && <p className="px-4 py-8 text-center text-sm text-dim">아직 뽑기 내역이 없어요</p>}
        </Card>
      </section>

      <section className="mt-8">
        <TermLabel>plays --recent 30</TermLabel>
        <h2 className="mb-3 mt-1 text-lg font-extrabold">플레이 기록</h2>
        <Card className="divide-y divide-line p-0">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
              <span className="text-xl">{GAMES[s.game].emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{GAMES[s.game].title}</p>
                <p className="num text-[11px] text-dim">
                  {s.submitted_at ? formatDateTime(s.submitted_at) : "-"} · 원점수 {formatNumber(s.raw_score ?? 0)}
                </p>
              </div>
              {s.status === "submitted" ? (
                <span className="num font-bold text-neon">+{s.points ?? 0}P</span>
              ) : (
                <Chip tone="alert">{s.status === "rejected" ? "기록 미인정" : "만료"}</Chip>
              )}
            </div>
          ))}
          {sessions.length === 0 && <p className="px-4 py-8 text-center text-sm text-dim">아직 플레이 기록이 없어요</p>}
        </Card>
      </section>

      <div className="mt-8 flex justify-center">
        <SignOutButton />
      </div>
    </PlayerShell>
  );
}
