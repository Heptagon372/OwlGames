"use client";

// 🦉 아울 서바이버즈 v3 — 시작 화면 → 런 (기획서 §1)
// 스테이지 선택이 없다. [게임 시작]을 누르면 바로 1단계부터 무한 맵이 열린다.

import { GameLogo } from "@/components/GameLogo";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { CFG } from "./config";
import { preloadMobs, preloadObstacles, preloadOwl } from "./engine/assets";
import { chooseCard, createRun, isPaused, rerollCards, skipCards, stageDuration, update, type Input, type Run } from "./engine/game";
import { ACTIVES, EVOLUTIONS, PASSIVES } from "./data/skills";
import { bombFuse, chronoTimeLeft } from "./engine/bosses/chrono";
import { render, resetSprites } from "./engine/render";
import { buildMeta, rawScore, rollOwlEnergy } from "./engine/score";
import { visibleLog } from "./engine/world";
import { playCues, playSound, preloadSurviveAudio, setBgm } from "./audio";
import { THEMES, type ThemeId } from "./theme";
import { Cards } from "./ui/Cards";
import { Guide } from "./ui/Guide";
import { Hud, type HudState } from "./ui/Hud";
import { Joystick } from "./ui/Joystick";
import { actionOf, primaryLabel, useKeymap, useKeymapState } from "@/lib/keybinds";
import { startFixedLoop } from "@/games/flight/engine/loop";
import { text } from "@/games/core/i18n";
import { fetchSurviveProgress } from "@/lib/client-queries";
import { createDprGovernor } from "../core/quality";
import { PauseButton, PauseMenu, usePause } from "../core/pause";
import { CoachHand, useCoachSteps } from "../core/coach";
import type { GameComponentProps } from "../core/types";

const END_DELAY = 1.6;
/** 카운트다운이 끝나고 GO! 를 보여 주는 시간 */
const GO_SEC = 0.7;
/** 첫 조작 안내 — 3·2·1 부터 조이스틱 끌기 손가락을 이만큼(ms) 보여 준다. GO! 뒤에 움직이면 바로 사라진다 */
const COACH_MS = [7000] as const;

export function SurviveGame({ onEnd }: GameComponentProps) {
  const [theme, setTheme] = useState<ThemeId>("dark");
  const [best, setBest] = useState(0);
  const [started, setStarted] = useState(false);

  // 효과음은 시작 화면에서 미리 받아 둔다. 게임을 떠나면 음악을 끈다
  useEffect(() => {
    preloadSurviveAudio();
    return () => setBgm("off");
  }, []);

  useEffect(() => {
    fetchSurviveProgress()
      .then((p) => {
        setBest(p.stage);
        setTheme(p.theme);
      })
      .catch(() => undefined);
  }, []);

  if (!started) return <StartScreen theme={theme} best={best} onTheme={setTheme} onStart={() => setStarted(true)} />;
  return <SurviveRun theme={theme} onEnd={onEnd} />;
}

/* ── 시작 화면 (§1 — 스테이지 선택 없음) ─────────────────────── */

