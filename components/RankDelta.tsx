"use client";

// 실시간 등수 표시 — 지금 몇 위인지, 지난 판 이후 몇 계단 오르내렸는지.
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

const KEY = "owlgames.lastPosition";

/** 결과 화면에서 마지막 등수를 기록해 둔다 (다음 로비 진입 때 변동을 보여주려고) */
export function recordPosition(position: number): void {
  try {
    window.localStorage.setItem(KEY, String(position));
  } catch {
    // 사생활 보호 모드 등 — 기록 못 해도 등수 자체는 보인다
  }
}

export function readLastPosition(): number | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** 등수 변동 칩 — 숫자가 작아질수록(1위에 가까울수록) 상승 */
export function DeltaChip({ from, to, className }: { from: number | null; to: number; className?: string }) {
  const t = useTranslations("rankDelta");
  if (from === null || from === to) {
    return (
      <span className={cn("inline-flex items-center gap-0.5 text-xs text-dim", className)}>
        <Minus className="size-3" />
        <span className="num">{t("same")}</span>
      </span>
    );
  }
  const up = to < from;
  const diff = Math.abs(to - from);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-bold",
        up ? "bg-ok/15 text-ok" : "bg-alert/15 text-alert",
        className,
      )}
    >
      {up ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
      <span className="num">{diff}</span>
    </span>
  );
}

/** 로비용 — 현재 등수 + 지난 판 이후 변동 */
export function RankDelta({ position, className }: { position: number; className?: string }) {
  const t = useTranslations("rankDelta");
  const [last, setLast] = useState<number | null>(null);

  useEffect(() => {
    setLast(readLastPosition());
  }, []);

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="num text-mute">{t("overall", { position })}</span>
      <DeltaChip from={last} to={position} />
    </span>
  );
}
