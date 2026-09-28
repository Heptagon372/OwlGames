"use client";

// 🧩 아울리스 — 터치 패드 (모바일). 뿌요뿌요 온라인의 휴대폰 조작처럼 게임패드 모양으로 둔다:
//   왼손 = 이동 패드 (◀ ▶ 크게, 아래 줄에 ▼ 빠르게 · ⤓ 바로 떨어뜨리기)
//   오른손 = 회전 버튼 (↺ ↻ 크게, 아래 줄에 작은 HOLD)
// 세로 화면은 필드 아래 한 줄(`bar`, 가운데에 일시정지), 가로 화면은 좌우 아래 구석(`sides`).
// 좌우·아래는 누르고 있는 동안 계속 (DAS 는 엔진이 처리), 나머지는 한 번씩. 버튼 최소 44px.
// 필드 위 제스처(드래그·탭·튕기기)도 그대로 쓸 수 있다.

import { ArrowDown, ArrowDownToLine, ChevronLeft, ChevronRight, Archive, Pause, RotateCcw, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Action, Held } from "../engine/game";
import { GRAD, glassStyle } from "../theme";

type Props = {
  mode: "bar" | "sides";
  onAction: (a: Action) => void;
  onHeld: (k: keyof Held, on: boolean) => void;
  onPause: () => void;
  canPause: boolean;
};

/** 세로 화면 아래 패드 높이 (안전 영역 제외) */
export const CONTROLS_H = 136;
/** 가로 화면 좌우 패드 한 쪽 너비 */
export const CONTROLS_SIDE_W = 176;

export function Controls({ mode, onAction, onHeld, onPause, canPause }: Props) {
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

  const base = "grid place-items-center text-[#e9edfb] active:scale-95 select-none touch-none";
  const big = `${base} h-[62px] rounded-[20px]`;
  const small = `${base} h-12 rounded-full`;
  const move = glassStyle({ from: GRAD.aqua, via: GRAD.violet, to: GRAD.aqua });
  const turn = glassStyle({ from: GRAD.violet, via: GRAD.magenta, to: GRAD.violet, glow: GRAD.violet });
  const main = glassStyle({ fill: true, from: GRAD.cyan, via: GRAD.aqua, to: GRAD.violet, glow: GRAD.aqua });
  const quiet = glassStyle({ from: GRAD.violet, via: GRAD.aqua, to: GRAD.violet });

  const pad = (
    <div className="grid w-full grid-cols-2 gap-2">
      <button type="button" aria-label={t("left")} className={big} style={move} {...hold("left")}>
        <ChevronLeft className="size-9" />
      </button>
      <button type="button" aria-label={t("right")} className={big} style={move} {...hold("right")}>
        <ChevronRight className="size-9" />
      </button>
      <button type="button" aria-label={t("soft")} className={small} style={move} {...hold("soft")}>
        <ArrowDown className="size-6" />
      </button>
      <button type="button" aria-label={t("hard")} className={`${small} text-[#060913]`} style={main} {...tap("hard")}>
        <ArrowDownToLine className="size-6" />
      </button>
    </div>
  );
  const buttons = (
    <div className="grid w-full grid-cols-2 gap-2">
      <button type="button" aria-label={t("rotL")} className={`${big} rounded-full`} style={turn} {...tap("rotL")}>
        <RotateCcw className="size-8" />
      </button>
      <button type="button" aria-label={t("rotR")} className={`${big} rounded-full`} style={turn} {...tap("rotR")}>
        <RotateCw className="size-8" />
      </button>
      <button
        type="button"
        aria-label={t("hold")}
        className={`${small} col-span-2 gap-1.5 text-xs font-bold text-[#c4b5fd]`}
        style={quiet}
        {...tap("hold")}
      >
        <span className="flex items-center gap-1.5">
          <Archive className="size-4" />
          {t("hold")}
        </span>
      </button>
    </div>
  );
  const pauseBtn = (
    <button
      type="button"
      aria-label={t("pause")}
      disabled={!canPause}
      onClick={onPause}
      className="grid size-11 shrink-0 place-items-center rounded-full text-[#e9edfb] active:scale-95 disabled:opacity-35"
      style={quiet}
    >
      <Pause className="size-5" />
    </button>
  );

  if (mode === "sides") {
    return (
      <>
        <div className="absolute bottom-0 left-0 z-10 p-2 pb-[max(8px,env(safe-area-inset-bottom))]" style={{ width: CONTROLS_SIDE_W }}>
          {pad}
        </div>
        <div className="absolute bottom-0 right-0 z-10 p-2 pb-[max(8px,env(safe-area-inset-bottom))]" style={{ width: CONTROLS_SIDE_W }}>
          {buttons}
        </div>
        <div className="absolute right-2 top-2 z-10">{pauseBtn}</div>
      </>
    );
  }
  return (
    <div
      data-owlis-pad
      className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-2 px-2.5 pt-2 pb-[max(8px,env(safe-area-inset-bottom))]"
      style={{ minHeight: CONTROLS_H }}
    >
      <div className="min-w-0 max-w-[210px] flex-1">{pad}</div>
      <div className="flex flex-none justify-center">{pauseBtn}</div>
      <div className="min-w-0 max-w-[210px] flex-1">{buttons}</div>
    </div>
  );
}
