import type { Metadata } from "next";
import { MapPin, Clock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PendingWatcher } from "./PendingWatcher";
import { Logo } from "@/components/brand/Logo";
import { OwlMark } from "@/components/brand/OwlMark";
import { DemoBanner } from "@/components/DemoBanner";
import { Card, TermLabel } from "@/components/ui/Card";
import { SignOutButton } from "@/components/SignOutButton";
import { getAppConfig, getMyProfile } from "@/lib/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pending");
  return { title: t("title") };
}

export default async function PendingPage() {
  const [profile, config, t] = await Promise.all([getMyProfile(), getAppConfig(), getTranslations("pending")]);
  const booth = config.booth_location;

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16">
      <DemoBanner />
      <header className="flex items-center justify-between py-5">
        <Logo size="sm" />
        <SignOutButton />
      </header>

      <Card className="mt-6 text-center">
        <OwlMark sleepy className="mx-auto size-24 animate-float" />
        <h1 className="display mt-4 text-2xl">{t("title")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-mute">
          {profile ? t("hello", { name: profile.name }) : ""}
          {t.rich("body", { b: (c) => <span className="font-bold text-ink">{c}</span> })}
        </p>
        {profile && (
          <p className="num mt-4 inline-block rounded-full border border-line bg-night px-4 py-2 text-sm text-neon">
            {profile.student_id}
          </p>
        )}
        <div className="mt-6 flex items-center justify-center gap-2 font-mono text-xs text-aqua">
          <span className="size-2 animate-pulse rounded-full bg-aqua" />
          {t("watching")}
        </div>
      </Card>

      <section className="mt-6">
        <TermLabel>{t("boothLabel")}</TermLabel>
        <Card className="mt-2 grid gap-3">
          <p className="flex items-center gap-2 font-bold">
            <MapPin className="size-4 text-neon" />
            {booth.building} {booth.floor} · {booth.spot}
          </p>
          <p className="flex items-center gap-2 text-sm text-mute">
            <Clock className="size-4 text-neon" />
            {config.open_hours.start} ~ {config.open_hours.end} (KST)
          </p>
          {booth.note && <p className="text-xs text-dim">{booth.note}</p>}
        </Card>
      </section>

      <PendingWatcher userId={profile?.id ?? null} />
    </div>
  );
}
