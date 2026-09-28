"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronsDown } from "lucide-react";
import { PrizeArt } from "@/components/PrizeArt";
import { cn } from "@/lib/cn";
import { playSfx } from "@/lib/sound";

/**
 * 부스 키오스크 뽑기 — 레버식 슬롯머신 (DECISIONS §5-46).
 *
 * **연출만 담당한다.** 어떤 상품이 나올지는 서버 `booth_draw` 가 정하고(확률은 시스템 확률표 그대로),
 * 키오스크가 그 결과를 `stopAt` 으로 넘기면 릴이 감속해 정확히 그 칸에 멈춘다.
 *
 *   레버 내리기(드래그·탭·키보드, 또는 키오스크 버튼) → onPull
 *   spinning = true   릴이 빠르게 돈다 — 칸이 지날 때마다 "띠리" (서버 응답을 기다리는 동안 계속)
 *   stopAt = {place}  감속 → 그 칸에서 "덜컥" 멈춤 → onLanded
 */

/** 릴 한 바퀴의 칸 순서 — 0 = 꽝, n = n등. 등수마다 최소 한 칸 (없는 등수엔 멈출 수 없다) */
const STRIP = [1, 6, 0, 4, 2, 5, 0, 3, 6, 0, 5, 4] as const;
const N = STRIP.length;

/** 칸 높이·창 높이(px) — 창은 칸 두 개 높이라 가운데 한 칸 + 위아래 반 칸이 보인다 */
const CELL = 120;
const WINDOW = CELL * 2;
/** 최고 속도(칸/초) · 가속 시간 · 감속 중 최소 이동 칸 수 */
const SPEED = 18;
const RAMP_S = 0.4;
const MIN_TRAVEL = 12;

/** 레버: 기둥 높이 · 손잡이 지름 · 내려가는 거리(px) · 이만큼 끌어내리면 당긴 걸로 친다 */
const LEVER_H = WINDOW + 36;
const KNOB = 46;
const TRAVEL = 112;
const PULL_AT = 0.55;

type Mode = "idle" | "spin" | "decel";

const mod = (a: number, n: number) => ((a % n) + n) % n;
const labelOf = (s: number) => (s === 0 ? "꽝" : `${s}등`);

