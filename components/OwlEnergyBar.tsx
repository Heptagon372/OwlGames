"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatCountdown } from "@/lib/format";
import { owlEnergyStatus } from "@/lib/rpc";
import type { OwlEnergy } from "@/lib/types";

/** 아울 에너지 — 10분마다 1개씩 충전, 게임 1판에 1개 소모 */
export function OwlEnergyBar({
  initial,
  compact,
  className,
}: {
  initial: OwlEnergy;
  compact?: boolean;
  className?: string;
}) {
  const [status, setStatus] = useState(initial);
  const [left, setLeft] = useState(initial.next_refill_sec);
  const refreshing = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const next = await owlEnergyStatus();
      setStatus(next);
      setLeft(next.next_refill_sec);
    } catch {
      // 조회 실패는 조용히 넘어간다 — 다음 틱에 다시 시도
    } finally {
      refreshing.current = false;
    }
  }, []);

  // 1초 카운트다운, 0이 되면 서버에서 다시 읽는다
  useEffect(() => {
    const t = setInterval(() => {
      setLeft((v) => {
        if (status.energy >= status.cap) return 0;
        if (v <= 1) {
          void refresh();
          return status.next_refill_sec;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [refresh, status.cap, status.energy, status.next_refill_sec]);

  // 탭으로 돌아오면 한 번 더 맞춘다 (백그라운드에서 타이머가 밀리므로)
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const t = setInterval(refresh, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(t);
    };
  }, [refresh]);

  const full = status.energy >= status.cap;
  const pips = Math.max(status.cap, Math.min(status.energy, status.hard_cap));

  if (compact) {
    return (
      <span className={cn("inline-flex items-center gap-1.5", className)} title="아울 에너지">
        <span className="text-sm">🦉</span>
        <span className="num text-sm font-bold text-neon">
          {status.energy}
          <span className="text-[10px] text-mute">/{status.cap}</span>
        </span>
        {!full && <span className="num text-[10px] text-dim">{formatCountdown(left)}</span>}
      </span>
    );
  }

  return (
    <div className={cn("rounded-tile border border-line bg-night/60 px-4 py-3", className)}>
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-bold">
          🦉 아울 에너지
          <span className="num text-neon">
            {status.energy}
            <span className="text-xs text-mute">/{status.cap}</span>
          </span>
        </span>
        <span className="num text-xs text-mute">
          {full ? "가득 참" : `다음 충전 ${formatCountdown(left)}`}
        </span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: pips }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-2.5 flex-1 rounded-full transition-colors",
              i < status.energy
                ? i >= status.cap
                  ? "bg-aqua shadow-[0_0_8px_rgba(61,217,235,0.7)]"
                  : "bg-neon shadow-[0_0_8px_rgba(255,176,32,0.6)]"
                : "bg-panel-2",
            )}
          />
        ))}
      </div>
      <p className="mt-2 text-[11px] text-dim">
        게임 한 판에 {status.cost}개 · {status.cap}개까지 자동 충전 · 부스 미션으로도 받을 수 있어요
      </p>
    </div>
  );
}
