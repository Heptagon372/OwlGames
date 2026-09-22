"use client";

// 🦉 아울러닝 (OWL RUNNING) — React 래퍼: 캔버스 · 입력 · HUD · 종료 처리
// 게임 로직은 engine/ 안에만 있다 (기획서 §14).
import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { CFG, COLOR_INFO, comboMult, type Color } from "./config";
import { createGame, currentRaw, finalStats, update, type Game, type Input } from "./engine/game";
import { startFixedLoop } from "./engine/loop";
import { render } from "./engine/render";
import { Hud, type HudState } from "./hud/Hud";
import type { GameComponentProps } from "../core/types";

const END_DELAY = 1.1; // 사망 원인을 1초 이상 보여준 뒤 결과로 (기획서 §12)

function snapshot(g: Game): HudState {
  return {
    energy: g.energy.value,
    energyMax: g.energy.max,
    low: g.energy.value <= g.energy.max * CFG.energy.lowRatio,
    meters: g.meters,
    score: currentRaw(g, false),
    combo: g.score.combo,
    comboMult: comboMult(g.score.combo),
    color: g.color,
    nextGate: g.nextGate,
    size: g.size,
    shield: g.shield,
    rainbow: g.rainbow,
    efficiency: g.energy.efficiency,
    banner: g.banner,
    status: g.status,
    special: g.special?.label ?? null,
  };
}

