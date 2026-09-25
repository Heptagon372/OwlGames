import { getTranslations } from "next-intl/server";
import { isDemo } from "@/lib/env";

/** Supabase 미설정 시 상단에 표시 — 화면·디자인 확인용 가짜 데이터라는 안내 */
export async function DemoBanner() {
  if (!isDemo) return null;
  const t = await getTranslations("demo");
  return (
    <div className="border-b border-line bg-white/4 px-4 py-2 text-center font-mono text-[11px] text-mute backdrop-blur-sm">
      {t("banner")}
    </div>
  );
}
