import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Gift, ScrollText, ShieldCheck, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/Logo";
import { OwlMark } from "@/components/brand/OwlMark";
import { JoinClubBanner } from "@/components/JoinClubBanner";
import { Card, TermLabel } from "@/components/ui/Card";
import { getMyProfile } from "@/lib/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("about");
  return { title: t("title") };
}

type Item = { title: string; body: string };
type CreditRow = { role: string; name: string };

/** 제작진 · 개인정보 처리 방침 · 경품 안내 (§13 · DECISIONS §5-36). 로그인 없이도 볼 수 있다 */
export default async function AboutPage() {
  const [t, profile] = await Promise.all([getTranslations("about"), getMyProfile()]);
  const home = profile ? "/lobby" : "/";

  const credits = t.raw("credits.rows") as CreditRow[];
  const privacy = t.raw("privacy.items") as Item[];
  const prizes = t.raw("prizes.items") as Item[];
  const legal = t.raw("legal.items") as Item[];

  return (
    <div className="mx-auto flex min-h-dvh-safe w-full max-w-2xl flex-col">
      <header className="sticky top-0 z-30 bg-night/60 backdrop-blur-xl backdrop-saturate-150">
        <div className="flex items-center gap-2 px-4 py-3">
          <Link
            href={home}
            className="-ml-2 inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-bold text-mute transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" />
            {t("back")}
          </Link>
          <span className="ml-auto">
            <Logo size="sm" href={home} />
          </span>
        </div>
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-neon/45 to-transparent" />
      </header>

      <main className="flex-1 px-4 pb-16 pt-5">
        <h1 className="display mb-1 text-4xl">{t("title")}</h1>
        <p className="mb-6 text-sm text-mute">{t("subtitle")}</p>

        {/* 제작진 */}
        <section>
          <TermLabel>{t("credits.label")}</TermLabel>
          <h2 className="display mb-4 mt-1 flex items-center gap-2 text-2xl">
            <Users className="size-5 text-aqua" />
            {t("credits.title")}
          </h2>
          <Card className="grid gap-0 p-0">
            <div className="flex items-center justify-center gap-3 px-5 pb-1 pt-6">
              <OwlMark className="size-10 shrink-0" />
              <p className="display grad-text text-2xl leading-none">OWL GAMES</p>
            </div>
            <dl className="grid gap-0 px-5 pb-5 pt-4">
              {credits.map((row) => (
                <div
                  key={row.role}
                  className="grid grid-cols-[auto_1fr] items-baseline gap-3 border-b border-line/60 py-2.5 last:border-0"
                >
                  <dt className="num text-xs font-bold tracking-wide text-dim">{row.role}</dt>
                  <dd className="text-right text-sm font-bold text-ink">{row.name}</dd>
                </div>
              ))}
            </dl>
            <p className="rounded-b-card border-t border-line bg-neon/8 px-5 py-4 text-center text-sm leading-relaxed text-neon-soft">
              {t("credits.note")}
            </p>
          </Card>
          <JoinClubBanner className="mt-4" />
        </section>

        {/* 개인정보 */}
        <Section
          icon={<ShieldCheck className="size-5 text-ok" />}
          label={t("privacy.label")}
          title={t("privacy.title")}
          intro={t("privacy.intro")}
          items={privacy}
        >
          <Card className="mt-3 border-ok/30 bg-ok/6">
            <p className="text-xs font-bold text-ok">{t("privacy.contactTitle")}</p>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-mute">{t("privacy.contact")}</p>
          </Card>
        </Section>

        {/* 경품 */}
        <Section
          icon={<Gift className="size-5 text-amber" />}
          label={t("prizes.label")}
          title={t("prizes.title")}
          intro={t("prizes.intro")}
          items={prizes}
        />

        {/* 그 밖의 안내 */}
        <Section
          icon={<ScrollText className="size-5 text-magenta" />}
          label={t("legal.label")}
          title={t("legal.title")}
          items={legal}
        />

        <p className="num mt-8 text-center text-[11px] text-dim">{t("updated")}</p>
      </main>
    </div>
  );
}

function Section({
  icon,
  label,
  title,
  intro,
  items,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  intro?: string;
  items: Item[];
  children?: React.ReactNode;
}) {
  return (
    <section className="mt-9">
      <TermLabel>{label}</TermLabel>
      <h2 className="display mb-2 mt-1 flex items-center gap-2 text-2xl">
        {icon}
        {title}
      </h2>
      {intro && <p className="mb-4 text-sm leading-relaxed text-mute">{intro}</p>}
      <Card className="grid gap-4">
        {items.map((item) => (
          <div key={item.title} className="grid gap-1">
            <p className="text-sm font-extrabold text-ink">{item.title}</p>
            <p className="text-sm leading-relaxed text-mute">{item.body}</p>
          </div>
        ))}
      </Card>
      {children}
    </section>
  );
}
