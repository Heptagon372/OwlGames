"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Languages, Monitor, Volume2, VolumeX } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { Card, TermLabel } from "./ui/Card";
import { Button } from "./ui/Button";
import { cn } from "@/lib/cn";
import { LOCALES, LOCALE_COOKIE, LOCALE_LABEL, LOCALE_MAX_AGE, type Locale } from "@/lib/locale";
import { applyScale, currentScale, DEFAULT_SCALE, SCALES, type Scale } from "@/lib/prefs";
import { getSoundPrefs, playSfx, setSoundPrefs } from "@/lib/sound";

const SCALE_KEYS = ["small", "normal", "large", "xlarge"] as const;

export function SettingsScreen({ locale }: { locale: Locale }) {
  const t = useTranslations("settings");
  const router = useRouter();

  const [scale, setScale] = useState<Scale>(DEFAULT_SCALE);
  const [sound, setSound] = useState({ on: true, volume: 0.6 });
  const [busy, setBusy] = useState(false);

  // 저장된 값은 브라우저에만 있어서 마운트 뒤에 읽는다 (SSR 과 어긋나지 않게)
  useEffect(() => {
    setScale(currentScale());
    setSound(getSoundPrefs());
  }, []);

  const pickScale = useCallback((s: Scale) => {
    setScale(s);
    applyScale(s);
    playSfx("tap");
  }, []);

  const pickSound = useCallback((next: { on: boolean; volume: number }) => {
    setSound(next);
    setSoundPrefs(next);
    if (next.on) playSfx("ok");
  }, []);

  const pickLocale = useCallback(
    (next: Locale) => {
      if (next === locale) return;
      setBusy(true);
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_MAX_AGE}; samesite=lax`;
      // 서버 컴포넌트가 새 언어로 다시 그려진다
      router.refresh();
      window.setTimeout(() => setBusy(false), 800);
    },
    [locale, router],
  );

  return (
    <div className="grid gap-5">
      {/* 화면 */}
      <section>
        <TermLabel>display --screen</TermLabel>
        <h2 className="display mb-4 mt-1 flex items-center gap-2 text-2xl">
          <Monitor className="size-5 text-aqua" />
          {t("display.title")}
        </h2>
        <Card className="grid gap-5">
          <Row title={t("display.theme")} hint={t("display.themeHint")}>
            <ThemeToggle label />
          </Row>

          <Row title={t("display.size")} hint={t("display.sizeHint")}>
            <span className="num text-xs text-dim">{Math.round(scale * 100)}%</span>
          </Row>
          <div className="grid grid-cols-4 gap-2">
            {SCALES.map((s, i) => {
              const on = s === scale;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => pickScale(s)}
                  aria-pressed={on}
                  className={cn(
                    "flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-tile border px-1 transition-colors",
                    on
                      ? "grad-line border-transparent bg-neon/12 text-ink"
                      : "border-line bg-white/5 text-mute hover:text-ink",
                  )}
                >
                  {/* 미리보기: 실제로 그 크기로 보이는 글자 */}
                  <span style={{ fontSize: `${s * 15}px`, lineHeight: 1.1 }} className="font-black">
                    Aa
                  </span>
                  <span className="text-[10px] font-bold">{t(`display.sizes.${SCALE_KEYS[i]}`)}</span>
                </button>
              );
            })}
          </div>
        </Card>
      </section>

      {/* 소리 */}
      <section>
        <TermLabel>audio --sfx</TermLabel>
        <h2 className="display mb-4 mt-1 flex items-center gap-2 text-2xl">
          {sound.on ? <Volume2 className="size-5 text-aqua" /> : <VolumeX className="size-5 text-dim" />}
          {t("sound.title")}
        </h2>
        <Card className="grid gap-5">
          <Row title={t("sound.master")} hint={t("sound.masterHint")}>
            <Switch
              on={sound.on}
              onChange={(on) => pickSound({ ...sound, on })}
              labelOn={t("sound.on")}
              labelOff={t("sound.off")}
            />
          </Row>

          <div className={cn("grid gap-2", !sound.on && "pointer-events-none opacity-40")}>
            <Row title={t("sound.volume")}>
              <span className="num text-xs text-dim">{Math.round(sound.volume * 100)}</span>
            </Row>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(sound.volume * 100)}
              disabled={!sound.on}
              aria-label={t("sound.volume")}
              onChange={(e) => pickSound({ ...sound, volume: Number(e.target.value) / 100 })}
              className="h-11 w-full accent-[var(--color-neon)]"
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => playSfx("ok")} disabled={!sound.on}>
                {t("sound.previewOk")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => playSfx("coin")} disabled={!sound.on}>
                {t("sound.previewCoin")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => playSfx("level")} disabled={!sound.on}>
                {t("sound.previewLevel")}
              </Button>
            </div>
          </div>
        </Card>
      </section>

      {/* 언어 */}
      <section>
        <TermLabel>lang --switch</TermLabel>
        <h2 className="display mb-4 mt-1 flex items-center gap-2 text-2xl">
          <Languages className="size-5 text-aqua" />
          {t("language.title")}
        </h2>
        <Card className="grid gap-2 p-3">
          {LOCALES.map((l) => {
            const on = l === locale;
            return (
              <button
                key={l}
                type="button"
                onClick={() => pickLocale(l)}
                aria-pressed={on}
                disabled={busy}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-tile border px-4 text-left transition-colors disabled:opacity-60",
                  on ? "grad-line border-transparent bg-neon/12" : "border-line bg-white/5 hover:bg-white/8",
                )}
              >
                <span className="num w-7 text-xs font-black text-dim">{l.toUpperCase()}</span>
                <span className="flex-1 font-bold">{LOCALE_LABEL[l]}</span>
                {on && <Check className="size-4 text-neon" />}
              </button>
            );
          })}
          <p className="px-1 pt-1 text-xs text-dim">{t("language.hint")}</p>
        </Card>
      </section>

      <p className="pb-2 text-center text-xs text-dim">{t("storedOnDevice")}</p>
    </div>
  );
}

function Row({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-bold">{title}</p>
        {hint && <p className="mt-0.5 text-xs text-mute">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** 켜짐/꺼짐 스위치 — 테마 스위치와 같은 언어(유리 + 그라데이션)로 그린다 */
function Switch({
  on,
  onChange,
  labelOn,
  labelOff,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  labelOn: string;
  labelOff: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      data-no-sfx
      onClick={() => onChange(!on)}
      className="inline-flex min-h-11 items-center gap-2"
    >
      <span
        className={cn(
          "relative block h-8 w-[58px] rounded-full border transition-colors",
          on ? "grad-fill border-transparent" : "border-line bg-white/8",
        )}
      >
        <span
          className={cn(
            "absolute top-1 size-6 rounded-full bg-night shadow-[0_2px_6px_rgb(0_0_0/0.4)] transition-[left] duration-300",
            on ? "left-[28px]" : "left-1",
          )}
        />
      </span>
      <span className={cn("num text-xs font-bold", on ? "text-neon-soft" : "text-dim")}>
        {on ? labelOn : labelOff}
      </span>
    </button>
  );
}
