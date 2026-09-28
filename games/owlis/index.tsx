"use client";

// 🧩 아울리스 (OWLIS) — 메뉴 → READY → 대전 → GAME OVER (기획서 §32~§34)
//
// 폰(세로·터치)과 PC(가로·키보드) 둘 다 한 화면 코드로 돈다 — 화면 문법은 뿌요뿌요 온라인 대전 화면:
//   · 배치는 render.ts 의 layout() 이 화면 비율로 고른다 (점수·TIME·AI LEVEL·NEXT 는 캔버스에)
//   · 터치: 아래(세로) / 좌우 구석(가로) 게임패드 + 필드 위 드래그(좌우) · 탭(회전) · 아래로 끌기(소프트) · 튕기기(↓ 하드 / ↑ 홀드)
//   · 키보드: 설정의 키 설정(lib/keybinds.ts, 기본 ← → ↓ · X/↑ · Z · Space · C · Esc)

import { GameLogo } from "@/components/GameLogo";
import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, BookOpen, Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { CFG } from "./config";
import { CUE, act, createGame, update, type Game, type Held, type Action } from "./engine/game";
import { levelLabel } from "./engine/difficulty";
import { createRenderer, draw, layout, type Insets, type Labels, type Layout } from "./engine/render";
import { buildMeta, rawScore, rollOwlEnergy } from "./engine/score";
import { Controls, CONTROLS_H, CONTROLS_SIDE_W } from "./ui/Controls";
import { Hud, type HudState } from "./ui/Hud";
import { KeyHints, KEY_HINTS_H } from "./ui/KeyHints";
import { GRAD, OWLIS, glassStyle } from "./theme";
import { startFixedLoop, type Loop } from "@/games/flight/engine/loop";
import { fetchOwlisRecord, type OwlisRecord } from "@/lib/client-queries";
import { actionOf, primaryLabel, useKeymap, useKeymapState, type KeyAction } from "@/lib/keybinds";
import { playSfx } from "@/lib/sound";
import { sceneOf, setBgm } from "./audio";
import { createDprGovernor } from "../core/quality";
import { PauseMenu, usePause } from "../core/pause";
import { CoachHand, useCoachSteps, type Gesture } from "../core/coach";
import type { GameComponentProps } from "../core/types";

const INTRO_SEC = 1.3;
/** 첫 조작 안내 — OWLIS! 뒤에 [좌우로 끌기] [탭 = 회전] [아래로 튕기기] 를 두 번 돌려 보여 준다 */
const COACH: { gesture: Gesture; label: "drag" | "rotate" | "drop" }[] = [
  { gesture: "drag-x", label: "drag" },
  { gesture: "tap", label: "rotate" },
  { gesture: "flick-down", label: "drop" },
];
const COACH_MS = [2600, 1800, 2000] as const;

function releaseHeld(g: Game): void {
  g.held.left = false;
  g.held.right = false;
  g.held.soft = false;
}

/** 화면 가장자리에서 비워 둘 곳 — 터치 패드·키 안내가 필드를 가리지 않게 */
function insetsOf(touch: boolean, portrait: boolean, padH: number): Insets {
  if (!touch) return { top: 12, bottom: KEY_HINTS_H + 4, left: 8, right: 8 };
  // 아래 패드는 안전 영역(홈 막대)만큼 더 높아질 수 있어 실제 높이를 잰다
  if (portrait) return { top: 6, bottom: Math.max(CONTROLS_H, padH) + 6, left: 0, right: 0 };
  return { top: 6, bottom: 6, left: CONTROLS_SIDE_W, right: CONTROLS_SIDE_W };
}

function isTouch(): boolean {
  if (typeof window === "undefined") return false;
  return navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;
}

export function OwlisGame({ onEnd }: GameComponentProps) {
  const [started, setStarted] = useState(false);
  if (!started) return <Menu onStart={() => setStarted(true)} />;
  return <OwlisRun onEnd={onEnd} />;
}

/* ── 메뉴 (§32) — 리퀴드 글래스 카드 ─────────────────────────────── */

