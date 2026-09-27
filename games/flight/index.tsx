"use client";

// 🦉 아울러닝 (OWL RUNNING) — React 래퍼: 캔버스 · 입력 · HUD · 종료 처리
// 게임 로직은 engine/ 안에만 있다 (기획서 §14).
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { CFG, COLOR_INFO, comboMult, stageEndMeters, stageStartMeters, type Color } from "./config";
import { createGame, CUE, currentRaw, finalStats, scoreMult, update, type Game, type Input } from "./engine/game";
import { preloadSprites, preloadTextures, spriteUrl } from "./engine/assets";
import { createFx, updateFx } from "./engine/fx";
import { startFixedLoop } from "./engine/loop";
import { applyGlitch } from "./engine/overlay";
import { stageKey, stageTag } from "./engine/phases";
import { render } from "./engine/render";
import { Hud, type HudState } from "./hud/Hud";
import { playSfx, type Sfx } from "@/lib/sound";
import { actionOf, primaryLabel, useKeymap, useKeymapState } from "@/lib/keybinds";
import { sceneOf, setBgm } from "./audio";
import { createDprGovernor } from "../core/quality";
import type { GameComponentProps } from "../core/types";

const END_DELAY = 1.1; // 사망 원인을 1초 이상 보여준 뒤 결과로 (기획서 §12)

/** 스크롤 속도(px/s) → 체감 속도 km/h (1m = 24px) */
function speedKmh(g: Game): number {
  return Math.round((g.scroll / CFG.physics.pxPerMeter) * 3.6);
}

function snapshot(g: Game): HudState {
  const from = stageStartMeters(g.stage);
  const to = stageEndMeters(g.stage);
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
    shields: g.shields,
    rainbow: g.rainbow,
    efficiency: g.energy.efficiency,
    banner: g.banner,
    status: g.status,
    speed: speedKmh(g),
    // 2.0 — 거리로 정해지는 15단계 → ∞ (lib/stages 공통 곡선 대신 아울러닝 전용 표)
    stage: g.stage,
    stageTag: stageTag(g.stage),
    stageKey: stageKey(g.stage),
    stageProgress: Math.max(0, Math.min(1, (g.meters - from) / Math.max(1, to - from))),
    fever: g.fever,
    feverT: g.feverT,
    power: g.power,
    powerReady: g.powerReady,
    powerUnlocked: g.stageMax >= CFG.power.fromStage,
    skill: g.skill,
    skillT: g.skillT,
    colorChain: g.colorChain,
    scoreMult: scoreMult(g),
    nearChain: g.time - g.nearAt <= CFG.nearChain.window ? g.nearChain : 0,
    magnetT: g.magnetT,
    doubleT: g.doubleT,
    breakerT: g.breakerT,
    phantomT: g.phantomT,
    turboT: g.turboT,
    overdrive: g.overdrive,
    choice: g.choice ? { options: g.choice.options, t: g.choice.t } : null,
  };
}

/** 엔진 신호(CUE) → 합성 효과음 */
const CUE_SFX: [number, Sfx][] = [
  [CUE.death, "fail"],
  [CUE.fever, "fever"],
  [CUE.power, "power"],
  [CUE.legend, "legend"],
  [CUE.stage, "level"],
  [CUE.choice, "start"],
  [CUE.powerReady, "rank"],
  [CUE.hit, "hit"],
  [CUE.fire, "laser"],
  [CUE.warn, "alarm"],
  [CUE.lock, "lockOn"],
  [CUE.boom, "boom"],
  [CUE.mismatch, "fail"],
  [CUE.revive, "ok"],
  [CUE.perfect, "perfect"],
  [CUE.chain, "coin"],
  [CUE.near, "near"],
  [CUE.item, "coin"],
];

function playCues(g: Game, last: Map<Sfx, number>): void {
  if (!g.cues) return;
  const now = performance.now();
  let played = 0;
  for (const [bit, sfx] of CUE_SFX) {
    if (!(g.cues & bit) || played >= 2) continue;
    if (now - (last.get(sfx) ?? 0) < 70) continue;
    last.set(sfx, now);
    playSfx(sfx);
    played++;
  }
  g.cues = 0;
}