export function FlightGame({ onEnd }: GameComponentProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const flapRef = useRef(false);
  const cycleRef = useRef(false);
  const colorRef = useRef<Color | null>(null);
  const endedRef = useRef(false);

  const [hud, setHud] = useState<HudState | null>(null);
  const [paused, setPaused] = useState(false);
  const [pauseLeft, setPauseLeft] = useState<number>(CFG.pause.totalSec);
  const [portrait, setPortrait] = useState(false);
  const [started, setStarted] = useState(false);

  const pauseLeftRef = useRef<number>(CFG.pause.totalSec);
  const pausedRef = useRef(false);
  const portraitRef = useRef(false);
  const loopRef = useRef<{ setPaused: (p: boolean) => void } | null>(null);
  const togglePauseRef = useRef<() => void>(() => {});

  togglePauseRef.current = () => {
    if (pauseLeftRef.current <= 0 && !pausedRef.current) return;
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    loopRef.current?.setPaused(next);
  };

  // ── 게임 루프 ───────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const g = createGame();
    gameRef.current = g;
    endedRef.current = false;

    let dpr = 1;
    let scale = 1;
    let offX = 0;
    let offY = 0;
    const fit = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = wrap.clientWidth;
      const ch = wrap.clientHeight;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      scale = Math.min(cw / CFG.view.w, ch / CFG.view.h);
      offX = (cw - CFG.view.w * scale) / 2;
      offY = (ch - CFG.view.h * scale) / 2;
    };
    fit();
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);

    const loop = startFixedLoop(
      (dt) => {
        const input: Input = { flap: flapRef.current, cycle: cycleRef.current, color: colorRef.current };
        cycleRef.current = false;
        colorRef.current = null;
        update(g, dt, input);
        if (g.status === "dead" && g.deathAt >= END_DELAY && !endedRef.current) {
          endedRef.current = true;
          loop.stop();
          onEnd(currentRaw(g), { ...finalStats(g), death_cause: g.deathCause });
        }
      },
      () => {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#06090f";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr * scale, 0, 0, dpr * scale, offX * dpr, offY * dpr);
        render(ctx, g, reduced);
      },
    );

    loopRef.current = loop;
    const hudTimer = setInterval(() => setHud(snapshot(g)), 90);

    // 탭이 가려지면 자동 일시정지 (§14)
    const onVisibility = () => {
      if (document.hidden) {
        pausedRef.current = true;
        setPaused(true);
        loop.setPaused(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // 세로 화면이면 안내 후 정지 (§2)
    const orientation = () => {
      const isPortrait = window.innerHeight > window.innerWidth && window.innerWidth < 820;
      portraitRef.current = isPortrait;
      setPortrait(isPortrait);
      loop.setPaused(isPortrait || pausedRef.current);
    };
    orientation();
    window.addEventListener("resize", orientation);
    window.addEventListener("orientationchange", orientation);

    // 일시정지 예산 (총 15초)
    const pauseTimer = setInterval(() => {
      if (!pausedRef.current || portraitRef.current) return;
      pauseLeftRef.current = Math.max(0, pauseLeftRef.current - 0.25);
      setPauseLeft(pauseLeftRef.current);
      if (pauseLeftRef.current <= 0) {
        pausedRef.current = false;
        setPaused(false);
        loop.setPaused(false);
      }
    }, 250);

    // ── 키보드 ────────────────────────────────────────────
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        flapRef.current = true;
        setStarted(true);
      } else if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
        cycleRef.current = true;
      } else if (e.code === "Digit1") colorRef.current = "R";
      else if (e.code === "Digit2") colorRef.current = "B";
      else if (e.code === "Digit3") colorRef.current = "P";
      else if (e.code === "KeyP" || e.code === "Escape") togglePauseRef.current();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") flapRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);

    return () => {
      endedRef.current = true;
      loop.stop();
      clearInterval(hudTimer);
      clearInterval(pauseTimer);
      window.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("resize", fit);
      window.removeEventListener("resize", orientation);
      window.removeEventListener("orientationchange", orientation);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      document.removeEventListener("visibilitychange", onVisibility);
      loopRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onEnd]);

  // 길게 누르기(컨텍스트 메뉴) 방지
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const handler = (e: Event) => e.preventDefault();
    el.addEventListener("contextmenu", handler);
    return () => el.removeEventListener("contextmenu", handler);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    flapRef.current = true;
    setStarted(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);
  const stopFlap = useCallback(() => {
    flapRef.current = false;
  }, []);

  const cause = gameRef.current?.deathCause ?? null;

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full touch-none overflow-hidden bg-[#06090f]"
      onPointerDown={onPointerDown}
      onPointerUp={stopFlap}
      onPointerCancel={stopFlap}
      onPointerLeave={stopFlap}
    >
      <canvas ref={canvasRef} className="absolute inset-0" aria-label="아울러닝 게임 화면" />

      {hud && (
        <Hud
          hud={hud}
          pauseLeft={pauseLeft}
          onCycleColor={() => {
            cycleRef.current = true;
          }}
          onPause={() => togglePauseRef.current()}
        />
      )}

      {/* 시작 안내 */}
      {!started && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="rounded-2xl border border-line bg-night/80 px-6 py-5 text-center">
            <p className="text-lg font-black text-ink">화면을 꾹 눌러 날아오르기</p>
            <p className="mt-1 text-sm text-mute">떼면 활공 · 오른쪽 버튼으로 색 변경</p>
            <div className="mt-3 flex items-center justify-center gap-3 text-xs text-dim">
              {(Object.keys(COLOR_INFO) as Color[]).map((c) => (
                <span key={c} className="flex items-center gap-1" style={{ color: COLOR_INFO[c].hex }}>
                  <svg viewBox="0 0 24 24" className="size-3">
                    {COLOR_INFO[c].shape === "circle" && <circle cx="12" cy="12" r="9" fill="currentColor" />}
                    {COLOR_INFO[c].shape === "square" && <rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" />}
                    {COLOR_INFO[c].shape === "triangle" && <path d="M12 3 L21 20 L3 20 Z" fill="currentColor" />}
                  </svg>
                  {COLOR_INFO[c].label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 사망 원인 (§0 원칙 3) */}
      {hud?.status === "dead" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-night/55">
          <p className="animate-pop text-3xl font-black text-alert">
            {cause === "wall" ? "💥 벽 충돌" : "🪫 에너지 고갈"}
          </p>
        </div>
      )}

      {/* 일시정지 */}
      {paused && !portrait && (
        <div className="absolute inset-0 grid place-items-center bg-night/80">
          <div className="text-center">
            <p className="text-2xl font-black">일시정지</p>
            <p className="num mt-1 text-sm text-mute">남은 시간 {Math.ceil(pauseLeft)}초 (0이 되면 자동 재개)</p>
            <button
              type="button"
              onClick={() => togglePauseRef.current()}
              className="mt-4 min-h-12 rounded-2xl bg-neon px-6 font-bold text-night"
            >
              계속하기
            </button>
          </div>
        </div>
      )}

      {/* 세로 화면 안내 */}
      {portrait && (
        <div className="absolute inset-0 grid place-items-center bg-night/90 px-6 text-center">
          <div>
            <RotateCw className="mx-auto size-10 animate-pulse text-neon" />
            <p className="mt-3 text-lg font-black">가로로 돌려주세요</p>
            <p className="mt-1 text-sm text-mute">아울러닝은 가로 화면에서 플레이합니다</p>
          </div>
        </div>
      )}
    </div>
  );
}
