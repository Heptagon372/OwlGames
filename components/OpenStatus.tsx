import { getTranslations } from "next-intl/server";
import { Chip } from "./ui/Card";
import type { OpenHours } from "@/lib/config";

/** 운영중 / 준비중 표시 (§1) — 최종 판단은 서버 is_open() */
export async function OpenStatus({ open, hours }: { open: boolean; hours: OpenHours }) {
  const t = await getTranslations("open");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip tone={open ? "ok" : "alert"}>
        <span className={`inline-block size-2 rounded-full ${open ? "bg-ok" : "bg-alert"} ${open ? "animate-pulse" : ""}`} />
        {open ? t("on") : t("off")}
      </Chip>
      {/* 폰에서는 헤더가 좁다 — 운영 여부만 남기고 시간은 감춘다 (푸터에 다시 나온다) */}
      <span className="num hidden text-xs text-mute sm:inline">
        {hours.start} ~ {hours.end} (KST)
      </span>
    </div>
  );
}