export function FlightGame({ onEnd }: GameComponentProps) {
  const t = useTranslations("hud.flight");
  const tc = useTranslations("hud.common");
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const flapRef = useRef(false);
  const cycleRef = useRef(false);
  const colorRef = useRef<Color | null>(null);
  const skillRef = useRef(false);
  const pickRef = useRef<number | null>(null);
  const keysRef = useKeymap("flight");
  const keyMap = useKeymapState("flight");
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

    preloadTextures();
    preloadSprites();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const g = createGame();
    const fx = createFx();
    let lastDraw = performance.now();
    gameRef.current = g;
    endedRef.current = false;

    const quality = createDprGovernor();
    let dpr = 1;
    let scale = 1;
    let offX = 0;
    let offY = 0;
    const fit = () => {
      dpr = quality.dpr;
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

    const sfxLast = new Map<Sfx, number>();
    const loop = startFixedLoop(
      (dt) => {
        const input: Input = {
          flap: flapRef.current,
          cycle: cycleRef.current,
          color: colorRef.current,
          skill: skillRef.current,
          pick: pickRef.current,
        };
        cycleRef.current = false;
        colorRef.current = null;
        skillRef.current = false;
        pickRef.current = null;
        update(g, dt, input);
        playCues(g, sfxLast);
        if (g.status === "dead" && g.deathAt >= END_DELAY && !endedRef.current) {
          endedRef.current = true;
          loop.stop();
          onEnd(currentRaw(g), { ...finalStats(g), death_cause: g.deathCause });
        }
      },
      () => {
        const now = performance.now();
        const fxDt = Math.min(0.05, (now - lastDraw) / 1000);
        lastDraw = now;
        if (quality.frame(now)) fit();
        updateFx(fx, g, fxDt, reduced);

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#06090f";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr * scale, 0, 0, dpr * scale, offX * dpr, offY * dpr);
        render(ctx, g, fx, reduced);
        if (!reduced) applyGlitch(ctx, canvas, g);
      },
    );

    loopRef.current = loop;
    const hudTimer = setInterval(() => {
      setHud(snapshot(g));
      // 배경음악 — 후반 단계·OVERDRIVE 면 몰아치는 곡으로 (같은 곡이면 아무 일도 안 한다)
      setBgm(g.status === "dead" ? "off" : sceneOf(g.stage, g.overdrive));
    }, 90);

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
    // 키는 설정(/settings → 키 설정)에서 바꾼다 — lib/keybinds.ts 의 DEFAULT_KEYS.flight
    const COLOR_OF = { colorR: 0, colorB: 1, colorP: 2 } as const;
    const down = (e: KeyboardEvent) => {
      const action = actionOf(keysRef.current, e.code);
      if (!action) return;
      e.preventDefault();
      if (e.repeat) return;
      if (action === "flap") {
        flapRef.current = true;
        setStarted(true);
      } else if (action === "cycle") {
        cycleRef.current = true;
      } else if (action === "colorR" || action === "colorB" || action === "colorP") {
        const n = COLOR_OF[action];
        // CHOOSE 1 이 떠 있으면 색 키 1·2·3 번째는 보상 선택, 아니면 색 (2.0 §26)
        if (g.choice) pickRef.current = n;
        else colorRef.current = (["R", "B", "P"] as const)[n];
      } else if (action === "skill") skillRef.current = true;
      else if (action === "pause") togglePauseRef.current();
    };
    const up = (e: KeyboardEvent) => {
      if (actionOf(keysRef.current, e.code) === "flap") flapRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);

    return () => {
      endedRef.current = true;
      loop.stop();
      clearInterval(hudTimer);
      clearInterval(pauseTimer);
      setBgm("off");
      window.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("resize", fit);
      window.removeEventListener("resize", orientation);
      window.removeEventListener("orientationchange", orientation);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      document.removeEventListener("visibilitychange", onVisibility);
      loopRef.current = null;
    };
  }, [onEnd, keysRef]);

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
      className="relative h-full w-full touch-none overflow-hidden bg-[#06090f] select-none"
      onPointerDown={onPointerDown}
      onPointerUp={stopFlap}
      onPointerCancel={stopFlap}
      onPointerLeave={stopFlap}
    >
      <canvas ref={canvasRef} className="absolute inset-0" aria-label={t("canvasAria")} />

      {hud && (
        <Hud
          hud={hud}
          keyMap={keyMap}
          pauseLeft={pauseLeft}
          onCycleColor={() => {
            cycleRef.current = true;
          }}
          onSkill={() => {
            skillRef.current = true;
          }}
          onPick={(i) => {
            pickRef.current = i;
          }}
          onPause={() => togglePauseRef.current()}
        />
      )}

      {/* 시작 안내 */}
      {!started && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="rounded-2xl border border-line bg-night/80 px-6 py-5 text-center">
            <Image
              src={spriteUrl("char/hero")}
              alt=""
              width={148}
              height={138}
              priority
              className="mx-auto -mt-2 h-auto w-24 animate-pulse drop-shadow-[0_0_18px_rgba(129,140,248,0.55)]"
              draggable={false}
            />
            <Image
              src={spriteUrl("logo")}
              alt="OWL RUNNING"
              width={192}
              height={62}
              priority
              className="mx-auto h-auto w-40 drop-shadow-[0_0_14px_rgba(61,217,235,0.45)]"
              draggable={false}
            />
            <p className="mt-1 text-lg font-black text-ink">{t("startTitle")}</p>
            <p className="mt-1 text-sm text-mute">{t("startHint")}</p>
            <p className="mt-1 hidden text-xs text-dim pc:block">
              {t("startKeys", {
                flap: primaryLabel(keyMap, "flap"),
                r: primaryLabel(keyMap, "colorR"),
                b: primaryLabel(keyMap, "colorB"),
                p: primaryLabel(keyMap, "colorP"),
                skill: primaryLabel(keyMap, "skill"),
                pause: primaryLabel(keyMap, "pause"),
              })}
            </p>
            <div className="mt-3 flex items-center justify-center gap-3 text-xs text-dim">
              {(Object.keys(COLOR_INFO) as Color[]).map((c) => (
                <span key={c} className="flex items-center gap-1" style={{ color: COLOR_INFO[c].hex }}>
                  <svg viewBox="0 0 24 24" className="size-3">
                    {COLOR_INFO[c].shape === "circle" && <circle cx="12" cy="12" r="9" fill="currentColor" />}
                    {COLOR_INFO[c].shape === "square" && <rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" />}
                    {COLOR_INFO[c].shape === "triangle" && <path d="M12 3 L21 20 L3 20 Z" fill="currentColor" />}
                  </svg>
                  {COLOR_INFO[c].label}
                  <kbd className="ml-0.5 hidden rounded border border-current/50 px-1 font-mono text-[10px] pc:inline">
                    {primaryLabel(keyMap, c === "R" ? "colorR" : c === "B" ? "colorB" : "colorP")}
                  </kbd>
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
            {cause === "wall" ? t("deathWall") : cause === "time" ? t("deathTime") : t("deathEnergy")}
          </p>
        </div>
      )}

      {/* 일시정지 */}
      {paused && !portrait && (
        <div className="absolute inset-0 grid place-items-center bg-night/80">
          <div className="text-center">
            <p className="text-2xl font-black">{tc("pause")}</p>
            <p className="num mt-1 text-sm text-mute">{tc("pauseNote", { sec: Math.ceil(pauseLeft) })}</p>
            <button
              type="button"
              onClick={() => togglePauseRef.current()}
              className="mt-4 min-h-12 rounded-2xl bg-neon px-6 font-bold text-night"
            >
              {tc("resume")}
            </button>
          </div>
        </div>
      )}

      {/* 세로 화면 안내 */}
      {portrait && (
        <div className="absolute inset-0 grid place-items-center bg-night/90 px-6 text-center">
          <div>
            <RotateCw className="mx-auto size-10 animate-pulse text-neon" />
            <p className="mt-3 text-lg font-black">{tc("rotateLandscape")}</p>
            <p className="mt-1 text-sm text-mute">{t("rotateNote")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
