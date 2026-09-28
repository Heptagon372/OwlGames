"use client";

// PC 키 설정 — 게임마다 동작 → 키 두 개까지 (lib/keybinds.ts). 폰에서는 섹션째 숨긴다(`pc:` 변형).
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Keyboard, RotateCcw, X } from "lucide-react";
import { Card, TermLabel } from "./ui/Card";
import { Button } from "./ui/Button";
import { cn } from "@/lib/cn";
import {
  actionsOf,
  bindKey,
  defaultKeymap,
  isBindable,
  keyLabel,
  KEY_GAMES,
  KEYS_PER_ACTION,
  readKeymap,
  unbindKey,
  writeKeymap,
  type KeyAction,
  type KeyGame,
  type Keymap,
} from "@/lib/keybinds";
import { playSfx } from "@/lib/sound";

type Listening = { action: string; slot: number } | null;

export function KeybindSettings() {
  const t = useTranslations("settings.keys");
  const tg = useTranslations("games");
  const [game, setGame] = useState<KeyGame>("flight");

  return (
    <section className="hidden pc:block">
      <TermLabel>input --keys</TermLabel>
      <h2 className="display mb-4 mt-1 flex items-center gap-2 text-2xl">
        <Keyboard className="size-5 text-aqua" />
        {t("title")}
      </h2>
      <Card className="grid gap-4">
        <p className="text-xs text-mute">{t("hint")}</p>
        <div className="grid grid-cols-4 gap-2" role="tablist">
          {KEY_GAMES.map((g) => (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={g === game}
              onClick={() => setGame(g)}
              className={cn(
                "min-h-11 rounded-tile border px-2 text-sm font-bold transition-colors",
                g === game ? "grad-line border-transparent bg-neon/12 text-ink" : "border-line bg-white/5 text-mute hover:text-ink",
              )}
            >
              {tg(`${g}.title`)}
            </button>
          ))}
        </div>
        <GameKeys key={game} game={game} />
      </Card>
    </section>
  );
}

function GameKeys<G extends KeyGame>({ game }: { game: G }) {
  const t = useTranslations("settings.keys");
  const [map, setMap] = useState<Keymap<G>>(() => defaultKeymap(game));
  const [listening, setListening] = useState<Listening>(null);
  // 동작 이름 — 게임별 키가 제네릭이라 next-intl 의 키 타입 추론을 거치지 않는다
  const label = (action: string) => (t as unknown as (key: string) => string)(`actions.${game}.${action}`);

  useEffect(() => setMap(readKeymap(game)), [game]);

  // 키 입력 대기 — 캡처 단계에서 먼저 받아서 다른 단축키로 새지 않게. Esc 는 취소
  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") return setListening(null);
      if (!isBindable(e.code)) return;
      const next = bindKey(map, listening.action as KeyAction<G>, listening.slot, e.code);
      setMap(next);
      writeKeymap(game, next);
      setListening(null);
      playSfx("tap");
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [listening, map, game]);

  const remove = (action: KeyAction<G>, slot: number) => {
    const next = unbindKey(map, action, slot);
    setMap(next);
    writeKeymap(game, next);
  };

  const reset = () => {
    setListening(null);
    setMap(defaultKeymap(game));
    writeKeymap(game, null);
    playSfx("ok");
  };

  return (
    <div className="grid gap-1.5">
      {actionsOf(game).map((action) => {
        const keys = map[action];
        const slots = Math.min(KEYS_PER_ACTION, keys.length + 1);
        return (
          <div key={action} className="flex items-center gap-3 rounded-tile border border-line bg-white/4 px-3 py-1.5">
            <span className="min-w-0 flex-1 text-sm font-bold">{label(action)}</span>
            {!keys.length && <span className="text-xs text-alert">{t("unbound")}</span>}
            {Array.from({ length: slots }, (_, slot) => {
              const code = keys[slot];
              const on = listening?.action === action && listening.slot === slot;
              return (
                <span key={slot} className="flex items-center">
                  <button
                    type="button"
                    data-no-sfx
                    onClick={() => setListening(on ? null : { action, slot })}
                    aria-label={t("bindAria", { action: label(action), n: slot + 1 })}
                    className={cn(
                      "num min-h-10 min-w-[84px] rounded-lg border px-2 text-sm font-black transition-colors",
                      on
                        ? "animate-pulse border-neon bg-neon/20 text-neon"
                        : code
                          ? "border-line bg-night text-ink hover:border-neon"
                          : "border-dashed border-line text-dim hover:text-ink",
                    )}
                  >
                    {on ? t("press") : code ? keyLabel(code) : "+"}
                  </button>
                  {code && !on && (
                    <button
                      type="button"
                      onClick={() => remove(action, slot)}
                      aria-label={t("removeAria", { key: keyLabel(code) })}
                      className="grid size-8 place-items-center text-dim hover:text-alert"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        );
      })}
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs text-dim">{listening ? t("pressHint") : t("conflictHint")}</p>
        <Button size="sm" variant="outline" onClick={reset}>
          <RotateCcw className="size-4" />
          {t("reset")}
        </Button>
      </div>
    </div>
  );
}
