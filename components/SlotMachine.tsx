"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronsDown } from "lucide-react";
import { PrizeArt } from "@/components/PrizeArt";
import { cn } from "@/lib/cn";
import { playSfx } from "@/lib/sound";

/**
 * 부스 키오스크 뽑기 — 레버식 3릴 슬롯머신 (DECISIONS §5-46).
 *
 * **연출만 담당한다.** 어떤 상품이 나올지는 서버 `booth_draw` 가 정하고(확률은 시스템 확률표 그대로),
 * 키오스크가 그 결과를 `stopAt` 으로 넘기면 릴 세 개가 왼쪽부터 차례로 멈춘다.
 *   당첨 n등 → 세 릴 모두 n등 그림 (가로 한 줄 일치)
 *   꽝       → 세 칸이 모두 같지는 않은 조합 (앞 두 칸이 같은 "아깝다" 조합이 자주 나온다)
 * 릴 모양·칸 수는 겉모양뿐 — 확률에 영향을 주지 않는다.
 */

/** 릴마다 칸 순서가 다르다 — 0 = 꽝, n = n등. 등수마다 최소 한 칸 */
const STRIPS = [
  [1, 6, 0, 4, 2, 5, 0, 3, 6, 0, 5, 4],
  [5, 0, 3, 6, 1, 4, 0, 6, 2, 5, 0, 3],
  [0, 4, 6, 2, 0, 5, 3, 1, 6, 0, 4, 5],
] as const;
const N = 12;
const REELS = 3;
const SYMBOLS = [0, 1, 2, 3, 4, 5, 6];

/** 칸 높이·창 높이(px) — 창은 칸 두 개 높이라 가운데 한 칸 + 위아래 반 칸이 보인다 */
const CELL = 150;
const WINDOW = CELL * 2;
/** 최고 속도(칸/초) · 가속 시간 · 첫 릴 최소 이동 칸 · 릴마다 더 도는 칸 · 릴 사이 멈춤 간격(초) */
const SPEED = 18;
const RAMP_S = 0.4;
const MIN_TRAVEL = 10;
const EXTRA_TRAVEL = 7;
const STAGGER_S = 0.45;

/** 레버: 기둥 높이 · 손잡이 지름 · 내려가는 거리(px) · 이만큼 끌어내리면 당긴 걸로 친다 */
const LEVER_H = WINDOW + 60;
const KNOB = 56;
const TRAVEL = 150;
const PULL_AT = 0.55;

type Mode = "idle" | "spin" | "wait" | "decel";
type Reel = { pos: number; vel: number; mode: Mode; t0: number; p0: number; len: number; dur: number };

const mod = (a: number, n: number) => ((a % n) + n) % n;
const labelOf = (s: number) => (s === 0 ? "꽝" : `${s}등`);
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

