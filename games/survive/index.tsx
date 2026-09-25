"use client";

// 🦉 아울 서바이버즈 v2 — 테마 선택 → 스테이지 선택 → 런 (기획서 §14)

import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, Play } from "lucide-react";
import { CFG } from "./config";
import { STAGES, stageInfo } from "./data/stages";
import { chooseCard, createRun, isPaused, rerollCards, skipCards, update, type Input, type Run } from "./engine/game";
import { ACTIVES, EVOLUTIONS, PASSIVES } from "./data/skills";
import { render, resetSprites } from "./engine/render";
import { buildMeta, rawScore, rollOwlEnergy } from "./engine/score";
import { visibleLog } from "./engine/world";
import { THEMES, stageAccent, type ThemeId } from "./theme";
import { Cards } from "./ui/Cards";
import { Hud, type HudState } from "./ui/Hud";
import { Joystick } from "./ui/Joystick";
import { startFixedLoop } from "@/games/flight/engine/loop";
import { cn } from "@/lib/cn";
import { fetchSurviveProgress } from "@/lib/client-queries";
import type { GameComponentProps } from "../core/types";

const END_DELAY = 1.6;

export function SurviveGame({ onEnd }: GameComponentProps) {
  const [theme, setTheme] = useState<ThemeId | null>(null);
  const [stage, setStage] = useState<number | null>(null);
  const [unlocked, setUnlocked] = useState(1);
  const [saved, setSaved] = useState<ThemeId>("dark");

  useEffect(() => {
    fetchSurviveProgress()
      .then((p) => {
        setUnlocked(Math.max(1, p.stage + 1));
        setSaved(p.theme);
      })
      .catch(() => undefined);
  }, []);

  if (theme === null) return <ThemeSelect saved={saved} onPick={setTheme} />;
  if (stage === null) return <StageSelect theme={theme} unlocked={unlocked} onPick={setStage} />;
  return <SurviveRun theme={theme} stage={stage} onEnd={onEnd} />;
}

/* ── 테마 선택 (§10.1) ──────────────────────────────────────── */

