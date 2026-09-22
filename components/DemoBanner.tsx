import { isDemo } from "@/lib/env";

/** Supabase 미설정 시 상단에 표시 — 화면·디자인 확인용 가짜 데이터라는 안내 */
export function DemoBanner() {
  if (!isDemo) return null;
  return (
    <div className="border-b border-neon/25 bg-neon/10 px-4 py-2 text-center font-mono text-[11px] text-neon-soft">
      DEMO MODE · Supabase 미설정 — 화면은 전부 가짜 데이터이고 저장되지 않습니다
    </div>
  );
}
