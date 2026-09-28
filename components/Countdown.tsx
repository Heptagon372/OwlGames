"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import type { Countdown as CountdownConfig } from "@/lib/config";

/** 칸마다 다른 유리 색 (이미지의 바이올렛·민트 알약) */
const UNITS = [
  { key: "days", color: "var(--color-neon)" },
  { key: "hours", color: "var(--color-aqua)" },
  { key: "minutes", color: "var(--color-neon)" },
  { key: "seconds", color: "var(--color-magenta)" },
] as const;

function split(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { days: Math.floor(s / 86400), hours: Math.floor(s / 3600) % 24, minutes: Math.floor(s / 60) % 60, seconds: s % 60 };
}

/**
 * 로비 카운트다운 (app_config.countdown · 관리자 → 설정에서 수정, DECISIONS §5-45).
 * 끝나면 "수고하셨습니다" 카드로 바뀐다 — 게임은 계속, 뽑기는 추후 공지.
 * 남은 시간은 기기 시계로 센다(표시 전용). 서버와 첫 그림이 어긋나지 않도록 마운트 뒤에 숫자를 채운다.
 */
export function Countdown({ config, className }: { config: CountdownConfig; className?: string }) {
  const t = useTranslations("countdown");
  const locale = useLocale();
  const end = Date.parse(config.ends_at);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!config.enabled || !Number.isFinite(end)) return null;

  const done = now !== null && now >= end;
  const left = split(now === null ? 0 : end - now);
  const until = new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(end);

  return (
    <section
      aria-label={done ? t("doneTitle") : t("title")}
      className={cn("card grad-line relative overflow-hidden px-4 py-4 sm:px-5", className)}
    >
      {/* 유리 너머로 번지는 빛 */}
      <div className="pointer-events-none absolute -left-10 -top-14 size-40 rounded-full bg-neon/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-8 top-4 size-36 rounded-full bg-aqua/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 left-1/3 size-40 rounded-full bg-magenta/15 blur-3xl" />

      {done ? (
        <div className="relative flex items-center gap-4">
          <span className="lq-pill grid size-14 shrink-0 place-items-center rounded-full" style={{ "--lq": "var(--color-ok)" } as React.CSSProperties}>
            <Check className="lq-ink size-7 drop-shadow" strokeWidth={3} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold tracking-wider text-mute">{t("doneLabel")}</p>
            <p className="display grad-text text-2xl">{t("doneTitle")}</p>
            <p className="mt-1 text-sm leading-snug text-mute">{t("doneBody")}</p>
          </div>
        </div>
      ) : (
        <div className="relative">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
            <div>
              <p className="text-[11px] font-bold tracking-wider text-mute">{t("label")}</p>
              <p className="font-extrabold text-ink">{t("title")}</p>
            </div>
            <span className="glass rounded-full px-3 py-1 text-xs text-mute">{t("until", { date: until })}</span>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:gap-3" role="timer" aria-live="off">
            {UNITS.map(({ key, color }) => (
              <div
                key={key}
                className="lq-pill flex flex-col items-center py-3"
                style={{ "--lq": color } as React.CSSProperties}
              >
                <span
                  key={key === "seconds" ? left.seconds : undefined}
                  className={cn("num text-[28px] font-black leading-none lq-ink drop-shadow-sm sm:text-4xl", key === "seconds" && now !== null && "lq-tick")}
                >
                  {now === null ? "--" : String(left[key]).padStart(2, "0")}
                </span>
                <span className="mt-1.5 text-[11px] font-bold lq-ink opacity-85">{t(key)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