function StartScreen({
  theme,
  best,
  onTheme,
  onStart,
}: {
  theme: ThemeId;
  best: number;
  onTheme: (t: ThemeId) => void;
  onStart: () => void;
}) {
  const t = useTranslations("hud.survive.ui");
  const tg = useTranslations("hud.survive.guide");
  const keyMap = useKeymapState("survive");
  const th = THEMES[theme];
  const [guide, setGuide] = useState(false);
  const closeGuide = useCallback(() => setGuide(false), []);

  useEffect(() => setBgm("lobby"), []);

  // PC: Enter / Space 로 바로 시작 (가이드를 보는 동안은 막는다)
  useEffect(() => {
    if (guide) return;
    const onKey = (e: KeyboardEvent) => {
      // 버튼에 포커스가 있으면 그 버튼의 클릭에 맡긴다 (가이드·테마 버튼에서 Enter 가 시작이 되지 않게)
      if (e.target instanceof HTMLElement && e.target.closest("button")) return;
      if (e.key === "Enter" || e.key === " ") onStart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStart, guide]);

  if (guide) return <Guide theme={th} onClose={closeGuide} />;

  return (
    <div className="grid h-full place-items-center overflow-y-auto p-5" style={{ background: th.bg }}>
      <div className="w-full max-w-md text-center">
        {/* 게임 로고 (사용자 제공 — public/assets/logos) */}
        <GameLogo game="survive" alt={t("title")} className="mx-auto h-40 w-full" />
        <p className="mt-1 text-sm" style={{ color: th.dim }}>
          {t("tagline")}
        </p>
        {best > 0 && (
          <p className="num mt-2 text-xs font-bold" style={{ color: th.accent }}>
            {t("best", { stage: best })}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onStart}
            className="inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-card text-lg font-black transition-transform active:scale-95"
            style={{ background: th.accent, color: th.bg, boxShadow: th.glow ? `0 0 28px ${th.accent}88` : "none" }}
          >
            <Play className="size-5" />
            {t("start")}
          </button>
          <button
            type="button"
            onClick={() => setGuide(true)}
            className="inline-flex min-h-14 shrink-0 items-center justify-center gap-1.5 rounded-card px-4 text-sm font-black transition-transform active:scale-95"
            style={{ background: th.surface, color: th.text, border: `1.5px solid ${th.accent}88` }}
          >
            <BookOpen className="size-4" style={{ color: th.accent }} />
            {tg("open")}
          </button>
        </div>

        <p className="mt-5 text-xs font-bold" style={{ color: th.dim }}>
          {t("theme")}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(["dark", "light"] as ThemeId[]).map((id) => {
            const x = THEMES[id];
            const on = id === theme;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTheme(id)}
                aria-pressed={on}
                className="flex min-h-11 items-center justify-center gap-2 rounded-tile border px-3 text-sm font-bold"
                style={{ background: x.surface, color: x.text, borderColor: on ? th.accent : `${x.dim}55`, borderWidth: on ? 2 : 1 }}
              >
                <span
                  className="size-3 rounded-full"
                  style={{ background: x.player, boxShadow: x.glow ? `0 0 8px ${x.player}` : "none" }}
                />
                {id === "dark" ? t("themeDark") : t("themeLight")}
              </button>
            );
          })}
        </div>

        <p className="mt-5 text-[11px]" style={{ color: th.dim }}>
          {t("controls", {
            move: (["up", "left", "down", "right"] as const).map((a) => primaryLabel(keyMap, a)).join(""),
          })}
        </p>
        <p className="mt-1 text-[11px]" style={{ color: th.dim }}>
          {t("bosses")}
        </p>
      </div>
    </div>
  );
}

/* ── 런 ─────────────────────────────────────────────────────── */

