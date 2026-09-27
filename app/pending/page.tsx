import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PendingWatcher } from "./PendingWatcher";
import { Logo } from "@/components/brand/Logo";
import { OwlMark } from "@/components/brand/OwlMark";
import { SetupBanner } from "@/components/SetupBanner";
import { Card } from "@/components/ui/Card";
import { SignOutButton } from "@/components/SignOutButton";
import { getMyProfile } from "@/lib/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pending");
  return { title: t("title") };
}

export default async function PendingPage() {
  // 부스로 오라고 하지 않는다 — 운영진이 가입 정보를 대조하는 동안 기다리는 화면 (DECISIONS §5-39)
  const [profile, t] = await Promise.all([getMyProfile(), getTranslations("pending")]);

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16">
      <SetupBanner />
      <header className="flex items-center justify-between py-5">
        <Logo size="sm" />
        <SignOutButton />
      </header>

      <Card className="mt-6 text-center">
        <OwlMark className="mx-auto size-24 animate-float" />
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

      <PendingWatcher userId={profile?.id ?? null} />
    </div>
  );
}
