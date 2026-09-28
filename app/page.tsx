import { ArrowRight, Gift, Settings, Sparkles, Ticket, Trophy } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/Logo";
import { BrandBanner } from "@/components/brand/BrandBanner";
import { DifficultyChip } from "@/components/DifficultyChip";
import { GameLogo } from "@/components/GameLogo";
import { JoinClubBanner } from "@/components/JoinClubBanner";
import { SetupBanner } from "@/components/SetupBanner";
import { OpenStatus } from "@/components/OpenStatus";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RankBadge } from "@/components/RankBadge";
import { ButtonLink } from "@/components/ui/Button";
import { Card, Chip, TermLabel } from "@/components/ui/Card";
import { PrizeArt } from "@/components/PrizeArt";
import { GAME_IDS, GAMES } from "@/lib/games";
import { getAppConfig, getIsOpen, getMyProfile, getPrizes } from "@/lib/queries";
import { RANKS } from "@/lib/rank";

const STEPS = [
  { icon: Sparkles, key: "play" },
  { icon: Trophy, key: "rank" },
  { icon: Ticket, key: "ticket" },
  { icon: Gift, key: "booth" },
] as const;

export default async function LandingPage() {
  const [config, open, prizes, profile, t, tg, tAbout, tc] = await Promise.all([
    getAppConfig(),
    getIsOpen(),
    getPrizes(),
    getMyProfile(),
    getTranslations("landing"),
    getTranslations("games"),
    getTranslations("about"),
    getTranslations("common"),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16">
      <SetupBanner />
      {/* 375px 에서 로고 부제까지 넣으면 줄이 접혀서 헤더가 두 줄이 된다 — 좁을 때는 부제를 숨긴다 */}
      <header className="flex items-center justify-between gap-2 py-4">
        <span className="sm:hidden">
          <Logo size="sm" compact />
        </span>
        <span className="hidden sm:block">
          <Logo size="sm" />
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <OpenStatus open={open} hours={config.open_hours} />
          <ThemeToggle />
          <Link
            href="/settings"
            aria-label={t("settingsAria")}
            className="grid min-h-11 min-w-11 place-items-center rounded-2xl text-mute transition-colors hover:bg-white/5 hover:text-ink"
          >
            <Settings className="size-5" />
          </Link>
        </div>
      </header>

      {/* 히어로 */}
      <section className="card grad-line glow-iris relative mt-4 overflow-hidden px-6 py-10 text-center">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-40" aria-hidden />
        <div className="relative">
          <h1 className="sr-only">OWL GAMES · 아울게임즈</h1>
          <BrandBanner priority className="max-w-md animate-float drop-shadow-[0_0_46px_rgb(167_139_250/0.3)]" />
          <p className="mt-1 font-mono text-xs tracking-[0.3em] text-aqua">S.OWL · 아울게임즈</p>
          <p className="mt-5 text-[15px] leading-relaxed text-mute">
            {t("tagline")}
            <br />
            {t.rich("tagline2", { b: (c) => <span className="font-bold text-ink">{c}</span> })}
          </p>

          <div className="mt-7 flex flex-col gap-2.5">
            <ButtonLink href={profile ? "/lobby" : "/auth/signup"} size="lg" block>
              {profile ? t("goLobby") : t("start")}
              <ArrowRight className="size-5" />
            </ButtonLink>
            {!profile && (
              <ButtonLink href="/auth/login" variant="outline" block>
                {t("haveAccount")}
              </ButtonLink>
            )}
          </div>

          {!open && (
            <p className="mt-4 font-mono text-xs text-alert">
              {t("closed", { start: config.open_hours.start, end: config.open_hours.end })}
            </p>
          )}
        </div>
      </section>

      {/* 게임 */}
      <section className="mt-10">
        <TermLabel>{t("gamesLabel")}</TermLabel>
        <h2 className="display mt-1 mb-4 text-[26px]">{t("gamesTitle", { count: GAME_IDS.length })}</h2>
        <div className="grid grid-cols-2 gap-3">
          {Object.values(GAMES).map((g) => (
            <Card key={g.id} neon className="flex flex-col items-center gap-2 p-3">
              <GameLogo game={g.id} alt={tg(`${g.id}.title`)} className="h-24 w-full" />
              <p className="line-clamp-2 text-center text-xs text-mute">{tg(`${g.id}.tagline`)}</p>
              <DifficultyChip level={g.difficulty} />
            </Card>
          ))}
        </div>
      </section>

      {/* 진행 방식 */}
      <section className="mt-10">
        <TermLabel>{t("howLabel")}</TermLabel>
        <h2 className="display mt-1 mb-4 text-[26px]">{t("howTitle")}</h2>
        <ol className="grid gap-3 sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.key}>
              <Card className="h-full">
                <div className="flex items-center gap-2">
                  <span className="num text-xs text-dim">0{i + 1}</span>
                  <s.icon className="size-4 text-neon" />
                  <p className="font-bold">{t(`steps.${s.key}.title`)}</p>
                </div>
                <p className="mt-2 text-sm text-mute">{t(`steps.${s.key}.desc`, { count: GAME_IDS.length })}</p>
              </Card>
            </li>
          ))}
        </ol>
        <p className="mt-3 rounded-tile border border-aqua/25 bg-aqua/5 px-4 py-3 text-center text-xs text-aqua">
          {t("offlineOnly")}
        </p>
      </section>

      {/* 랭크 */}
      <section className="mt-10">
        <TermLabel>{t("ranksLabel")}</TermLabel>
        <h2 className="display mt-1 mb-4 text-[26px]">{t("ranksTitle")}</h2>
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
        <TermLabel>{t("prizesLabel")}</TermLabel>
        <h2 className="display mt-1 text-[26px]">{t("prizesTitle")}</h2>
        <p className="mb-4 mt-1 text-xs text-dim">{tc("prizeArtNote")}</p>
        <div className="grid grid-cols-1 gap-2">
          {prizes.map((p) => (
            <Card key={p.place} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <PrizeArt place={p.place} className="size-14" />
                <div>
                  <p className="font-bold">
                    <span className="num mr-2 text-neon">{t("place", { place: p.place })}</span>
                    {p.name}
                  </p>
                </div>
              </div>
              <Chip tone={p.stock > 0 ? "mute" : "alert"}>
                {p.stock > 0 ? t("stock", { stock: p.stock }) : t("soldOut")}
              </Chip>
            </Card>
          ))}
        </div>
      </section>

      <JoinClubBanner className="mt-10" />

      <footer className="mt-12 border-t border-line pt-6 text-center">
        <p className="font-mono text-[11px] text-dim">
          {t("footer", { start: config.open_hours.start, end: config.open_hours.end })}
        </p>
        <p className="mt-1 font-mono text-[11px] text-dim">
          {config.booth_location.building} {config.booth_location.floor} · {config.booth_location.spot}
        </p>
        <Link
          href="/about"
          className="mt-3 inline-flex min-h-11 items-center px-3 font-mono text-[11px] text-mute underline decoration-neon/40 underline-offset-4 transition-colors hover:text-neon"
        >
          {tAbout("link")}
        </Link>
      </footer>
    </div>
  );
}
