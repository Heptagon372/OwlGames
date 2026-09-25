import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SignUpForm } from "./SignUpForm";
import { Logo } from "@/components/brand/Logo";
import { DemoBanner } from "@/components/DemoBanner";
import { getAppConfig } from "@/lib/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("signup") };
}

export default async function SignUpPage() {
  const [config, t] = await Promise.all([getAppConfig(), getTranslations("auth")]);
  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16">
      <DemoBanner />
      <header className="py-5">
        <Logo size="sm" />
      </header>
      <h1 className="display mb-1 mt-4 text-4xl">{t("signup")}</h1>
      <p className="mb-6 text-sm text-mute">{t("signupHint")}</p>
      <SignUpForm studentIdPattern={config.student_id_pattern} />
      <p className="mt-6 text-center text-sm text-mute">
        {t("haveAccount")}{" "}
        <Link href="/auth/login" className="font-bold text-aqua hover:underline">
          {t("login")}
        </Link>
      </p>
    </div>
  );
}
