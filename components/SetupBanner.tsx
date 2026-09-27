import { getTranslations } from "next-intl/server";
import { isConfigured } from "@/lib/env";

/** Supabase 미설정 시 상단에 표시 — 로그인·게임·기록이 전부 막혀 있다는 안내 */
export async function SetupBanner() {
  if (isConfigured) return null;
  const t = await getTranslations("setup");
  return (
    <div className="border-b border-line bg-white/4 px-4 py-2 text-center font-mono text-[11px] text-mute backdrop-blur-sm">
      {t("banner")}
    </div>
  );
}
