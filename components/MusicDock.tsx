"use client";

import { useEffect, useRef, useState } from "react";
import { Music2, Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { getSoundPrefs, playMusic, setSoundPrefs } from "@/lib/sound";

/** 플랫폼 배경음악 (사용자 제공 — public/assets/CREDITS.md). 게임 화면(GameShell)에 들어가면 끈다 */
export const LOBBY_BGM = "/assets/bgm/neon-city-loop.mp3";

/** 음소거 직전 배경음악 음량 — 다시 켤 때 돌려놓는다 (기기에만) */
const LAST_KEY = "owl-music-last";

function readLast(): number {
  try {
    const v = Number(localStorage.getItem(LAST_KEY));
    return v > 0 && v <= 1 ? v : 0.5;
  } catch {
    return 0.5;
  }
}

function writeLast(v: number): void {
  try {
    localStorage.setItem(LAST_KEY, String(v));
  } catch {
    // 무시
  }
}

/**
 * 오른쪽 아래에 떠 있는 배경음악 조절기. 스피커 = 바로 끄기/켜기, 음표 = 음량 슬라이더 열기.
 * 값은 설정 화면의 "배경음악"과 같은 prefs 를 쓴다 (lib/sound.ts).
 */
export function MusicDock() {
  const t = useTranslations("music");
  const [level, setLevel] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const p = getSoundPrefs();
    setLevel(p.on ? p.music : 0);
    // 브라우저는 첫 입력 전 재생을 막는다 — playMusic 이 기억해 뒀다가 첫 탭에 튼다
    playMusic(LOBBY_BGM);
  }, []);

  // 바깥을 누르면 슬라이더를 닫는다
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  const apply = (v: number) => {
    const p = getSoundPrefs();
    const music = Math.min(1, Math.max(0, v));
    // 소리 전체가 꺼져 있는데 올리면 소리를 켠다 (효과음 음량은 그대로)
    setSoundPrefs({ ...p, on: music > 0 ? true : p.on, music });
    if (music > 0) writeLast(music);
    setLevel(music);
  };

  const muted = level <= 0;

  return (
    <div
      ref={box}
      className="fixed right-3 z-40 flex flex-col items-end gap-2"
      style={{ bottom: "calc(68px + env(safe-area-inset-bottom))" }}
    >
      {open && (
        <div className="glass grad-line flex items-center gap-3 rounded-full px-4 py-2.5 shadow-[0_8px_30px_rgb(0_0_0/0.4)]">
          <Music2 className="size-4 shrink-0 text-neon-soft" />
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(level * 100)}
            onChange={(e) => apply(Number(e.target.value) / 100)}
            aria-label={t("volume")}
            className="h-11 w-36 accent-[var(--color-neon)]"
          />
          <span className="num w-9 text-right text-xs text-mute">{Math.round(level * 100)}</span>
        </div>
      )}
      <div className="glass grad-line flex items-center rounded-full p-1 shadow-[0_8px_30px_rgb(0_0_0/0.4)]">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={t("volume")}
          aria-expanded={open}
          className={cn(
            "grid size-11 place-items-center rounded-full transition-colors hover:bg-white/10",
            open && "bg-white/10",
          )}
        >
          <Music2 className={cn("size-5", muted ? "text-dim" : "text-neon-soft")} />
        </button>
        <button
          type="button"
          onClick={() => apply(muted ? readLast() : 0)}
          aria-label={muted ? t("unmute") : t("mute")}
          aria-pressed={muted}
          className="grid size-11 place-items-center rounded-full transition-colors hover:bg-white/10"
        >
          {muted ? <VolumeX className="size-5 text-dim" /> : <Volume2 className="size-5 text-aqua" />}
        </button>
      </div>
    </div>
  );
}
