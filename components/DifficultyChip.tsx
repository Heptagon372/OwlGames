import { useTranslations } from "next-intl";
import { Chip } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import type { Difficulty } from "@/lib/games";

/** 난이도 색 — 쉬울수록 초록, 어려울수록 빨강 */
const TONE = { 1: "ok", 2: "aqua", 3: "neon", 4: "amber", 5: "alert" } as const;

/** 게임 난이도 칩 — "난이도 ●●●○○ 보통" (DECISIONS §5-46). 서버·클라이언트 컴포넌트 어디서나 쓴다 */
export function DifficultyChip({ level, className }: { level: Difficulty; className?: string }) {
  const t = useTranslations("common.difficulty");
  return (
    <Chip tone={TONE[level]} className={cn("text-[10px]", className)}>
      <span className="sr-only">{t("label")}</span>
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={cn("size-1.5 rounded-full bg-current", i > level && "opacity-25")} />
        ))}
      </span>
      {t(String(level) as "1")}
    </Chip>
  );
}