function clock(sec: number): string {
  const s = Math.floor(sec);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** 네온 글자 — 거의 흰 심지 + 시안·바이올렛으로 번지는 빛 (처음 버전) */
const NEON_TITLE: React.CSSProperties = {
  color: "#e0fbff",
  textShadow: `0 0 6px ${GRAD.aqua}, 0 0 16px ${GRAD.aqua}, 0 0 38px ${GRAD.violet}`,
};

function Menu({ onStart }: { onStart: () => void }) {
  const t = useTranslations("hud.owlis.menu");
  const [panel, setPanel] = useState<"none" | "record" | "how">("none");
  const [rec, setRec] = useState<OwlisRecord | null>(null);
  const keys = useKeymapState("owlis");
  const key = (a: KeyAction<"owlis">) => primaryLabel(keys, a) || "—";

  useEffect(() => {
    fetchOwlisRecord()
      .then(setRec)
      .catch(() => setRec(null));
  }, []);

  // PC: Enter / Space 로 바로 시작 (버튼에 포커스가 있으면 그 버튼에 맡긴다)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("button")) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onStart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStart]);

  const tab = (id: "record" | "how") => setPanel((p) => (p === id ? "none" : id));
  // 보조 버튼 = 어두운 유리 알약 + 그라데이션 헤어라인 (레퍼런스 "Secondary")
  const sub = "inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-bold text-[#e9edfb] transition-transform active:scale-95";

  return (
    <div
      className="grid h-full place-items-center overflow-y-auto p-5"
      style={{
        backgroundColor: OWLIS.bg,
        backgroundImage: `radial-gradient(60% 45% at 15% 10%, rgba(167,139,250,0.16), transparent 70%),
          radial-gradient(55% 45% at 95% 95%, rgba(232,121,249,0.12), transparent 70%),
          radial-gradient(45% 40% at 0% 100%, rgba(34,211,238,0.10), transparent 70%)`,
      }}
    >
      <div className="w-full max-w-sm rounded-[28px] p-6 text-center" style={glassStyle({ glow: GRAD.violet })}>
        <GameLogo game="owlis" alt="OWLIS" className="mx-auto h-40 w-full" />
        <div className="mx-auto mt-3 h-[3px] w-10 rounded-full" style={{ background: GRAD.aqua, boxShadow: `0 0 10px ${GRAD.aqua}` }} />
        <p className="mt-3 text-sm text-[#98a3c6]">{t("tagline")}</p>

        {/* 주 버튼 = 시안 그라데이션 알약 + 발광 (레퍼런스 "Button") */}
        <button
          type="button"
          onClick={onStart}
          className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full text-lg font-black text-[#060913] transition-transform active:scale-95"
          style={glassStyle({ fill: true, from: GRAD.cyan, via: GRAD.aqua, to: GRAD.violet, glow: GRAD.aqua })}
        >
          <Play className="size-5" />
          {t("play")}
        </button>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => tab("record")}
            aria-pressed={panel === "record"}
            className={sub}
            style={glassStyle({ from: GRAD.aqua, via: GRAD.violet, to: GRAD.aqua, glow: panel === "record" ? GRAD.aqua : undefined })}
          >
            <BarChart3 className="size-4" style={{ color: GRAD.aqua }} />
            {t("record")}
          </button>
          <button
            type="button"
            onClick={() => tab("how")}
            aria-pressed={panel === "how"}
            className={sub}
            style={glassStyle({ from: GRAD.violet, via: GRAD.magenta, to: GRAD.violet, glow: panel === "how" ? GRAD.magenta : undefined })}
          >
            <BookOpen className="size-4" style={{ color: GRAD.magenta }} />
            {t("how")}
          </button>
        </div>

        {panel === "record" && (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-[20px] p-4 text-left text-sm" style={glassStyle({ from: GRAD.aqua, via: GRAD.violet, to: GRAD.aqua })}>
            {(
              [
                [t("best"), rec ? rec.best.toLocaleString() : "-"],
                [t("longest"), rec ? clock(rec.sec) : "-"],
                [t("maxCombo"), rec ? `x${rec.combo}` : "-"],
                [t("maxLevel"), rec && rec.level > 0 ? levelLabel(rec.level) : "-"],
                [t("games"), rec ? String(rec.games) : "-"],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-2">
                <dt className="text-[#98a3c6]">{k}</dt>
                <dd className="num font-bold text-[#e9edfb]">{v}</dd>
              </div>
            ))}
          </dl>
        )}

        {panel === "how" && (
          <div className="mt-3 grid gap-2 rounded-[20px] p-4 text-left text-[13px] leading-relaxed" style={glassStyle({ from: GRAD.violet, via: GRAD.magenta, to: GRAD.violet })}>
            {(t.raw("rules") as string[]).map((r) => (
              <p key={r} className="flex gap-2 text-[#98a3c6]">
                <span style={{ color: GRAD.aqua }}>▸</span>
                <span>{r}</span>
              </p>
            ))}
            <p className="mt-1 font-bold text-[#e9edfb]">{t("controlsTitle")}</p>
            <p className="text-[#98a3c6]">{t("controlsTouch")}</p>
            <p className="hidden text-[#98a3c6] pc:block">
              {t("controlsKeys", {
                left: key("left"),
                right: key("right"),
                soft: key("soft"),
                rotR: key("rotR"),
                rotL: key("rotL"),
                hard: key("hard"),
                hold: key("hold"),
                pause: key("pause"),
              })}
            </p>
          </div>
        )}

        <p className="mt-4 text-[11px] text-[#6f7aa0]">{t("hint")}</p>
      </div>
    </div>
  );
}

/* ── 대전 ────────────────────────────────────────────────────── */

function OwlisRun({ onEnd }: { onEnd: GameComponentProps["onEnd"] }) {
  const t = useTranslations("hud.owlis");
  const tc = useTranslations("hud.common");
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const layRef = useRef<Layout | null>(null);
  const labelsRef = useRef<Labels | null>(null);
  const keys = useKeymap("owlis");
  const [touch] = useState(isTouch);
  const [padMode, setPadMode] = useState<"bar" | "sides">("bar");
  const [hud, setHud] = useState<HudState | null>(null);
  const [intro, setIntro] = useState<"ready" | "go" | null>("ready");
  const [over, setOver] = useState<"topout" | "time" | null>(null);
  /** 손가락을 놓을 곳 — 내 필드 가운데 조금 아래 */
  const [coachAt, setCoachAt] = useState<{ x: number; y: number } | null>(null);

  // 일시정지 — 공통 메뉴(games/core/pause.tsx), 한 판에 1분까지. 멈춘 동안 필드를 가린다
  const loopRef = useRef<Loop | null>(null);
  const pause = usePause((frozen) => {
    loopRef.current?.setPaused(frozen);
    if (gameRef.current) releaseHeld(gameRef.current);
  });
  const pausedRef = pause.openRef;

  labelsRef.current = {
    next: t("next"),
    hold: t("hold"),
    attack: t("attack"),
    fever: t("feverGauge"),
    feverOn: t("feverOn"),
    you: t("you"),
    aiLevel: t("aiLevel"),
    time: t("time"),
    chain: (n: number) => t("chainPop", { n }),
    reboot: t("rebootField"),
  };

  const onAction = useCallback((a: Action) => {
    const g = gameRef.current;
    if (g && !pausedRef.current) act(g, a);
  }, [pausedRef]);
  const onHeld = useCallback((k: keyof Held, on: boolean) => {
    const g = gameRef.current;
    if (g && !pausedRef.current) g.held[k] = on;
  }, [pausedRef]);
  const { toggle: togglePauseMenu, autoPause } = pause;
  const togglePause = useCallback(() => {
    const g = gameRef.current;
    if (!g || g.over) return;
    togglePauseMenu();
  }, [togglePauseMenu]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !wrap || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const device: "mobile" | "desktop" = touch ? "mobile" : "desktop";
    const g = createGame(Date.now());
    gameRef.current = g;
    const R = createRenderer();

    const quality = createDprGovernor();
    let dpr = 1;
    let w = 1;
    let h = 1;
    const fit = () => {
      dpr = quality.dpr;
      w = wrap.clientWidth;
      h = wrap.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const portrait = h > w * 1.05;
      const padH = wrap.querySelector<HTMLElement>("[data-owlis-pad]")?.offsetHeight ?? 0;
      const lay = layout(w, h, insetsOf(touch, portrait, padH));
      layRef.current = lay;
      setCoachAt({ x: lay.pf.x + (lay.pf.cell * CFG.field.cols) / 2, y: lay.pf.y + lay.pf.cell * CFG.field.rows * 0.55 });
      setPadMode(portrait ? "bar" : "sides");
      R.sprites.clear();
    };
    fit();
    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", fit);
    window.visualViewport?.addEventListener("resize", fit);

    let introT = 0;
    let overT = 0;
    let ended = false;
    let lastDraw = performance.now();

    const loop = startFixedLoop(
      (dt) => {
        // READY → OWLIS! 동안은 멈춰 있다 (§33)
        if (introT < INTRO_SEC) {
          introT += dt;
          return;
        }
        update(g, dt);
        if (g.over && !ended) {
          overT += dt;
          if (overT >= CFG.run.endDelay) {
            ended = true;
            loop.stop();
            rollOwlEnergy(g);
            onEnd(rawScore(g), buildMeta(g, device));
          }
        }
      },
      () => {
        const now = performance.now();
        const dt = Math.min(0.05, (now - lastDraw) / 1000);
        lastDraw = now;
        if (quality.frame(now)) fit();
        playCues(g);
        const lay = layRef.current;
        const labels = labelsRef.current;
        if (!lay || !labels) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw(ctx, R, g, lay, w, h, dt, labels, reduced);
      },
    );
    loopRef.current = loop;

    const hudTimer = setInterval(() => {
      setHud({ banner: g.banner ? { ...g.banner } : null });
      setIntro(introT < INTRO_SEC * 0.55 ? "ready" : introT < INTRO_SEC ? "go" : null);
      // 배경음악 — 후반(높은 AI LEVEL)·위기에서 긴장감 있는 곡으로 (같은 곡이면 아무 일도 안 한다)
      setBgm(g.over ? "off" : sceneOf(g.diff.peak, g.critical));
      if (g.over) setOver(g.end);
    }, 90);

    // 키보드 (PC) — 키는 설정의 키 설정에서 (keys.current 를 매번 읽으니 바꾸면 바로 적용)
    const onDown = (e: KeyboardEvent) => {
      const a = actionOf(keys.current, e.code);
      if (!a) return;
      e.preventDefault();
      if (a === "pause") {
        if (!e.repeat) togglePause();
        return;
      }
      if (pausedRef.current) return;
      if (a === "left" || a === "right") {
        if (!e.repeat) act(g, a);
        g.held[a] = true;
      } else if (a === "soft") g.held.soft = true;
      else if (!e.repeat) act(g, a);
    };
    const onUp = (e: KeyboardEvent) => {
      const a = actionOf(keys.current, e.code);
      if (a === "left" || a === "right" || a === "soft") g.held[a] = false;
    };
    const onBlur = () => releaseHeld(g);
    // 탭이 가려지면 자동 일시정지 (남은 시간이 있을 때만)
    const onVisibility = () => {
      if (document.hidden && !g.over) autoPause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);

    return () => {
      ended = true;
      loop.stop();
      loopRef.current = null;
      clearInterval(hudTimer);
      setBgm("off");
      window.removeEventListener("resize", fit);
      window.removeEventListener("orientationchange", fit);
      window.visualViewport?.removeEventListener("resize", fit);
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onEnd]);

  // 패드 모양이 바뀌면(세로 ↔ 가로) 새 패드 높이로 한 번 더 배치한다
  useEffect(() => {
    if (touch) window.dispatchEvent(new Event("resize"));
  }, [padMode, touch]);

  /* 터치 제스처 — 필드 위 어디서든 */
  const gs = useRef({ id: -1, x0: 0, y0: 0, ax: 0, t0: 0, moved: false, soft: false });
  const onPointerDown = (e: React.PointerEvent) => {
    gs.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, ax: e.clientX, t0: performance.now(), moved: false, soft: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = gs.current;
    const g = gameRef.current;
    const cell = layRef.current?.pf.cell ?? 30;
    if (s.id !== e.pointerId || !g) return;
    const step = cell * 0.85;
    while (e.clientX - s.ax >= step) {
      act(g, "right");
      s.ax += step;
      s.moved = true;
    }
    while (s.ax - e.clientX >= step) {
      act(g, "left");
      s.ax -= step;
      s.moved = true;
    }
    const dy = e.clientY - s.y0;
    if (!s.soft && dy > cell * 1.2 && Math.abs(e.clientX - s.x0) < cell) {
      s.soft = true;
      s.moved = true;
      g.held.soft = true;
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = gs.current;
    const g = gameRef.current;
    const cell = layRef.current?.pf.cell ?? 30;
    if (s.id !== e.pointerId || !g) return;
    s.id = -1;
    const dt = Math.max(1, performance.now() - s.t0);
    const dy = e.clientY - s.y0;
    const vy = dy / dt;
    if (s.soft) g.held.soft = false;
    if (dy > cell * 2 && vy > 0.9) act(g, "hard");
    else if (dy < -cell * 2 && vy < -0.9) act(g, "hold");
    else if (!s.moved && dt < 280 && Math.abs(dy) < cell * 0.6) {
      // 탭 — 화면 왼쪽 절반은 반시계, 오른쪽 절반은 시계
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      act(g, e.clientX - rect.left < rect.width / 2 ? "rotL" : "rotR");
    }
  };

  // 첫 조작 안내 손가락 — 일시정지 동안은 시간이 흐르지 않는다
  const coachLive = !intro && !over && !pause.open && coachAt !== null;
  const coach = useCoachSteps(COACH_MS, coachLive, 2);
  const coachStep = coach.step >= 0 ? COACH[coach.step] : null;

  return (
    <div ref={wrapRef} className="relative h-full w-full touch-none select-none overflow-hidden" style={{ background: OWLIS.bg }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        aria-label={t("canvas")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {hud && <Hud hud={hud} />}
      {touch ? (
        <Controls mode={padMode} onAction={onAction} onHeld={onHeld} onPause={togglePause} canPause={!over} />
      ) : (
        <>
          <KeyHints />
          <button
            type="button"
            aria-label={tc("pause")}
            disabled={!!over}
            onClick={togglePause}
            className="absolute right-3 top-3 z-10 grid size-11 place-items-center rounded-full text-[#e9edfb] active:scale-95 disabled:opacity-35"
            style={glassStyle({ from: GRAD.violet, via: GRAD.aqua, to: GRAD.violet })}
          >
            <Pause className="size-5" />
          </button>
        </>
      )}

      {coachLive && coachStep && coachAt && (
        <CoachHand at={coachAt} gesture={coachStep.gesture} label={t(`coach.${coachStep.label}`)} />
      )}

      {/* 멈춘 동안은 필드를 가린다 — 생각할 시간을 벌지 못하게 */}
      <PauseMenu ctl={pause} backdrop={OWLIS.bg} />

      {intro && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
          <p
            key={intro}
            className="animate-pop font-mono text-6xl font-black tracking-[0.2em]"
            style={intro === "go" ? NEON_TITLE : { color: OWLIS.dim, textShadow: `0 0 12px ${OWLIS.dim}66` }}
          >
            {intro === "go" ? "OWLIS!" : t("ready")}
          </p>
        </div>
      )}

      {over && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-[#060913]/60 backdrop-blur-[2px]">
          <p
            className="animate-pop font-mono text-5xl font-black tracking-[0.15em]"
            style={{
              color: over === "time" ? "#fff7d6" : "#ffe4ea",
              textShadow: `0 0 8px ${over === "time" ? OWLIS.gold : OWLIS.danger}, 0 0 22px ${over === "time" ? OWLIS.gold : OWLIS.danger}, 0 0 44px ${over === "time" ? GRAD.aqua : GRAD.magenta}`,
            }}
          >
            {over === "time" ? t("timeUpBig") : t("gameOver")}
          </p>
        </div>
      )}
    </div>
  );
}

/* ── 효과음 (엔진 CUE → lib/sound) ─────────────────────────────── */

function playCues(g: Game): void {
  const c = g.cues;
  if (!c) return;
  g.cues = 0;
  if (c & CUE.DEAD) playSfx("boom");
  if (c & CUE.KO) playSfx("level");
  if (c & CUE.EVOLVE) playSfx("rank");
  if (c & CUE.FEVER) playSfx("start");
  if (c & CUE.COUNTER) playSfx("coin");
  else if (c & CUE.EMERGENCY) playSfx("ok");
  if (c & CUE.CLEAR) {
    // 연쇄가 길수록 음이 올라간다 (§42)
    playSfx("chain", 1 + Math.min(12, g.cueChain - 1) * 0.12);
    g.cueChain = 0;
  }
  if (c & CUE.SEND) playSfx("send");
  if (c & CUE.GARBAGE) playSfx("thud");
  if (c & CUE.CRITICAL) playSfx("alarm");
  if (c & CUE.SURVIVAL) playSfx("coin");
  if (c & CUE.LOCK) playSfx("lock");
  if (c & (CUE.ROTATE | CUE.HOLD)) playSfx("tap");
}