/** 멈출 기호 세 개 — 당첨이면 모두 같게, 꽝이면 셋이 모두 같지는 않게 */
function targetsFor(place: number | null): number[] {
  if (place && SYMBOLS.includes(place)) return [place, place, place];
  const a = pick(SYMBOLS);
  const b = Math.random() < 0.5 ? a : pick(SYMBOLS); // 절반은 앞 두 칸이 같은 "아깝다"
  const c = a === b ? pick(SYMBOLS.filter((s) => s !== a)) : pick(SYMBOLS);
  return [a, b, c];
}

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
  /** 서버 추첨 결과 — 들어오면 감속해 멈춘다 (place null = 꽝) */
  stopAt: { place: number | null } | null;
  /** 레버를 내릴 수 있는지 (남은 뽑기·차단 사유는 키오스크가 판단) */
  canPull: boolean;
  onPull: () => void;
  onLanded: () => void;
  className?: string;
}) {
  const stripRefs = useRef<(HTMLDivElement | null)[]>([]);
  const reelBoxRefs = useRef<(HTMLDivElement | null)[]>([]);
  const reels = useRef<Reel[]>(
    Array.from({ length: REELS }, () => ({ pos: 0, vel: 0, mode: "idle" as Mode, t0: 0, p0: 0, len: 0, dur: 1 })),
  );
  const spinStart = useRef(0);
  const lastT = useRef(0);
  const lastCell = useRef<number[]>([0, 0, 0]);
  const lastTick = useRef(0);
  const want = useRef<number[]>([0, 0, 0]);
  const raf = useRef(0);
  const onLandedRef = useRef(onLanded);
  onLandedRef.current = onLanded;

  const [landed, setLanded] = useState<number[] | null>(null); // 멈춘 세 칸의 기호

  /** 릴 위치를 화면에 — React 렌더 없이 transform 만 바꾼다 */
  const paint = () => {
    reels.current.forEach((r, i) => {
      const el = stripRefs.current[i];
      if (!el) return;
      el.style.transform = `translate3d(0, ${WINDOW / 2 - CELL / 2 - mod(r.pos, N) * CELL}px, 0)`;
      el.style.filter = r.vel > 7 ? `blur(${Math.min(3, (r.vel - 7) / 3.5).toFixed(2)}px)` : "";
    });
  };

  const stopReel = (i: number) => {
    const r = reels.current[i];
    r.pos = mod(Math.round(r.pos), N);
    r.vel = 0;
    r.mode = "idle";
    lastCell.current[i] = Math.round(r.pos);
    playSfx("lock", 1 + i * 0.12);
    // 멈추는 순간 살짝 지나쳤다가 제자리로 "덜컥"
    reelBoxRefs.current[i]?.animate(
      [{ transform: "translateY(0)" }, { transform: "translateY(9px)", offset: 0.35 }, { transform: "translateY(0)" }],
      { duration: 320, easing: "cubic-bezier(0.3, 1.6, 0.5, 1)" },
    );
  };

  const loop = (now: number) => {
    const s = now / 1000;
    const dt = Math.min(0.05, s - lastT.current);
    lastT.current = s;
    let moving = 0;
    reels.current.forEach((r, i) => {
      if (r.mode === "spin" || r.mode === "wait") {
        r.vel = SPEED * Math.min(1, (s - spinStart.current) / RAMP_S);
        r.pos += r.vel * dt;
        if (r.mode === "wait" && s >= r.t0) {
          // 차례가 됐다 — 지금 위치에서 목표 칸까지 감속 거리 계산
          const strip = STRIPS[i];
          let target = Math.ceil(r.pos) + MIN_TRAVEL + i * EXTRA_TRAVEL;
          while (strip[mod(target, N)] !== want.current[i]) target++;
          r.p0 = r.pos;
          r.len = target - r.pos;
          r.dur = (3 * r.len) / Math.max(4, r.vel);
          r.t0 = s;
          r.mode = "decel";
        }
      } else if (r.mode === "decel") {
        const u = Math.min(1, (s - r.t0) / r.dur);
        r.pos = r.p0 + r.len * (1 - (1 - u) ** 3); // easeOutCubic — 시작 속도 = 돌던 속도
        r.vel = ((3 * r.len) / r.dur) * (1 - u) ** 2;
        if (u >= 1) stopReel(i);
      }
      if (r.mode !== "idle") moving++;
      const cell = Math.round(r.pos);
      if (cell !== lastCell.current[i]) {
        lastCell.current[i] = cell;
        // 칸이 지날 때마다 "띠리" — 세 릴 소리가 겹치지 않게 간격을 둔다
        if (now - lastTick.current > 45) {
          lastTick.current = now;
          playSfx("reel", cell % 2 ? 1 : 0.8);
        }
      }
    });
    paint();
    if (moving === 0) {
      setLanded(reels.current.map((r, i) => STRIPS[i][r.pos]));
      window.setTimeout(() => onLandedRef.current(), 300);
      return;
    }
    raf.current = requestAnimationFrame(loop);
  };

  // 레버 → 돌기 시작 / (오류로) 결과 없이 끝나면 가까운 칸에 세운다
  useEffect(() => {
    const allIdle = reels.current.every((r) => r.mode === "idle");
    if (spinning && allIdle) {
      setLanded(null);
      reels.current.forEach((r) => (r.mode = "spin"));
      spinStart.current = lastT.current = performance.now() / 1000;
      playSfx("lever");
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(loop);
    } else if (!spinning && reels.current.some((r) => r.mode === "spin")) {
      cancelAnimationFrame(raf.current);
      reels.current.forEach((r) => {
        r.mode = "idle";
        r.vel = 0;
        r.pos = mod(Math.round(r.pos), N);
      });
      paint();
    }
    // loop·paint 는 ref 만 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning]);

  // 결과 도착 → 목표 기호를 정하고 왼쪽 릴부터 차례로 감속
  useEffect(() => {
    if (!stopAt || !reels.current.every((r) => r.mode === "spin")) return;
    want.current = targetsFor(stopAt.place);
    const now = performance.now() / 1000;
    reels.current.forEach((r, i) => {
      r.mode = "wait";
      r.t0 = now + i * STAGGER_S;
    });
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

  const hit = landed && landed[0] === landed[1] && landed[1] === landed[2] ? landed[0] : null;
  const win = hit != null && hit > 0;
  const jackpot = win && hit <= 2;

  return (
    <div className={cn("flex select-none items-end gap-3", className)}>
      {/* ── 본체 ─────────────────────────────────────────── */}
      <div className="grad-line glow-iris min-w-0 flex-1 rounded-card bg-panel/80 p-4">
        {/* 간판 */}
        <div className="mb-3 rounded-tile border border-line bg-night/70 px-3 py-3 text-center">
          <p className="display grad-text font-mono text-3xl font-black tracking-[0.3em]">OWL JACKPOT</p>
        </div>
        <Bulbs spinning={spinning} jackpot={jackpot} win={win} />

        {/* 릴 창 — 세 줄 */}
        <div
          className="relative my-3 grid grid-cols-3 gap-2 overflow-hidden rounded-tile border border-line-strong bg-night p-2"
          style={{ height: WINDOW + 16 }}
        >
          {Array.from({ length: REELS }, (_, r) => (
            <div key={r} className="relative overflow-hidden rounded-xl border border-line bg-night-2">
              <div ref={(el) => void (reelBoxRefs.current[r] = el)} className="absolute inset-0">
                <div
                  ref={(el) => void (stripRefs.current[r] = el)}
                  className="absolute inset-x-0 top-0 will-change-transform"
                >
                  {Array.from({ length: N + 4 }, (_, i) => {
                    const k = i - 2;
                    const s = STRIPS[r][mod(k, N)];
                    return (
                      <div
                        key={k}
                        className="absolute inset-x-0 flex flex-col items-center justify-center gap-1"
                        style={{ top: k * CELL, height: CELL }}
                      >
                        <PrizeArt place={s || null} className="size-[108px] text-7xl" />
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
                    "linear-gradient(to bottom, var(--color-night) 0%, transparent 28%, transparent 72%, var(--color-night) 100%)",
                }}
                aria-hidden
              />
            </div>
          ))}

          {/* 당첨선 */}
          <div
            className={cn(
              "pointer-events-none absolute inset-x-1 top-1/2 -translate-y-1/2 rounded-tile border-2 transition-colors",
              jackpot ? "border-amber" : win ? "border-neon" : "border-neon/30",
              win && "glow-iris",
            )}
            style={{ height: CELL - 6 }}
            aria-hidden
          />
          <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 border-y-[10px] border-l-[13px] border-y-transparent border-l-magenta" aria-hidden />
          <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 border-y-[10px] border-r-[13px] border-y-transparent border-r-magenta" aria-hidden />

          {/* 1·2등 섬광 */}
          {jackpot && (
            <>
              <span
                className="pointer-events-none absolute left-1/2 top-1/2 h-48 w-full -translate-x-1/2 -translate-y-1/2 animate-flash rounded-full bg-amber/60 blur-2xl"
                aria-hidden
              />
              <span
                className="pointer-events-none absolute inset-x-3 top-1/2 -translate-y-1/2 animate-pulse-glow rounded-tile border-2 border-amber/60"
                style={{ height: CELL + 6 }}
                aria-hidden
              />
            </>
          )}
        </div>

        <Bulbs spinning={spinning} jackpot={jackpot} win={win} offset />
        <p className="mt-3 h-6 text-center font-mono text-base tracking-[0.3em] text-aqua" aria-live="polite">
          {spinning ? "SPINNING..." : landed == null ? (canPull ? "PULL THE LEVER" : "") : jackpot ? "JACKPOT!" : win ? "WIN!" : ""}
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
      {Array.from({ length: 13 }, (_, i) => (
        <span
          key={i}
          className={cn(
            "size-3 rounded-full",
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
        "relative w-16 shrink-0 touch-none outline-none",
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
          className="pointer-events-none absolute left-1/2 top-[70px] size-6 -translate-x-1/2 animate-bounce text-aqua"
          aria-hidden
        />
      )}
    </button>
  );
}
