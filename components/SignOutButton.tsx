import { LogOut } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { signOutAction } from "@/app/auth/actions";

export async function SignOutButton({ label }: { label?: string }) {
  const t = await getTranslations("auth");
  const text = label ?? t("signOut");
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-mute hover:bg-white/5 hover:text-ink"
      >
        <LogOut className="size-4" />
        {text}
      </button>
    </form>
  );
}
