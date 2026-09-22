import { Chip } from "./ui/Card";
import type { OpenHours } from "@/lib/config";

/** 운영중 / 준비중 표시 (§1) — 최종 판단은 서버 is_open() */
export function OpenStatus({ open, hours }: { open: boolean; hours: OpenHours }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip tone={open ? "ok" : "alert"}>
        <span className={`inline-block size-2 rounded-full ${open ? "bg-ok" : "bg-alert"} ${open ? "animate-pulse" : ""}`} />
        {open ? "운영중" : "운영시간 아님"}
      </Chip>
      <span className="num text-xs text-mute">
        {hours.start} ~ {hours.end} (KST)
      </span>
    </div>
  );
}
