"use client";

// 게임 4종 공통 일시정지 (DECISIONS §5-40)
// - 한 판에 PAUSE_TOTAL_SEC(60초)까지 멈출 수 있다. 다 쓰면 저절로 이어서 한다.
// - 메뉴에는 [계속하기] [전체화면] [로비로] — 플레이 중에는 상단 바가 없으므로 나가는 길은 여기다.
// - 시간을 다 쓴 뒤에 누르면 메뉴는 열리지만 게임은 멈추지 않는다(나가기만 가능).
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Maximize, Minimize, Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { enterFullscreen, exitFullscreen, useFullscreen } from "@/lib/fullscreen";
import { cn } from "@/lib/cn";

export const PAUSE_TOTAL_SEC = 60;
const TICK_SEC = 0.25;

export type PauseCtl = {
  /** 메뉴가 열려 있다 */
  open: boolean;
  /** 게임이 실제로 멈춰 있다 (시간이 남아 있을 때만) */
  frozen: boolean;
  /** 남은 일시정지 시간(초) */
  left: number;
  openRef: React.RefObject<boolean>;
  frozenRef: React.RefObject<boolean>;
  toggle: () => void;
  resume: () => void;
  /** 탭이 가려질 때 등 — 시간이 남아 있을 때만 멈춘다 */
  autoPause: () => void;
};

/**
 * @param apply 게임 루프를 멈추거나 푸는 함수 (루프는 effect 안에서 만들어지므로 ref 로 부른다)
 * @param held  true 인 동안은 시간을 깎지 않는다 (예: 세로 화면 안내가 게임을 따로 멈춘 동안)
 */
export function usePause(apply: (frozen: boolean) => void, held?: () => boolean): PauseCtl {
  const applyRef = useRef(apply);
  const heldRef = useRef(held);
  useEffect(() => {
    applyRef.current = apply;
    heldRef.current = held;
  });

  const [open, setOpen] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [left, setLeft] = useState(PAUSE_TOTAL_SEC);
  const openRef = useRef(false);
  const frozenRef = useRef(false);
  const leftRef = useRef<number>(PAUSE_TOTAL_SEC);

  const set = useCallback((o: boolean, f: boolean) => {
    openRef.current = o;
    frozenRef.current = f;
    setOpen(o);
    setFrozen(f);
    applyRef.current(f);
  }, []);

  const resume = useCallback(() => set(false, false), [set]);
  const toggle = useCallback(() => {
    if (openRef.current) set(false, false);
    else set(true, leftRef.current > 0);
  }, [set]);
  const autoPause = useCallback(() => {
    if (!openRef.current && leftRef.current > 0) set(true, true);
  }, [set]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!frozenRef.current || document.hidden || heldRef.current?.()) return;
      leftRef.current = Math.max(0, leftRef.current - TICK_SEC);
      setLeft(leftRef.current);
      if (leftRef.current <= 0) set(false, false);
    }, TICK_SEC * 1000);
    return () => clearInterval(id);
  }, [set]);

  return { open, frozen, left, openRef, frozenRef, toggle, resume, autoPause };
}

/** 화면 구석의 ⏸ 버튼 — 게임 입력(탭·드래그)으로 새지 않게 막는다 */
export function PauseButton({ ctl, className }: { ctl: PauseCtl; className?: string }) {
  const t = useTranslations("hud.common");
  return (
    <button
      type="button"
      aria-label={t("pause")}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        ctl.toggle();
      }}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "pointer-events-auto grid size-11 place-items-center rounded-xl border border-white/15 bg-night/60 text-ink/85 backdrop-blur-sm active:scale-95",
        className,
      )}
    >
      <Pause className="size-5" />
    </button>
  );
}

/** 일시정지 메뉴 — 게임 화면 위를 덮는다. backdrop 을 주면 그 색으로 화면을 완전히 가린다(퍼즐 — 생각할 시간 금지) */
export function PauseMenu({ ctl, backdrop }: { ctl: PauseCtl; backdrop?: string }) {
  const t = useTranslations("hud.common");
  const fs = useFullscreen();
  if (!ctl.open) return null;
  const ratio = ctl.left / PAUSE_TOTAL_SEC;

  return (
    <div
      className={cn("fixed inset-0 z-40 grid place-items-center overflow-y-auto p-4", !backdrop && "bg-night/80 backdrop-blur-sm")}
      style={backdrop ? { background: backdrop } : undefined}
      onPointerDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label={t("pause")}
    >
      <div className="card-solid w-full max-w-xs rounded-card p-5 text-center">
        <p className="text-2xl font-black text-ink">{t("pause")}</p>
        {ctl.frozen ? (
          <>
            <p className="num mt-1 text-sm text-mute">{t("pauseNote", { sec: Math.ceil(ctl.left) })}</p>
            <div className="mx-auto mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
              <div className="grad-fill h-full rounded-full transition-[width] duration-200" style={{ width: `${ratio * 100}%` }} />
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-alert">{t("pauseOut")}</p>
        )}

        <div className="mt-5 grid gap-2">
          <button
            type="button"
            onClick={ctl.resume}
            className="grad-fill glow-iris inline-flex min-h-12 items-center justify-center gap-2 rounded-tile px-5 font-bold text-white active:scale-[0.98]"
          >
            <Play className="size-5" />
            {t("resume")}
          </button>
          {fs.supported && (
            <button
              type="button"
              onClick={() => void (fs.active ? exitFullscreen() : enterFullscreen())}
              className="glass grad-line inline-flex min-h-11 items-center justify-center gap-2 rounded-tile px-5 text-sm font-bold text-ink active:scale-[0.98]"
            >
              {fs.active ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
              {fs.active ? t("fullscreenOff") : t("fullscreenOn")}
            </button>
          )}
          <Link
            href="/lobby"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-tile px-5 text-sm font-bold text-mute hover:text-ink"
          >
            <ArrowLeft className="size-4" />
            {t("toLobby")}
          </Link>
          <p className="text-[11px] text-dim">{t("toLobbyNote")}</p>
        </div>
      </div>
    </div>
  );
}