export function SlotMachine({
  spinning,
  stopAt,
  canPull,
  onPull,
  onLanded,
  className,
}: {
  /** 레버를 내린 뒤 결과가 나올 때까지 true */
  spinning: boolean;
  /** 서버 추첨 결과 — 들어오면 감속해 이 칸에 멈춘다 (place null = 꽝) */
  stopAt: { place: number | null } | null;
  /** 레버를 내릴 수 있는지 (남은 뽑기·차단 사유는 키오스크가 판단) */
  canPull: boolean;
  onPull: () => void;
  onLanded: () => void;
  className?: string;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const reelRef = useRef<HTMLDivElement>(null);
  const pos = useRef(0); // 가운데 칸 번호 (소수 — 칸 사이)
  const vel = useRef(0);
  const mode = useRef<Mode>("idle");
  const spinStart = useRef(0);
  const lastT = useRef(0);
  const decel = useRef({ t0: 0, p0: 0, len: 0, dur: 1 });
  const lastCell = useRef(0);
  const raf = useRef(0);
  const onLandedRef = useRef(onLanded);
  onLandedRef.current = onLanded;

  const [landed, setLanded] = useState<number | null>(null); // 멈춘 칸의 기호 (0 = 꽝)

  /** 현재 pos 를 화면에 — React 렌더 없이 transform 만 바꾼다 */
  const paint = () => {
    const el = stripRef.current;
    if (!el) return;
    const m = mod(pos.current, N);
    el.style.transform = `translate3d(0, ${WINDOW / 2 - CELL / 2 - m * CELL}px, 0)`;
    const v = vel.current;
    el.style.filter = v > 7 ? `blur(${Math.min(2.5, (v - 7) / 4).toFixed(2)}px)` : "";
  };

  const tickIfCrossed = () => {
    const cell = Math.round(pos.current);
    if (cell !== lastCell.current) {
      lastCell.current = cell;
      // 번갈아 음높이를 바꿔 "띠리띠리"
      playSfx("reel", cell % 2 ? 1 : 0.8);
    }
  };

  const loop = (now: number) => {
    const s = now / 1000;
    if (mode.current === "spin") {
      const dt = Math.min(0.05, s - lastT.current);
      lastT.current = s;
      vel.current = SPEED * Math.min(1, (s - spinStart.current) / RAMP_S);
      pos.current += vel.current * dt;
    } else if (mode.current === "decel") {
      const d = decel.current;
      const u = Math.min(1, (s - d.t0) / d.dur);
      const k = 1 - (1 - u) ** 3; // easeOutCubic — 시작 속도 = 3·len/dur = 돌던 속도
      pos.current = d.p0 + d.len * k;
      vel.current = ((3 * d.len) / d.dur) * (1 - u) ** 2;
      if (u >= 1) {
        pos.current = mod(Math.round(pos.current), N);
        vel.current = 0;
        mode.current = "idle";
        lastCell.current = Math.round(pos.current);
        paint();
        playSfx("lock");
        setLanded(STRIP[pos.current]);
        // 멈추는 순간 살짝 지나쳤다가 제자리로 "덜컥"
        reelRef.current?.animate(
          [{ transform: "translateY(0)" }, { transform: "translateY(7px)", offset: 0.35 }, { transform: "translateY(0)" }],
          { duration: 320, easing: "cubic-bezier(0.3, 1.6, 0.5, 1)" },
        );
        window.setTimeout(() => onLandedRef.current(), 260);
        return;
      }
    }
    tickIfCrossed();
    paint();
    raf.current = requestAnimationFrame(loop);
  };

  // 레버 → 돌기 시작 / (오류로) 결과 없이 끝나면 가까운 칸에 세운다
  useEffect(() => {
    if (spinning && mode.current === "idle") {
      setLanded(null);
      mode.current = "spin";
      spinStart.current = lastT.current = performance.now() / 1000;
      lastCell.current = Math.round(pos.current);
      playSfx("lever");
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(loop);
    } else if (!spinning && mode.current === "spin") {
      cancelAnimationFrame(raf.current);
      mode.current = "idle";
      vel.current = 0;
      pos.current = mod(Math.round(pos.current), N);
      paint();
    }
    // loop·paint 는 ref 만 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning]);

  // 결과 도착 → 목표 칸을 정하고 감속
  useEffect(() => {
    if (!stopAt || mode.current !== "spin") return;
    const want = stopAt.place ?? 0;
    const p0 = pos.current;
    let target = Math.ceil(p0) + MIN_TRAVEL;
    // 릴에 없는 등수(7등 이상 — 지금은 없다)면 찾지 않고 최소 이동 칸에 세운다. 결과 문구는 키오스크가 서버 값으로 띄운다
    if (STRIP.includes(want as (typeof STRIP)[number])) {
      while (STRIP[mod(target, N)] !== want) target++;
    }
    const len = target - p0;
    const v = Math.max(4, vel.current);
    decel.current = { t0: performance.now() / 1000, p0, len, dur: (3 * len) / v };
    mode.current = "decel";
  }, [stopAt]);

  useEffect(() => {
    paint();
    // 릴에 쓰는 상품 그림을 미리 받아 둔다 (돌 때 빈칸이 안 보이게)
    for (let p = 1; p <= 6; p++) {
      const img = new Image();
      img.src = `/assets/prizes/prize-${p}.webp`;
    }
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const win = landed != null && landed > 0;
  const jackpot = landed != null && landed > 0 && landed <= 2;

  return (
    <div className={cn("flex select-none items-end gap-2", className)}>
      {/* ── 본체 ─────────────────────────────────────────── */}
      <div className="grad-line glow-iris min-w-0 flex-1 rounded-card bg-panel/80 p-3">
        {/* 간판 */}
        <div className="mb-2 rounded-tile border border-line bg-night/70 px-3 py-2 text-center">
          <p className="display grad-text font-mono text-xl font-black tracking-[0.25em]">OWL JACKPOT</p>
        </div>
        <Bulbs spinning={spinning} jackpot={jackpot} win={win} />

        {/* 릴 창 */}
        <div
          className="relative my-2 overflow-hidden rounded-tile border border-line-strong bg-night"
          style={{ height: WINDOW }}
        >
          <div ref={reelRef} className="absolute inset-0">
            <div ref={stripRef} className="absolute inset-x-0 top-0 will-change-transform">
              {Array.from({ length: N + 4 }, (_, i) => {
                const k = i - 2;
                const s = STRIP[mod(k, N)];
                return (
                  <div
                    key={k}
                    className="absolute inset-x-0 flex flex-col items-center justify-center gap-1"
                    style={{ top: k * CELL, height: CELL }}
                  >
                    <PrizeArt place={s || null} className="size-[84px] text-6xl" />
                    <span className={cn("num text-sm font-bold", s === 0 ? "text-dim" : "text-neon-soft")}>
                      {labelOf(s)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 원통처럼 위아래를 어둡게 */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, var(--color-night) 0%, transparent 30%, transparent 70%, var(--color-night) 100%)",
            }}
            aria-hidden
          />
          {/* 당첨선 */}
          <div
            className={cn(
              "pointer-events-none absolute inset-x-2 top-1/2 -translate-y-1/2 rounded-tile border-2 transition-colors",
              jackpot ? "border-amber" : win ? "border-neon" : "border-neon/30",
              win && "glow-iris",
            )}
            style={{ height: CELL - 8 }}
            aria-hidden
          />
          <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 border-y-8 border-l-[10px] border-y-transparent border-l-magenta" aria-hidden />
          <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 border-y-8 border-r-[10px] border-y-transparent border-r-magenta" aria-hidden />

          {/* 1·2등 섬광 */}
          {jackpot && (
            <>
              <span
                className="pointer-events-none absolute left-1/2 top-1/2 size-40 -translate-x-1/2 -translate-y-1/2 animate-flash rounded-full bg-amber/70 blur-xl"
                aria-hidden
              />
              <span
                className="pointer-events-none absolute left-1/2 top-1/2 size-32 -translate-x-1/2 -translate-y-1/2 animate-pulse-glow rounded-full border-2 border-amber/60"
                aria-hidden
              />
            </>
          )}
        </div>

        <Bulbs spinning={spinning} jackpot={jackpot} win={win} offset />
        <p className="mt-2 h-5 text-center font-mono text-sm tracking-[0.3em] text-aqua" aria-live="polite">
          {spinning ? "SPINNING..." : landed == null ? (canPull ? "PULL THE LEVER" : "") : jackpot ? "JACKPOT!" : ""}
        </p>
      </div>

      <Lever spinning={spinning} canPull={canPull} onPull={onPull} />
    </div>
  );
}

/** 창 위아래 전구 줄 — 돌 때 번갈아 깜빡이고, 당첨이면 한꺼번에 빛난다 */
function Bulbs({ spinning, win, jackpot, offset }: { spinning: boolean; win: boolean; jackpot: boolean; offset?: boolean }) {
  const colors = ["bg-aqua", "bg-neon", "bg-magenta"];
  return (
    <div className="flex justify-between px-1" aria-hidden>
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className={cn(
            "size-2.5 rounded-full",
            jackpot ? "bg-amber" : colors[(i + (offset ? 1 : 0)) % 3],
            spinning ? "animate-bulb" : win ? "animate-pulse-glow" : "opacity-40",
          )}
          style={spinning ? { animationDelay: `${((i + (offset ? 1 : 0)) % 2) * 0.12}s` } : undefined}
        />
      ))}
    </div>
  );
}

/**
 * 레버 — 손잡이를 끌어내리거나(드래그) 탭·Enter·Space 로 당긴다.
 * 키오스크 버튼으로 시작해도(`spinning` 이 켜지면) 스스로 한 번 내려갔다 올라온다.
 */
function Lever({ spinning, canPull, onPull }: { spinning: boolean; canPull: boolean; onPull: () => void }) {
  const [off, setOff] = useState(0);
  const [ease, setEase] = useState("none");
  const drag = useRef<{ id: number; y0: number; moved: number } | null>(null);
  const pulled = useRef(false); // 이번 판은 레버로 시작했다 (자동으로 한 번 더 내리지 않게)
  const timer = useRef(0);

  const snap = (to: number, ms: number, curve = "cubic-bezier(0.3, 0, 0.2, 1)") => {
    setEase(`transform ${ms}ms ${curve}`);
    setOff(to);
  };
  /** 끝까지 내렸다가 → 튕기듯 올라온다 */
  const cycle = (then?: () => void) => {
    snap(TRAVEL, 130);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      then?.();
      snap(0, 520, "cubic-bezier(0.3, 1.6, 0.5, 1)");
    }, 150);
  };

  const pull = () => {
    if (!canPull || spinning) return;
    pulled.current = true;
    cycle(onPull);
  };

  useEffect(() => {
    if (spinning && !pulled.current) cycle();
    if (!spinning) pulled.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const enabled = canPull && !spinning;
  const style = { transform: `translateY(${off}px)`, transition: ease };

  return (
    <button
      type="button"
      aria-label="레버 내리기"
      disabled={!enabled}
      className={cn(
        "relative w-14 shrink-0 touch-none outline-none",
        enabled ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed",
      )}
      style={{ height: LEVER_H }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pull();
        }
      }}
      onPointerDown={(e) => {
        if (!enabled) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { id: e.pointerId, y0: e.clientY, moved: 0 };
        setEase("none");
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        const dy = e.clientY - d.y0;
        d.moved = Math.max(d.moved, Math.abs(dy));
        setOff(Math.max(0, Math.min(TRAVEL, dy)));
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        drag.current = null;
        const dy = Math.max(0, Math.min(TRAVEL, e.clientY - d.y0));
        // 탭(거의 안 움직임) 또는 충분히 끌어내림 → 당김 / 아니면 제자리로
        if (d.moved < 6 || dy >= TRAVEL * PULL_AT) pull();
        else snap(0, 300);
      }}
      onPointerCancel={() => {
        drag.current = null;
        snap(0, 300);
      }}
    >
      {/* 홈 */}
      <span className="absolute bottom-10 left-1/2 top-5 w-3 -translate-x-1/2 rounded-full border border-line bg-night/80" aria-hidden />
      {/* 막대 — 받침 안으로 미끄러져 들어간다 */}
      <span className="absolute inset-x-0 top-0 overflow-hidden" style={{ height: LEVER_H - 30 }} aria-hidden>
        <span
          className="absolute left-1/2 w-2 -translate-x-1/2 rounded-full bg-gradient-to-b from-neon-soft to-neon-deep"
          style={{ ...style, top: KNOB / 2, height: LEVER_H }}
        />
      </span>
      {/* 받침 */}
      <span className="grad-line absolute inset-x-0.5 bottom-0 h-10 rounded-xl bg-panel" aria-hidden />
      {/* 손잡이 */}
      <span
        className={cn("absolute left-1/2 top-0 rounded-full glow-iris", !enabled && "opacity-50 saturate-50")}
        style={{
          ...style,
          width: KNOB,
          height: KNOB,
          marginLeft: -KNOB / 2,
          background:
            "radial-gradient(circle at 35% 30%, #fff 0%, var(--color-magenta) 32%, var(--color-neon) 70%, var(--color-neon-deep) 100%)",
        }}
        aria-hidden
      />
      {/* 당겨 달라는 화살표 */}
      {enabled && off === 0 && (
        <ChevronsDown
          className="pointer-events-none absolute left-1/2 top-[58px] size-5 -translate-x-1/2 animate-bounce text-aqua"
          aria-hidden
        />
      )}
    </button>
  );
}
