"use client";

// 🛡️ 아울 서바이버즈 — 난이도 선택 → 3분 런 → 결과 제출
// 게임 로직은 engine/ 안에만 있다 (기획서 §12 구조).
import { useCallback, useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { CFG, stageById, type StageId } from "./config";
import { chooseCard, createRun, isPaused, rerollCards, skipCards, update, type Input, type Run } from "./engine/game";
import { PASSIVE_INFO } from "./engine/levelup";
import { render } from "./engine/render";
import { buildMeta, rawScore } from "./engine/score";
import { WEAPON_INFO } from "./engine/weapons";
import { Hud, type HudState } from "./ui/Hud";
import { Joystick } from "./ui/Joystick";
import { LevelUpCards } from "./ui/LevelUpCards";
import { startFixedLoop } from "@/games/flight/engine/loop";
import { cn } from "@/lib/cn";
import { fetchSurviveUnlock } from "@/lib/client-queries";
import { stageProgress } from "@/lib/stages";
import type { PassiveId } from "./types";
import type { GameComponentProps } from "../core/types";

const END_DELAY = 1.4;

export function SurviveGame({ onEnd }: GameComponentProps) {
  const [stage, setStage] = useState<StageId | null>(null);
  const [unlock, setUnlock] = useState(1);

  useEffect(() => {
    fetchSurviveUnlock().then(setUnlock).catch(() => setUnlock(1));
  }, []);

  if (stage === null) return <StageSelect unlock={unlock} onPick={setStage} />;
  return <SurviveRun stage={stage} onEnd={onEnd} />;
}

function StageSelect({ unlock, onPick }: { unlock: number; onPick: (s: StageId) => void }) {
  return (
    <div className="grid h-full place-items-center overflow-y-auto p-5">
      <div className="w-full max-w-lg">
        <p className="arcade text-center text-xs text-aqua">SELECT DIFFICULTY</p>
        <h1 className="mt-2 text-center text-2xl font-black">어디를 지킬까요?</h1>
        <p className="mt-1 text-center text-sm text-mute">위험할수록 점수 배율이 올라가요</p>
        <div className="mt-5 grid gap-3">
          {CFG.stages.map((s) => {
            const locked = s.id > unlock;
            return (
              <button
                key={s.id}
                type="button"
                disabled={locked}
                onClick={() => onPick(s.id as StageId)}
                className={cn(
                  "flex items-center gap-4 rounded-card border p-4 text-left transition-colors",
                  locked ? "border-line bg-night/40 opacity-60" : "border-line bg-panel/80 hover:border-neon/60",
                )}
              >
                <span className="text-4xl">{locked ? "🔒" : s.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-extrabold">{s.name}</span>
                  <span className="num block text-xs text-mute">
                    적 체력 {Math.round(s.hpMult * 100)}% · 점수 ×{s.scoreMult}
                  </span>
                  {locked && <span className="block text-xs text-alert">이전 난이도를 한 번 클리어하면 열려요</span>}
                </span>
                {locked && <Lock className="size-4 text-dim" />}
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-center text-xs text-dim">
          한 판 {CFG.runSec}초 · 난이도는 {CFG.runSec / 12}초마다 한 단계씩 올라갑니다 (총 15단계)
        </p>
      </div>
    </div>
  );
}

function SurviveRun({ stage, onEnd }: { stage: StageId; onEnd: GameComponentProps["onEnd"] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runRef = useRef<Run | null>(null);
  const inputRef = useRef<Input>({ mx: 0, my: 0 });
  const endedRef = useRef(false);
  const overAtRef = useRef(0);

  const [hud, setHud] = useState<HudState | null>(null);
  const [cards, setCards] = useState<Run["cards"]>([]);
  const [rerolls, setRerolls] = useState<number>(CFG.levelup.rerolls);

  const snapshot = useCallback((run: Run): HudState => {
    const w = run.world;
    return {
      hp: w.player.hp,
      maxHp: w.player.maxHp,
      timeLeft: CFG.runSec - w.t,
      zone: w.zone,
      stage15: w.stage15,
      stageProgress: stageProgress(w.t / CFG.runSec),
      level: w.player.level,
      xp: w.player.xp,
      xpNext: w.player.xpNext,
      kills: w.run.kills,
      score: rawScore(w),
      weapons: w.weapons.map((weapon) => ({
        id: weapon.id,
        level: weapon.level,
        emoji: WEAPON_INFO[weapon.id].emoji,
        evolved: weapon.evolved !== null,
      })),
      passives: (Object.keys(w.passives) as PassiveId[])
        .filter((id) => (w.passives[id] ?? 0) > 0)
        .map((id) => ({ id, level: w.passives[id] ?? 0, emoji: PASSIVE_INFO[id].emoji })),
      banner: w.banner ? { text: w.banner.text, sub: w.banner.sub } : null,
      rerolls: run.rerolls,
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const run = createRun(Date.now(), stage);
    runRef.current = run;
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
      // 세로 화면에서 min(=레터박스)으로 맞추면 놀이터가 가운데 띠만 남는다.
      // 카메라가 플레이어를 따라다니고 월드에 경계가 없으니, 화면을 꽉 채우고 넘치는 쪽을 잘라낸다.
      // (항상 960×540 안쪽만 보이므로 스폰 링 620px 밖에서 적이 나타나는 규칙도 그대로다)
      scale = Math.max(cw / CFG.view.w, ch / CFG.view.h);
      offX = (cw - CFG.view.w * scale) / 2;
      offY = (ch - CFG.view.h * scale) / 2;
    };
    fit();
    window.addEventListener("resize", fit);

    // 저사양 감지 (§12)
    let fpsAcc = 0;
    let fpsFrames = 0;
    let lowSec = 0;
    let last = performance.now();

    const loop = startFixedLoop(
      (dt) => {
        update(run, dt, inputRef.current);
        if (run.world.over && !endedRef.current) {
          overAtRef.current += dt;
          if (overAtRef.current >= END_DELAY) {
            endedRef.current = true;
            loop.stop();
            onEnd(rawScore(run.world), { ...buildMeta(run.world), stage_max: run.world.stageMax });
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
          if (fps < CFG.perf.lowFpsThreshold) {
            lowSec += 0.5;
            if (lowSec >= CFG.perf.lowFpsSec) run.world.lowSpec = true;
          } else lowSec = 0;
        }

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#06090f";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr * scale, 0, 0, dpr * scale, offX * dpr, offY * dpr);
        render(ctx, run.world, reduced);
      },
    );

    const hudTimer = setInterval(() => {
      setHud(snapshot(run));
      setCards(run.cards);
      setRerolls(run.rerolls);
    }, 80);

    return () => {
      endedRef.current = true;
      loop.stop();
      clearInterval(hudTimer);
      window.removeEventListener("resize", fit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, onEnd]);

  const run = runRef.current;

  return (
    <div ref={wrapRef} className="relative h-full w-full touch-none select-none overflow-hidden bg-[#06090f]">
      <canvas ref={canvasRef} className="absolute inset-0" aria-label="아울 서바이버즈 게임 화면" />
      {hud && <Hud hud={hud} />}
      <Joystick onChange={(v) => (inputRef.current = { mx: v.x, my: v.y })} />
      {run && cards.length > 0 && (
        <LevelUpCards
          cards={cards}
          level={run.world.player.level}
          rerolls={rerolls}
          onPick={(i) => {
            chooseCard(run, i);
            setCards([]);
          }}
          onReroll={() => {
            rerollCards(run);
            setCards([...run.cards]);
            setRerolls(run.rerolls);
          }}
          onSkip={() => {
            skipCards(run);
            setCards([]);
          }}
        />
      )}
      {run?.world.over && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-night/60">
          <p className={cn("animate-pop text-3xl font-black", run.world.cleared ? "text-ok" : "text-alert")}>
            {run.world.cleared ? "🛡️ SYSTEM SECURED" : "💀 시스템 침해"}
          </p>
        </div>
      )}
      {run && isPaused(run) && <span className="sr-only">레벨업 카드 선택 중 — 게임 정지</span>}
      <p className="pointer-events-none absolute bottom-3 right-3 text-[10px] text-dim">
        {stageById(stage).name} · 이동만 하면 공격은 자동
      </p>
    </div>
  );
}