function ThemeSelect({ saved, onPick }: { saved: ThemeId; onPick: (t: ThemeId) => void }) {
  return (
    <div className="grid h-full place-items-center overflow-y-auto p-5">
      <div className="w-full max-w-md">
        <p className="arcade text-center text-xs text-aqua">SELECT THEME</p>
        <h1 className="mt-2 text-center text-2xl font-black">어떤 화면으로 할까요?</h1>
        <p className="mt-1 text-center text-sm text-mute">밝은 곳이면 라이트가 잘 보여요</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          {(["dark", "light"] as ThemeId[]).map((id) => {
            const t = THEMES[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => onPick(id)}
                className="rounded-card border p-3 text-left transition-transform active:scale-95"
                style={{ background: t.bg, borderColor: id === saved ? t.accent : `${t.dim}66` }}
              >
                <div className="flex h-20 items-center justify-center gap-2 rounded-tile" style={{ background: t.surface }}>
                  <span
                    className="size-5 rounded-full"
                    style={{ background: t.player, boxShadow: t.glow ? `0 0 12px ${t.player}` : "none" }}
                  />
                  <span className="size-4 rotate-45" style={{ background: t.enemy }} />
                  <span className="size-3 rounded-full" style={{ background: t.xp }} />
                </div>
                <p className="mt-2 font-extrabold" style={{ color: t.text }}>
                  {id === "dark" ? "🌙 다크 (네온)" : "☀️ 라이트"}
                </p>
                <p className="text-[11px]" style={{ color: t.dim }}>
                  {id === "dark" ? "발광 효과로 또렷하게" : "외곽선으로 또렷하게"}
                </p>
                {id === saved && (
                  <p className="num mt-1 text-[10px]" style={{ color: t.accent }}>
                    지난번 선택
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── 스테이지 선택 (§3) ─────────────────────────────────────── */

function StageSelect({ theme, unlocked, onPick }: { theme: ThemeId; unlocked: number; onPick: (s: number) => void }) {
  const t = THEMES[theme];
  const count = Math.max(CFG.stage.count, Math.min(unlocked, CFG.stage.count + 10));
  const list = Array.from({ length: count }, (_, i) => i + 1);

  return (
    <div className="h-full overflow-y-auto p-4" style={{ background: t.bg }}>
      <p className="arcade text-center text-xs" style={{ color: t.accent }}>
        SELECT STAGE
      </p>
      <h1 className="mb-1 mt-2 text-center text-2xl font-black" style={{ color: t.text }}>
        어디를 지킬까요?
      </h1>
      <p className="mb-4 text-center text-sm" style={{ color: t.dim }}>
        보스를 잡아야 다음 스테이지가 열려요
      </p>

      <div className="mx-auto grid max-w-3xl grid-cols-2 gap-2 sm:grid-cols-3">
        {list.map((s) => {
          const info = s <= CFG.stage.count ? STAGES[s - 1] : stageInfo(s);
          const locked = s > unlocked;
          const accent = stageAccent(s);
          return (
            <button
              key={s}
              type="button"
              disabled={locked}
              onClick={() => onPick(s)}
              className={cn("rounded-tile border p-3 text-left transition-transform", !locked && "active:scale-95")}
              style={{
                background: t.surface,
                borderColor: locked ? `${t.dim}33` : `${accent}88`,
                opacity: locked ? 0.45 : 1,
              }}
            >
              <div className="flex items-center justify-between">
                <span className="num text-[10px] font-bold" style={{ color: accent }}>
                  STAGE {s}
                </span>
                {locked && <Lock className="size-3" style={{ color: t.dim }} />}
              </div>
              <p className="mt-0.5 truncate text-sm font-extrabold" style={{ color: t.text }}>
                {info.name}
              </p>
              <p className="num truncate text-[11px]" style={{ color: t.dim }}>
                {info.boss.emoji} {info.boss.name}
              </p>
              <p className="num mt-1 text-[10px]" style={{ color: t.dim }}>
                체력 ×{(1 + CFG.stage.hpPerStage * (s - 1)).toFixed(2)} · 점수 ×
                {Math.min(CFG.stage.multCap, 1 + CFG.stage.multPerStage * (s - 1)).toFixed(2)}
              </p>
            </button>
          );
        })}
      </div>

      {unlocked > CFG.stage.count && (
        <p className="mt-4 text-center text-xs" style={{ color: t.accent }}>
          ♾️ 무한 스테이지 해금 — {unlocked}단계까지 열렸어요
        </p>
      )}
    </div>
  );
}

/* ── 런 ─────────────────────────────────────────────────────── */

function SurviveRun({ theme, stage, onEnd }: { theme: ThemeId; stage: number; onEnd: GameComponentProps["onEnd"] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runRef = useRef<Run | null>(null);
  const inputRef = useRef<Input>({ mx: 0, my: 0 });
  const endedRef = useRef(false);
  const overAtRef = useRef(0);
  const portraitRef = useRef(false);

  const [hud, setHud] = useState<HudState | null>(null);
  const [cards, setCards] = useState<Run["cards"]>([]);
  const [rerolls, setRerolls] = useState<number>(CFG.card.reroll);
  const [skips, setSkips] = useState<number>(CFG.card.skip);
  const [portrait, setPortrait] = useState(false);

  const t = THEMES[theme];

  const snapshot = useCallback((run: Run): HudState => {
    const w = run.world;
    const bossIdx = w.boss.active ? w.boss.idx : -1;
    return {
      hp: w.player.hp,
      maxHp: w.player.maxHp,
      elapsed: w.t,
      stage: w.stage,
      stageName: w.info.name,
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
        bossIdx >= 0
          ? {
              name: w.info.boss.name,
              emoji: w.info.boss.emoji,
              hp: w.enemies.hp[bossIdx],
              maxHp: w.boss.maxHp,
              phase: w.boss.phase,
            }
          : null,
      banner: w.banner ? { text: w.banner.text, sub: w.banner.sub } : null,
      log: visibleLog(w),
      rule: w.info.rule,
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
    const run = createRun(Date.now(), stage, theme, reduced);
    runRef.current = run;
    endedRef.current = false;
    overAtRef.current = 0;

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

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = THEMES[theme].bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr * scale, 0, 0, dpr * scale, offX * dpr, offY * dpr);
        render(ctx, run.world);
      },
    );

    const hudTimer = setInterval(() => {
      setHud(snapshot(run));
      setCards(run.cards);
      setRerolls(run.rerolls);
      setSkips(run.skips);
    }, 80);

    return () => {
      endedRef.current = true;
      loop.stop();
      clearInterval(hudTimer);
      window.removeEventListener("resize", fit);
      window.removeEventListener("orientationchange", fit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, theme, onEnd]);

  const run = runRef.current;

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full touch-none select-none overflow-hidden"
      style={{ background: t.bg }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" aria-label="아울 서바이버즈 게임 화면" />
      {hud && <Hud hud={hud} theme={t} />}
      <Joystick onChange={(v) => (inputRef.current = { mx: v.x, my: v.y })} />

      {run && cards.length > 0 && (
        <Cards
          cards={cards}
          level={run.world.player.level}
          rerolls={rerolls}
          skips={skips}
          theme={t}
          onPick={(i) => {
            chooseCard(run, i);
            setCards([...run.cards]);
          }}
          onReroll={() => {
            rerollCards(run);
            setCards([...run.cards]);
            setRerolls(run.rerolls);
          }}
          onSkip={() => {
            skipCards(run);
            setCards([...run.cards]);
            setSkips(run.skips);
          }}
        />
      )}

      {/* 세로 화면 안내 (§2) */}
      {portrait && (
        <div className="absolute inset-0 z-30 grid place-items-center p-6 text-center" style={{ background: `${t.bg}f2` }}>
          <div>
            <p className="text-5xl">📱</p>
            <p className="mt-3 text-xl font-black" style={{ color: t.text }}>
              가로로 돌려주세요
            </p>
            <p className="mt-1 text-sm" style={{ color: t.dim }}>
              아울 서바이버즈는 가로 화면 전용이에요 (게임은 멈춰 있어요)
            </p>
          </div>
        </div>
      )}

      {run?.world.over && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center" style={{ background: `${t.bg}99` }}>
          <div className="text-center">
            <p className="animate-pop text-3xl font-black" style={{ color: run.world.cleared ? t.hp : t.danger }}>
              {run.world.cleared ? `STAGE ${run.world.stage} CLEAR ✅` : "☠️ 시스템 침해"}
            </p>
            {!run.world.cleared && run.world.overReason && (
              <p className="mt-1 text-sm" style={{ color: t.dim }}>
                {run.world.overReason}
              </p>
            )}
          </div>
        </div>
      )}

      {run && isPaused(run) && <span className="sr-only">레벨업 카드 선택 중 — 게임 정지</span>}

      <p
        className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px]"
        style={{ color: `${t.dim}99` }}
      >
        <Play className="mr-1 inline size-2.5" />
        이동만 하면 공격은 자동
      </p>
    </div>
  );
}