function SurviveRun({ theme, onEnd }: { theme: ThemeId; onEnd: GameComponentProps["onEnd"] }) {
  const tr = useTranslations("hud.survive");
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runRef = useRef<Run | null>(null);
  const inputRef = useRef<Input>({ mx: 0, my: 0 });
  const endedRef = useRef(false);
  const overAtRef = useRef(0);
  const portraitRef = useRef(false);
  const loopRef = useRef<{ setPaused: (p: boolean) => void } | null>(null);
  // 일시정지 — 공통 메뉴(games/core/pause.tsx), 한 판에 1분까지. 세로 안내 동안은 시간을 깎지 않는다
  const pause = usePause(
    (frozen) => loopRef.current?.setPaused(frozen),
    () => portraitRef.current,
  );
  const { toggle: togglePause, autoPause } = pause;
  const keysRef = useKeymap("survive");

  const [hud, setHud] = useState<HudState | null>(null);
  const [cards, setCards] = useState<Run["cards"]>([]);
  const [rerolls, setRerolls] = useState<number>(CFG.card.reroll);
  const [skips, setSkips] = useState<number>(CFG.card.skip);
  const [portrait, setPortrait] = useState(false);
  /** 3·2·1 → 0(GO!) → -1(끝) */
  const [count, setCount] = useState<number>(CFG.run.countdownSec);

  const t = THEMES[theme];

  // 첫 조작 안내 손가락 — 카드 선택·일시정지·세로 안내 동안은 시간이 흐르지 않는다
  const coachLive = !portrait && cards.length === 0 && !pause.open && !runRef.current?.world.over;
  const coach = useCoachSteps(COACH_MS, coachLive);
  const countRef = useRef(count);
  countRef.current = count;
  const { stop: stopCoach } = coach;
  const onStick = useCallback(
    (v: { x: number; y: number }) => {
      inputRef.current = { mx: v.x, my: v.y };
      // 카운트다운 중에 만져 본 것은 넘어가고, 실제로 움직이기 시작하면 안내를 거둔다
      if ((v.x || v.y) && countRef.current < 0) stopCoach();
    },
    [stopCoach],
  );

  const snapshot = useCallback((run: Run): HudState => {
    const w = run.world;
    const b = w.boss;
    const dur = stageDuration(w);
    return {
      hp: w.player.hp,
      maxHp: w.player.maxHp,
      elapsed: w.t,
      stage: w.stage,
      stageLeft: dur > 0 ? Math.max(0, dur - w.stageT) : null,
      endless: w.info.endless,
      kills: w.run.kills,
      level: w.player.level,
      xp: w.player.xp,
      xpNext: w.player.xpNext,
      actives: w.actives.map((s) => ({
        emoji: s.evo ? EVOLUTIONS[s.evo].emoji : ACTIVES[s.id].emoji,
        lv: s.lv,
        evolved: s.evo !== null,
      })),
      passives: w.passives.map((p) => ({ emoji: PASSIVES[p.id].emoji, lv: p.lv })),
      boss:
        b.active && b.kind && b.idx >= 0
          ? {
              kind: b.kind,
              hp: w.enemies.hp[b.idx],
              maxHp: b.maxHp,
              timeLeft: b.kind === "chrono" ? chronoTimeLeft(w) : null,
              rage: b.kind === "chrono" ? b.chRage / CFG.chrono.rage.max : null,
              fuse: b.kind === "chrono" ? bombFuse(w) : null,
              gauge: b.kind === "nona" ? Math.min(1, b.nonaGauge / CFG.nona.gaugeMax) : null,
            }
          : null,
      // 카운트다운 동안은 숫자만 — 단계 배너는 끝난 뒤에 보인다
      banner: w.banner && w.countdown <= 0 ? { m: w.banner.m, sub: w.banner.sub } : null,
      log: visibleLog(w),
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const device: "mobile" | "desktop" = navigator.maxTouchPoints > 0 ? "mobile" : "desktop";
    resetSprites();
    preloadOwl();
    preloadMobs();
    preloadObstacles();
    // 시작 전 3·2·1 — 그동안 월드는 멈추고 부엉이 발밑에 마법진이 돈다
    const run = createRun(Date.now(), theme, reduced, CFG.run.countdownSec);
    runRef.current = run;
    endedRef.current = false;
    overAtRef.current = 0;

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
      // 가로 고정 960×540 — 넘치는 쪽은 레터박스 (세로면 회전 안내가 뜬다)
      scale = Math.min(cw / CFG.view.w, ch / CFG.view.h);
      offX = (cw - CFG.view.w * scale) / 2;
      offY = (ch - CFG.view.h * scale) / 2;
      portraitRef.current = ch > cw * 1.05;
      setPortrait(portraitRef.current);
    };
    fit();
    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", fit);

    // 저사양 감지 (§14)
    let fpsAcc = 0;
    let fpsFrames = 0;
    let lowSec = 0;
    let last = performance.now();
    let cardsOpen = false;

    const loop = startFixedLoop(
      (dt) => {
        if (portraitRef.current) return; // 세로면 정지 (§2)
        update(run, dt, inputRef.current);
        if (run.world.over && !endedRef.current) {
          overAtRef.current += dt;
          if (overAtRef.current >= END_DELAY) {
            endedRef.current = true;
            loop.stop();
            rollOwlEnergy(run.world);
            onEnd(rawScore(run.world), buildMeta(run.world, device));
          }
        }
      },
      () => {
        const now = performance.now();
        const frameMs = now - last;
        last = now;
        if (quality.frame(now)) fit();
        fpsAcc += frameMs;
        fpsFrames++;
        if (fpsFrames >= 30) {
          const fps = 1000 / (fpsAcc / fpsFrames);
          fpsAcc = 0;
          fpsFrames = 0;
          if (fps < CFG.perf.fpsFloor) {
            lowSec += 0.5;
            if (lowSec >= CFG.perf.lowFpsSec) run.world.lowSpec = true;
          } else lowSec = 0;
        }

        // 효과음 신호 — 엔진은 비트만 세우고 소리는 여기서 낸다 (audio.ts)
        const w = run.world;
        if (w.cues) {
          playCues(w.cues);
          w.cues = 0;
        }
        if (run.cards.length > 0 !== cardsOpen) {
          cardsOpen = run.cards.length > 0;
          if (cardsOpen) playSound("cardOpen");
        }
        // 배경음악 — 보스가 있으면 보스 곡, 죽으면 끈다
        setBgm(w.over ? "off" : w.boss.active ? "boss" : "run", w.boss.kind);

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = THEMES[theme].bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr * scale, 0, 0, dpr * scale, offX * dpr, offY * dpr);
        render(ctx, run.world);
      },
    );

    loopRef.current = loop;

    // ⏸ 키 · 탭이 가려지면 자동 일시정지 (남은 시간이 있을 때만)
    const onKey = (e: KeyboardEvent) => {
      if (actionOf(keysRef.current, e.code) !== "pause") return;
      e.preventDefault();
      if (!e.repeat && !run.world.over) togglePause();
    };
    const onVisibility = () => {
      if (document.hidden && !run.world.over) autoPause();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVisibility);

    const hudTimer = setInterval(() => {
      setHud(snapshot(run));
      setCount(run.world.countdown > 0 ? Math.ceil(run.world.countdown) : run.world.t < GO_SEC ? 0 : -1);
      setCards(run.cards);
      setRerolls(run.rerolls);
      setSkips(run.skips);
    }, 80);

    return () => {
      endedRef.current = true;
      loop.stop();
      loopRef.current = null;
      clearInterval(hudTimer);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", fit);
      window.removeEventListener("orientationchange", fit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, onEnd]);

  const run = runRef.current;

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full touch-none select-none overflow-hidden"
      style={{ background: t.bg }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" aria-label={tr("ui.canvas")} />
      {hud && <Hud hud={hud} theme={t} action={!run?.world.over && <PauseButton ctl={pause} className="-my-1 -mr-1.5 shrink-0" />} />}
      <Joystick onChange={onStick} />
      {coachLive && coach.step === 0 && (
        <CoachHand at={{ x: "22%", y: "60%" }} gesture="joystick" label={tr("coach.move")} />
      )}

      {run && cards.length > 0 && (
        <Cards
          cards={cards}
          level={run.world.player.level}
          rerolls={rerolls}
          skips={skips}
          theme={t}
          onPick={(i) => {
            playSound("cardPick");
            chooseCard(run, i);
            setCards([...run.cards]);
          }}
          onReroll={() => {
            if (run.rerolls > 0) playSound("reroll");
            rerollCards(run);
            setCards([...run.cards]);
            setRerolls(run.rerolls);
          }}
          onSkip={() => {
            if (run.skips > 0) playSound("skip");
            skipCards(run);
            setCards([...run.cards]);
            setSkips(run.skips);
          }}
        />
      )}

      {/* 세로 화면 안내 (§2) */}
      {/* 시작 3·2·1 */}
      {count >= 0 && !portrait && (
        <div className="pointer-events-none absolute inset-x-0 top-[14%] z-10 grid place-items-center">
          <p
            key={count}
            className="num animate-pop select-none text-8xl font-black"
            style={{
              color: t.glow ? "#FFFFFF" : count === 0 ? t.xp : t.mine,
              textShadow: t.glow
                ? `0 0 12px ${count === 0 ? t.xp : t.mine}, 0 0 36px ${count === 0 ? t.xp : t.mine}`
                : `0 2px 0 ${t.surface}`,
            }}
          >
            {count === 0 ? tr("ui.go") : count}
          </p>
        </div>
      )}

      {portrait && (
        <div className="absolute inset-0 z-30 grid place-items-center p-6 text-center" style={{ background: `${t.bg}f2` }}>
          <div>
            <p className="text-5xl">📱</p>
            <p className="mt-3 text-xl font-black" style={{ color: t.text }}>
              {tr("ui.rotate")}
            </p>
            <p className="mt-1 text-sm" style={{ color: t.dim }}>
              {tr("ui.rotateSub")}
            </p>
          </div>
        </div>
      )}

      {run?.world.over && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center" style={{ background: `${t.bg}99` }}>
          <div className="text-center">
            <p className="animate-pop text-3xl font-black" style={{ color: t.danger }}>
              {tr("ui.over")}
            </p>
            <p className="num mt-1 text-lg font-black" style={{ color: t.accent }}>
              {tr("ui.reached", { stage: run.world.stage })}
            </p>
            {run.world.overReason && (
              <p className="mt-1 text-sm" style={{ color: t.dim }}>
                {text(tr, run.world.overReason)}
              </p>
            )}
          </div>
        </div>
      )}

      {run && isPaused(run) && <span className="sr-only">{tr("ui.paused")}</span>}
      {!portrait && !run?.world.over && <PauseMenu ctl={pause} />}

      <p
        className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px]"
        style={{ color: `${t.dim}99` }}
      >
        <Play className="mr-1 inline size-2.5" />
        {tr("ui.hint")}
      </p>
    </div>
  );
}
