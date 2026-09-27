"use client";

// 🧩 아울리스 — 터치 버튼 (모바일). 제스처(필드 위 드래그·탭·튕기기)와 같이 쓴다.
// 좌우·아래는 누르고 있는 동안 계속 (DAS 는 엔진이 처리), 나머지는 한 번씩.
// 버튼 최소 44px (§ 모바일 우선).

import { ArrowDown, ArrowDownToLine, ChevronLeft, ChevronRight, Archive, RotateCcw, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Action, Held } from "../engine/game";
import { GRAD, glassStyle } from "../theme";

type Props = {
  onAction: (a: Action) => void;
  onHeld: (k: keyof Held, on: boolean) => void;
};

export const CONTROLS_H = 64;

export function Controls({ onAction, onHeld }: Props) {
  const t = useTranslations("hud.owlis.controls");

  const hold = (k: keyof Held) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      // 첫 칸은 바로 (누르고 있으면 엔진이 반복한다)
      if (k === "left" || k === "right") onAction(k);
      onHeld(k, true);
    },
    onPointerUp: () => onHeld(k, false),
    onPointerCancel: () => onHeld(k, false),
    onLostPointerCapture: () => onHeld(k, false),
  });
  const tap = (a: Action) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      onAction(a);
    },
  });

  // 유리 알약 버튼 (그라데이션 헤어라인) — 바로 떨어뜨리기만 시안 그라데이션 채움 (레퍼런스의 주 버튼)
  const btn = "grid min-h-11 min-w-11 flex-1 place-items-center rounded-full text-[#e9edfb] active:scale-95 select-none touch-none";
  const glass = glassStyle({ from: GRAD.aqua, via: GRAD.violet, to: GRAD.magenta });
  const turn = glassStyle({ from: GRAD.violet, via: GRAD.magenta, to: GRAD.violet });
  const main = glassStyle({ fill: true, from: GRAD.cyan, via: GRAD.aqua, to: GRAD.violet, glow: GRAD.aqua });

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-1.5 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5"
      style={{ height: CONTROLS_H }}
    >
      <button type="button" aria-label={t("hold")} className={btn} style={turn} {...tap("hold")}>
        <Archive className="size-5 text-[#c4b5fd]" />
      </button>
      <button type="button" aria-label={t("rotL")} className={btn} style={turn} {...tap("rotL")}>
        <RotateCcw className="size-5" />
      </button>
      <button type="button" aria-label={t("left")} className={btn} style={glass} {...hold("left")}>
        <ChevronLeft className="size-6" />
      </button>
      <button type="button" aria-label={t("soft")} className={btn} style={glass} {...hold("soft")}>
        <ArrowDown className="size-5" />
      </button>
      <button type="button" aria-label={t("right")} className={btn} style={glass} {...hold("right")}>
        <ChevronRight className="size-6" />
      </button>
      <button type="button" aria-label={t("rotR")} className={btn} style={turn} {...tap("rotR")}>
        <RotateCw className="size-5" />
      </button>
      <button type="button" aria-label={t("hard")} className={`${btn} text-[#060913]`} style={main} {...tap("hard")}>
        <ArrowDownToLine className="size-5" />
      </button>
    </div>
  );
}
