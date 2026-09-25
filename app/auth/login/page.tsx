import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "./LoginForm";
import { Logo } from "@/components/brand/Logo";
import { DemoBanner } from "@/components/DemoBanner";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("login") };
}

export default async function LoginPage() {
  const t = await getTranslations("auth");
  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16">
      <DemoBanner />
      <header className="py-5">
        <Logo size="sm" />
      </header>
      <h1 className="display mb-1 mt-4 text-4xl">{t("login")}</h1>
      <p className="mb-6 text-sm text-mute">{t("loginHint")}</p>
      <LoginForm />
      <p className="mt-6 text-center text-sm text-mute">
        {t("noAccount")}{" "}
        <Link href="/auth/signup" className="font-bold text-aqua hover:underline">
          {t("signup")}
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-dim">
        {t("forgot")}
      </p>
    </div>
  );
}
