"use client";

// 🚀 아울스페이스 — 테마 선택 → 스테이지 선택 → 런 (기획서 §13)

import { useCallback, useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { CFG, chipNeed } from "./config";
import { STAGES, stageInfo } from "./data/stages";
import { MAINS, PASSIVES, SUBS } from "./data/skills";
import { chooseCard, createRun, isPaused, update, type Input, type Run } from "./engine/game";
import { render, resetSprites, resetStars } from "./engine/render";
import { buildMeta, rawScore, rollOwlEnergy } from "./engine/score";
import { visibleLog } from "./engine/world";
import { stageTint, THEMES, type ThemeId } from "./theme";
import { Cards } from "./ui/Cards";
import { Hud, type HudState } from "./ui/Hud";
import { startFixedLoop } from "@/games/flight/engine/loop";
import { cn } from "@/lib/cn";
import { fetchSpaceProgress } from "@/lib/client-queries";
import type { GameComponentProps } from "../core/types";

const END_DELAY = 1.8;

export function SpaceGame({ onEnd }: GameComponentProps) {
  const [theme, setTheme] = useState<ThemeId | null>(null);
  const [stage, setStage] = useState<number | null>(null);
  const [unlocked, setUnlocked] = useState(1);
  const [saved, setSaved] = useState<ThemeId>("dark");

  useEffect(() => {
    fetchSpaceProgress()
      .then((p) => {
        setUnlocked(Math.max(1, p.stage + 1));
        setSaved(p.theme);
      })
      .catch(() => undefined);
  }, []);

  if (theme === null) return <ThemeSelect saved={saved} onPick={setTheme} />;
  if (stage === null) return <StageSelect theme={theme} unlocked={unlocked} onPick={setStage} />;
  return <SpaceRun theme={theme} stage={stage} onEnd={onEnd} />;
}

/* ── 테마 선택 (§9) ─────────────────────────────────────────── */

function ThemeSelect({ saved, onPick }: { saved: ThemeId; onPick: (t: ThemeId) => void }) {
  return (
    <div className="grid h-full place-items-center overflow-y-auto p-5">
      <div className="w-full max-w-md">
        <p className="arcade text-center text-xs text-aqua">SELECT THEME</p>
        <h1 className="mt-2 text-center text-2xl font-black">어떤 화면으로 할까요?</h1>
        <p className="mt-1 text-center text-sm text-mute">적 탄은 어느 쪽이든 또렷하게 보여요</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          {(["dark", "light"] as ThemeId[]).map((id) => {
            const t = THEMES[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => onPick(id)}
                className="rounded-card border p-3 text-left transition-transform active:scale-95"
                style={{ background: t.bg, borderColor: id === saved ? t.player : `${t.dim}66` }}
              >
                <div className="flex h-20 items-center justify-center gap-3 rounded-tile" style={{ background: t.surface }}>
                  <span
                    className="h-5 w-1.5 rounded-full"
                    style={{ background: t.myBullet, boxShadow: t.glow ? `0 0 10px ${t.myBullet}` : "none" }}
                  />
                  <span
                    className="size-4 rounded-full"
                    style={{ background: t.enemyBullet, border: `2px solid ${t.enemyBulletEdge}` }}
                  />
                  <span className="size-3 rotate-45" style={{ background: t.chip }} />
                </div>
                <p className="mt-2 font-extrabold" style={{ color: t.text }}>
                  {id === "dark" ? "🌙 다크 (네온)" : "☀️ 라이트"}
                </p>
                <p className="text-[11px]" style={{ color: t.dim }}>
                  {id === "dark" ? "발광으로 또렷하게" : "외곽선으로 또렷하게"}
                </p>
                {id === saved && (
                  <p className="num mt-1 text-[10px]" style={{ color: t.player }}>
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

/* ── 스테이지 선택 (§6) ─────────────────────────────────────── */

function StageSelect({ theme, unlocked, onPick }: { theme: ThemeId; unlocked: number; onPick: (s: number) => void }) {
  const t = THEMES[theme];
  const count = Math.max(CFG.stage.count, Math.min(unlocked, CFG.stage.count + 10));
  const list = Array.from({ length: count }, (_, i) => i + 1);

  return (
    <div className="h-full overflow-y-auto p-4" style={{ background: t.bg }}>
      <p className="arcade text-center text-xs" style={{ color: t.player }}>
        SELECT STAGE
      </p>
      <h1 className="mb-1 mt-2 text-center text-2xl font-black" style={{ color: t.text }}>
        어디로 출격할까요?
      </h1>
      <p className="mb-4 text-center text-sm" style={{ color: t.dim }}>
        보스를 잡아야 다음 구역이 열려요
      </p>

      <div className="mx-auto grid max-w-3xl grid-cols-2 gap-2 sm:grid-cols-3">
        {list.map((s) => {
          const info = s <= CFG.stage.count ? STAGES[s - 1] : stageInfo(s);
          const locked = s > unlocked;
          const tint = stageTint(s);
          return (
            <button
              key={s}
              type="button"
              disabled={locked}
              onClick={() => onPick(s)}
              className={cn("rounded-tile border p-3 text-left transition-transform", !locked && "active:scale-95")}
              style={{ background: t.surface, borderColor: locked ? `${t.dim}33` : `${tint}88`, opacity: locked ? 0.45 : 1 }}
            >
              <div className="flex items-center justify-between">
                <span className="num text-[10px] font-bold" style={{ color: tint }}>
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
    </div>
  );
}

/* ── 런 ─────────────────────────────────────────────────────── */

function SpaceRun({ theme, stage, onEnd }: { theme: ThemeId; stage: number; onEnd: GameComponentProps["onEnd"] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runRef = useRef<Run | null>(null);
  const inputRef = useRef<Input>({ mx: 0, my: 0, targetX: null, targetY: null, precise: false, bomb: false });
  const endedRef = useRef(false);
  const overAtRef = useRef(0);
  const landscapeRef = useRef(false);
  const viewRef = useRef({ scale: 1, offX: 0, offY: 0 });

  const [hud, setHud] = useState<HudState | null>(null);
  const [cards, setCards] = useState<Run["cards"]>([]);
  const [landscape, setLandscape] = useState(false);

  const t = THEMES[theme];

  const snapshot = useCallback((run: Run): HudState => {
    const w = run.world;
    const bossIdx = w.boss.active ? w.boss.idx : -1;
    return {
      lives: w.player.lives,
      maxLives: CFG.player.lives,
      bombs: w.player.bombs,
      maxBombs: w.stats.bombMax,
      stage: w.stage,
      stageName: w.info.name,
      graze: w.run.graze,
      kills: w.run.kills,
      elapsed: w.t,
      chipGauge: w.chipGauge,
      chipNeed: chipNeed(w.chipLevels),
      main: { emoji: MAINS[w.main.id].emoji, name: MAINS[w.main.id].name, lv: w.main.lv },
      subs: w.subs.map((s) => ({ emoji: SUBS[s.id].emoji, lv: s.lv })),
      passives: w.passives.map((p) => ({ emoji: PASSIVES[p.id].emoji, lv: p.lv })),
      boss:
        bossIdx >= 0
          ? {
              name: w.info.boss.name,
              emoji: w.info.boss.emoji,
              hp: w.enemies.hp[bossIdx],
              maxHp: w.boss.maxHp,
              phase: w.boss.phase,
              phases: w.info.boss.phases.length,
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
    resetStars(run.world.rand);
    runRef.current = run;
    endedRef.current = false;
    overAtRef.current = 0;

    let dpr = 1;
    const fit = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = wrap.clientWidth;
      const ch = wrap.clientHeight;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      const scale = Math.min(cw / CFG.screen.w, ch / CFG.screen.h);
      viewRef.current = {
        scale,
        offX: (cw - CFG.screen.w * scale) / 2,
        offY: (ch - CFG.screen.h * scale) / 2,
      };
      landscapeRef.current = cw > ch * 1.05;
      setLandscape(landscapeRef.current);
    };
    fit();
    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", fit);

    // 키보드 (PC) — WASD / Shift 정밀 / Space 봄
    const keys = new Set<string>();
    const sync = () => {
      const i = inputRef.current;
      i.mx = (keys.has("d") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("a") || keys.has("ArrowLeft") ? 1 : 0);
      i.my = (keys.has("s") || keys.has("ArrowDown") ? 1 : 0) - (keys.has("w") || keys.has("ArrowUp") ? 1 : 0);
      i.precise = keys.has("Shift");
      if (i.mx !== 0 || i.my !== 0) { i.targetX = null; i.targetY = null; }
    };
    const down = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Shift", " "].includes(k)) {
        e.preventDefault();
        if (k === " ") inputRef.current.bomb = true;
        else keys.add(k);
        sync();
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      keys.delete(k);
      sync();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);

    let fpsAcc = 0;
    let fpsFrames = 0;
    let lowSec = 0;
    let last = performance.now();

    const loop = startFixedLoop(
      (dt) => {
        if (landscapeRef.current) return; // 가로면 정지 (§14-8)
        update(run, dt, inputRef.current);
        inputRef.current.bomb = false;
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

        const v = viewRef.current;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = THEMES[theme].bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, v.offX * dpr, v.offY * dpr);
        render(ctx, run.world);
      },
    );

    const hudTimer = setInterval(() => {
      setHud(snapshot(run));
      setCards(run.cards);
    }, 80);

    return () => {
      endedRef.current = true;
      loop.stop();
      clearInterval(hudTimer);
      window.removeEventListener("resize", fit);
      window.removeEventListener("orientationchange", fit);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, theme, onEnd]);

  /** 드래그 — 손가락에서 위로 80px 띄운 지점을 따라간다 (§2) */
  const toWorld = (clientX: number, clientY: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return null;
    const rect = wrap.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: (clientX - rect.left - v.offX) / v.scale,
      y: (clientY - rect.top - v.offY) / v.scale + CFG.player.touchOffsetY,
    };
  };

  const onPointer = (e: React.PointerEvent) => {
    const at = toWorld(e.clientX, e.clientY);
    if (!at) return;
    const i = inputRef.current;
    i.targetX = at.x;
    i.targetY = at.y;
    i.mx = 0;
    i.my = 0;
  };

  const run = runRef.current;

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full touch-none select-none overflow-hidden"
      style={{ background: t.bg }}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        onPointer(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 0 && e.pointerType === "mouse") return;
        onPointer(e);
      }}
      onPointerUp={() => {
        inputRef.current.targetX = null;
        inputRef.current.targetY = null;
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" aria-label="아울스페이스 게임 화면" />
      {hud && <Hud hud={hud} theme={t} />}

      {/* 봄 버튼 (§2) */}
      <button
        type="button"
        onPointerDown={(e) => {
          e.stopPropagation();
          inputRef.current.bomb = true;
        }}
        className="absolute bottom-16 right-4 grid size-14 place-items-center rounded-full text-2xl active:scale-90"
        style={{ background: `${t.surface}dd`, border: `2px solid ${t.player}88`, color: t.text }}
        aria-label="봄 사용"
      >
        💣
      </button>

      {run && cards.length > 0 && (
        <Cards
          cards={cards}
          theme={t}
          onPick={(i) => {
            chooseCard(run, i);
            setCards([...run.cards]);
          }}
        />
      )}

      {/* 가로 화면 안내 (§14-8) */}
      {landscape && (
        <div className="absolute inset-0 z-30 grid place-items-center p-6 text-center" style={{ background: `${t.bg}f2` }}>
          <div>
            <p className="text-5xl">📱</p>
            <p className="mt-3 text-xl font-black" style={{ color: t.text }}>
              세로로 돌려주세요
            </p>
            <p className="mt-1 text-sm" style={{ color: t.dim }}>
              아울스페이스는 세로 화면 전용이에요 (게임은 멈춰 있어요)
            </p>
          </div>
        </div>
      )}

      {run?.world.over && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center" style={{ background: `${t.bg}99` }}>
          <div className="text-center">
            <p className="animate-pop text-3xl font-black" style={{ color: run.world.cleared ? t.chip : t.danger }}>
              {run.world.cleared ? `STAGE ${run.world.stage} CLEAR ✅` : "☠️ 격추"}
            </p>
            {!run.world.cleared && run.world.overReason && (
              <p className="mt-1 text-sm" style={{ color: t.dim }}>
                {run.world.overReason}
              </p>
            )}
          </div>
        </div>
      )}

      {run && isPaused(run) && <span className="sr-only">스킬 선택 중 — 게임 정지</span>}
    </div>
  );
}
