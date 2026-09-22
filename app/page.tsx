import { ArrowRight, Gift, Sparkles, Ticket, Trophy } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { OwlMark } from "@/components/brand/OwlMark";
import { DemoBanner } from "@/components/DemoBanner";
import { OpenStatus } from "@/components/OpenStatus";
import { RankBadge } from "@/components/RankBadge";
import { ButtonLink } from "@/components/ui/Button";
import { Card, Chip, TermLabel } from "@/components/ui/Card";
import { PLACE_EMOJI } from "@/lib/config";
import { GAMES } from "@/lib/games";
import { getAppConfig, getIsOpen, getMyProfile, getPrizes } from "@/lib/queries";
import { RANKS } from "@/lib/rank";

const STEPS = [
  { icon: Sparkles, title: "게임 플레이", desc: "미니게임 3종으로 포인트 획득" },
  { icon: Trophy, title: "레벨 · 랭크 상승", desc: "나무부터 챌린저까지 17단계" },
  { icon: Ticket, title: "뽑기 티켓 획득", desc: "랭크가 오를 때마다 1장" },
  { icon: Gift, title: "S.OWL 부스 방문", desc: "부스에서 코드 보여주고 뽑기" },
];

export default async function LandingPage() {
  const [config, open, prizes, profile] = await Promise.all([
    getAppConfig(),
    getIsOpen(),
    getPrizes(),
    getMyProfile(),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16">
      <DemoBanner />
      <header className="flex items-center justify-between py-4">
        <Logo size="sm" />
        <OpenStatus open={open} hours={config.open_hours} />
      </header>

      {/* 히어로 */}
      <section className="relative mt-4 overflow-hidden rounded-card border border-line bg-linear-to-b from-panel-2/70 to-panel/80 px-6 py-10 text-center">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-40" aria-hidden />
        <div className="relative">
          <OwlMark className="mx-auto size-28 animate-float drop-shadow-[0_0_40px_rgb(255_176_32/0.35)]" />
          <h1 className="mt-5 font-mono text-4xl font-black tracking-tight">
            OWL<span className="text-neon text-glow">_</span>GAMES
          </h1>
          <p className="mt-2 font-mono text-xs tracking-[0.3em] text-aqua">S.OWL · 아울게임즈</p>
          <p className="mt-5 text-[15px] leading-relaxed text-mute">
            밤에 깨어있는 부엉이처럼.
            <br />
            게임하고 랭크를 올려 <span className="font-bold text-ink">부스에서 뽑기</span>에 도전하세요.
          </p>

          <div className="mt-7 flex flex-col gap-2.5">
            <ButtonLink href={profile ? "/lobby" : "/auth/signup"} size="lg" block>
              {profile ? "로비로 가기" : "시작하기"}
              <ArrowRight className="size-5" />
            </ButtonLink>
            {!profile && (
              <ButtonLink href="/auth/login" variant="outline" block>
                이미 계정이 있어요
              </ButtonLink>
            )}
          </div>

          {!open && (
            <p className="mt-4 font-mono text-xs text-alert">
              지금은 운영시간이 아니에요 — {config.open_hours.start}~{config.open_hours.end}에 만나요
            </p>
          )}
        </div>
      </section>

      {/* 게임 3종 */}
      <section className="mt-10">
        <TermLabel>games --list</TermLabel>
        <h2 className="mt-1 mb-3 text-lg font-extrabold">미니게임 3종</h2>
        <div className="grid gap-3">
          {Object.values(GAMES).map((g) => (
            <Card key={g.id} className="flex items-center gap-4">
              <div className="grid size-14 shrink-0 place-items-center rounded-tile border border-line bg-night text-3xl">
                {g.emoji}
              </div>
              <div className="min-w-0">
                <p className="font-extrabold">{g.title}</p>
                <p className="truncate text-sm text-mute">{g.tagline}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* 진행 방식 */}
      <section className="mt-10">
        <TermLabel>how-it-works</TermLabel>
        <h2 className="mt-1 mb-3 text-lg font-extrabold">이렇게 진행돼요</h2>
        <ol className="grid gap-3 sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <Card className="h-full">
                <div className="flex items-center gap-2">
                  <span className="num text-xs text-dim">0{i + 1}</span>
                  <s.icon className="size-4 text-neon" />
                  <p className="font-bold">{s.title}</p>
                </div>
                <p className="mt-2 text-sm text-mute">{s.desc}</p>
              </Card>
            </li>
          ))}
        </ol>
        <p className="mt-3 rounded-tile border border-aqua/25 bg-aqua/5 px-4 py-3 text-center text-xs text-aqua">
          뽑기는 온라인에서 할 수 없어요. 티켓 코드를 받아 S.OWL 부스로 오세요 🦉
        </p>
      </section>

      {/* 랭크 */}
      <section className="mt-10">
        <TermLabel>ranks --all 17</TermLabel>
        <h2 className="mt-1 mb-3 text-lg font-extrabold">17단계 랭크</h2>
        <Card className="no-scrollbar overflow-x-auto">
          <div className="flex items-end gap-4">
            {RANKS.map((r) => (
              <div key={r.idx} className="flex w-14 shrink-0 flex-col items-center gap-1.5">
                <RankBadge rankIdx={r.idx} size="sm" />
                <span className="text-center text-[10px] leading-tight text-mute">{r.name}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* 상품 */}
      <section className="mt-10">
        <TermLabel>prizes --stock</TermLabel>
        <h2 className="mt-1 mb-3 text-lg font-extrabold">부스 상품</h2>
        <div className="grid grid-cols-1 gap-2">
          {prizes.map((p) => (
            <Card key={p.place} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{PLACE_EMOJI[p.place - 1]}</span>
                <div>
                  <p className="font-bold">
                    <span className="num mr-2 text-neon">{p.place}등</span>
                    {p.name}
                  </p>
                </div>
              </div>
              <Chip tone={p.stock > 0 ? "mute" : "alert"}>
                {p.stock > 0 ? `남은 수량 ${p.stock}` : "소진"}
              </Chip>
            </Card>
          ))}
        </div>
      </section>

      <footer className="mt-12 border-t border-line pt-6 text-center">
        <p className="font-mono text-[11px] text-dim">
          S.OWL 동아리 부스 행사 · 운영 {config.open_hours.start}~{config.open_hours.end} (KST)
        </p>
        <p className="mt-1 font-mono text-[11px] text-dim">
          {config.booth_location.building} {config.booth_location.floor} · {config.booth_location.spot}
        </p>
      </footer>
    </div>
  );
}
