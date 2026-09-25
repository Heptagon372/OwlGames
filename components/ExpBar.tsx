"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { DEFAULT_CURVE, levelProgress, type LevelCurve } from "@/lib/rank";

type Props = {
  /** 누적 포인트 */
  points: number;
  /** 주어지면 fromPoints → points 로 채워지는 애니메이션 (레벨 넘김 포함) */
  fromPoints?: number;
  curve?: LevelCurve;
  durationMs?: number;
  onLevelUp?: (level: number) => void;
  className?: string;
  compact?: boolean;
};

/** 경험치 바 — 결과 모달에서는 레벨을 넘길 때마다 바가 가득 찼다가 다시 시작한다 */
export function ExpBar({ points, fromPoints, curve = DEFAULT_CURVE, durationMs = 1400, onLevelUp, className, compact }: Props) {
  const t = useTranslations("expBar");
  const [shown, setShown] = useState(fromPoints ?? points);
  const lastLevel = useRef(levelProgress(fromPoints ?? points, curve).level);
  const onLevelUpRef = useRef(onLevelUp);
  onLevelUpRef.current = onLevelUp;

  useEffect(() => {
    if (fromPoints === undefined || fromPoints === points) {
      setShown(points);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = fromPoints + (points - fromPoints) * eased;
      setShown(value);
      const lv = levelProgress(value, curve).level;
      if (lv > lastLevel.current) {
        lastLevel.current = lv;
        onLevelUpRef.current?.(lv);
      }
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fromPoints, points, curve, durationMs]);

  const p = levelProgress(shown, curve);
  const maxed = p.need === 0;

  return (
    <div className={cn("w-full", className)}>
      {!compact && (
        <div className="mb-1.5 flex items-baseline justify-between font-mono text-xs">
          <span className="font-bold text-neon-soft">
            Lv <span className="num text-sm">{p.level}</span>
          </span>
          <span className="num text-mute">
            {maxed ? t("max") : `${formatNumber(p.into)} / ${formatNumber(p.need)} P`}
          </span>
        </div>
      )}
      <div
        className="relative h-3 overflow-hidden rounded-full border border-line bg-black/35 backdrop-blur-sm"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(p.ratio * 100)}
        aria-label={`레벨 ${p.level} 경험치`}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-aqua via-neon to-magenta shadow-[0_0_14px_rgb(167_139_250/0.75)]"
          style={{ width: `${Math.max(3, p.ratio * 100)}%` }}
        >
          <div className="shimmer absolute inset-0 rounded-full" />
        </div>
      </div>
    </div>
  );
}
