import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/Logo";
import { SettingsScreen } from "@/components/SettingsScreen";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { getMyProfile } from "@/lib/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default async function SettingsPage() {
  const [raw, t, profile] = await Promise.all([getLocale(), getTranslations("settings"), getMyProfile()]);
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;

  return (
    <div className="mx-auto flex min-h-dvh-safe w-full max-w-2xl flex-col">
      <header className="sticky top-0 z-30 bg-night/60 backdrop-blur-xl backdrop-saturate-150">
        <div className="flex items-center gap-2 px-4 py-3">
          <Link
            href={profile ? "/lobby" : "/"}
            className="-ml-2 inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-bold text-mute transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" />
            {t("back")}
          </Link>
          <span className="ml-auto">
            <Logo size="sm" href={profile ? "/lobby" : "/"} />
          </span>
        </div>
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-neon/45 to-transparent" />
      </header>

      <main className="flex-1 px-4 pb-16 pt-5">
        <h1 className="display mb-1 text-4xl">{t("title")}</h1>
        <p className="mb-5 text-sm text-mute">{t("subtitle")}</p>
        <SettingsScreen locale={locale} />
      </main>
    </div>
  );
}
