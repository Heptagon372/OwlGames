"use client";

// 🔌 아울 로직 (OWL LOGIC) — 배선은 고정, 빈 칸에 논리 게이트를 꽂아 진리표를 맞춘다.
// 화면은 SVG(회로)+DOM(표·트레이), 규칙·점수는 전부 engine/ 안에 있다 (기획서 §10·§12).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eraser, Lightbulb, SkipForward } from "lucide-react";
import { CFG } from "./config";
import { ARITY } from "./engine/gates";
import { generatePuzzle, makeRng, truthHash } from "./engine/generator";
import { canPlace, gradeRows, isSolved, remainingParts } from "./engine/judge";
import { buildMeta, comboMult, createRun, onHint, onSolve, onWrongSubmit, rawScore, tierFor } from "./engine/score";
import { CircuitBoard, SlotHint } from "./ui/CircuitBoard";
import { Hud } from "./ui/Hud";
import { PartTray } from "./ui/PartTray";
import { TruthTable } from "./ui/TruthTable";
import { startLoop } from "../core/loop";
import { cn } from "@/lib/cn";
import { stageFromRatio, stageProgress } from "@/lib/stages";
import type { GameComponentProps } from "../core/types";
import type { Gate, Placement, Puzzle } from "./types";

const SOLVE_FLASH_MS = 640;
/** 세션 시간 상한 여유 — 서버는 185초까지만 인정한다 (§7.3) */
const HARD_STOP_SEC = CFG.platform.maxSessionSec - 5;

type Flash = { points: number; time: number; optimal: boolean; overdrive: boolean };

export function LogicGame({ onEnd }: GameComponentProps) {
  const runRef = useRef(createRun());
  const rngRef = useRef<(() => number) | null>(null);
  if (!rngRef.current) rngRef.current = makeRng((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
  const rng = rngRef.current;

  const firstRef = useRef<Puzzle | null>(null);
  if (!firstRef.current) firstRef.current = generatePuzzle(1, rng, []);
  const first = firstRef.current;

  const recentRef = useRef<string[]>([]);
  const budgetRef = useRef<number>(CFG.time.base);
  const elapsedRef = useRef(0);
  const puzzleStartRef = useRef(0);
  const endedRef = useRef(false);
  const lockRef = useRef(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [puzzle, setPuzzle] = useState<Puzzle>(first);
  const [placement, setPlacement] = useState<Placement>(() => first.slots.map(() => null));
  const [bits, setBits] = useState<number[]>(() => first.inputs.map(() => 0));
  const [selected, setSelected] = useState<Gate | null>(null);
  const [hintText, setHintText] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [energyFound, setEnergyFound] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(CFG.time.base);
  const [, force] = useState(0);

  const run = runRef.current;

  const finish = useCallback(
    (left: number) => {
      if (endedRef.current) return;
      endedRef.current = true;
      const r = runRef.current;
      onEnd(rawScore(r, left), buildMeta(r, elapsedRef.current, left));
    },
    [onEnd],
  );

  // 시계 — 남은 시간은 budget(누적 허용치) − 실제 경과
  useEffect(() => {
    endedRef.current = false;
    recentRef.current = [truthHash(first.truth)];
    puzzleStartRef.current = performance.now();

    const loop = startLoop((_, elapsed) => {
      elapsedRef.current = elapsed;
      if (budgetRef.current - elapsed > CFG.time.max) budgetRef.current = elapsed + CFG.time.max;
      const left = budgetRef.current - elapsed;
      // 0.1초 단위로만 상태를 바꿔 프레임마다 리렌더하지 않게 한다
      const shown = Math.max(0, Math.round(left * 10) / 10);
      setTimeLeft((prev) => (prev === shown ? prev : shown));
      if (left <= 0) {
        loop.stop();
        finish(0);
      } else if (elapsed >= HARD_STOP_SEC) {
        loop.stop();
        finish(left);
      }
    });
    return () => {
      loop.stop();
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finish]);

  const loadPuzzle = useCallback(
    (nextTier: ReturnType<typeof tierFor>) => {
      const p = generatePuzzle(nextTier, rng, recentRef.current);
      recentRef.current.push(truthHash(p.truth));
      if (recentRef.current.length > 40) recentRef.current.shift();
      setPuzzle(p);
      setPlacement(p.slots.map(() => null));
      setBits(p.inputs.map(() => 0));
      setSelected(null);
      setHintText(null);
      setToast(null);
      puzzleStartRef.current = performance.now();
      lockRef.current = false;
    },
    [rng],
  );

  const solve = useCallback(
    (p: Puzzle, next: Placement) => {
      lockRef.current = true;
      const r = runRef.current;
      const res = onSolve(r, p, next, performance.now() - puzzleStartRef.current);
      budgetRef.current += res.timeGained;

      // 🦉 아울 에너지는 높은 티어에서 가끔 떨어진다 (서버 조건: tier_max ≥ 4)
      if (!r.owlEnergyFound && r.tierMax >= CFG.owlEnergy.minTier && rng() < CFG.owlEnergy.chance) {
        r.owlEnergyFound = true;
        setEnergyFound(true);
      }

      // 슬롯을 다 채워야만 풀리는 문제에서는 "최적화"가 늘 참이라 연출을 나누지 않는다
      const perfect = res.optimal && p.minGates < p.slots.length;
      setFlash({ points: res.points, time: res.timeGained, optimal: perfect, overdrive: res.overdrive });
      flashTimer.current = setTimeout(() => {
        setFlash(null);
        if (!endedRef.current) loadPuzzle(tierFor(r.solved));
      }, SOLVE_FLASH_MS);
    },
    [loadPuzzle, rng],
  );

  const apply = useCallback(
    (next: Placement) => {
      setPlacement(next);
      if (CFG.ui.autoSubmit && isSolved(puzzle, next)) solve(puzzle, next);
    },
    [puzzle, solve],
  );

  const tapSlot = useCallback(
    (i: number) => {
      if (lockRef.current || endedRef.current) return;
      setToast(null);
      if (selected) {
        if (canPlace(puzzle, placement, selected, i)) {
          const next = [...placement];
          next[i] = selected;
          apply(next);
          const left = (puzzle.parts[selected] ?? 0) - next.filter((g) => g === selected).length;
          if (left <= 0) setSelected(null);
          return;
        }
        setToast(
          ARITY[selected] > puzzle.slots[i].inputs.length
            ? `${selected}는 배선이 ${ARITY[selected]}개 필요해요`
            : `${selected} 부품을 다 썼어요`,
        );
        return;
      }
      if (placement[i]) {
        const next = [...placement];
        next[i] = null;
        apply(next);
      } else {
        setToast("아래에서 부품을 먼저 고르세요");
      }
    },
    [apply, placement, puzzle, selected],
  );

  const takeHint = useCallback(() => {
    if (lockRef.current || endedRef.current || hintText) return;
    budgetRef.current += onHint(runRef.current);
    setHintText(puzzle.hint);
    force((v) => v + 1);
  }, [hintText, puzzle]);

  const skip = useCallback(() => {
    if (lockRef.current || endedRef.current) return;
    budgetRef.current += onWrongSubmit(runRef.current);
    lockRef.current = true;
    loadPuzzle(tierFor(runRef.current.solved));
  }, [loadPuzzle]);

  const rows = useMemo(() => gradeRows(puzzle, placement), [puzzle, placement]);
  const remaining = useMemo(() => remainingParts(puzzle, placement), [puzzle, placement]);
  const placeableSlots = useMemo(
    () => puzzle.slots.map((_, i) => (selected ? canPlace(puzzle, placement, selected, i) : false)),
    [placement, puzzle, selected],
  );
  const ratio = run.solved / CFG.stage.target;
  const stage = stageFromRatio(ratio);
  const solvedRows = rows.filter((r) => r.ok).length;

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <Hud
        hud={{
          timeLeft,
          // 시간 보너스를 빼고 "번 점수"만 — 시계가 줄어든다고 점수가 깎여 보이면 안 된다
          score: rawScore(run, 0),
          combo: run.combo,
          comboMult: comboMult(run.combo),
          overdrive: run.overdriveUntilMs >= 0 && run.clockMs <= run.overdriveUntilMs,
          tier: puzzle.tier,
          stage,
          stageProgress: stageProgress(ratio),
          solved: run.solved,
          optimal: run.optimal,
        }}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          {/* 요구 진리표 */}
          <div className="card-solid shrink-0 p-2 sm:w-52">
            <p className="mb-1 flex items-center justify-between px-1 text-[10px] text-dim">
              <span>요구 진리표</span>
              <span className="num">
                {solvedRows}/{rows.length}
              </span>
            </p>
            <TruthTable puzzle={puzzle} rows={rows} bits={bits} onPickRow={setBits} />
          </div>

          {/* 회로 */}
          <div className="card-solid min-w-0 flex-1 p-2">
            <CircuitBoard
              puzzle={puzzle}
              placement={placement}
              bits={bits}
              placeable={placeableSlots}
              onSlotTap={tapSlot}
              onInputToggle={(i) => setBits((b) => b.map((v, j) => (j === i ? (v ? 0 : 1) : v)))}
            />
            <SlotHint className="mt-1" />
          </div>
        </div>

        {hintText && (
          <p className="mt-2 rounded-tile border border-aqua/40 bg-aqua/10 px-3 py-2 text-center text-xs text-aqua">
            💡 {hintText}
          </p>
        )}
        {toast && !hintText && (
          <p className="mt-2 text-center text-xs text-alert">{toast}</p>
        )}
      </div>

      {/* 부품 트레이 + 조작 */}
      <div className="shrink-0 border-t border-line bg-night/85 px-4 pb-4 pt-3">
        <PartTray remaining={remaining} selected={selected} onSelect={setSelected} />
        <div className="mt-2 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={takeHint}
            disabled={!!hintText}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-tile border border-line text-xs font-bold text-mute transition-colors hover:border-aqua/60 hover:text-aqua disabled:opacity-40"
          >
            <Lightbulb className="size-4" /> 힌트 {CFG.time.hint}초
          </button>
          <button
            type="button"
            onClick={() => !lockRef.current && apply(puzzle.slots.map(() => null))}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-tile border border-line text-xs font-bold text-mute transition-colors hover:border-line-strong hover:text-ink"
          >
            <Eraser className="size-4" /> 비우기
          </button>
          <button
            type="button"
            onClick={skip}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-tile border border-line text-xs font-bold text-mute transition-colors hover:border-alert/60 hover:text-alert"
          >
            <SkipForward className="size-4" /> 넘기기 {CFG.time.wrong}초
          </button>
        </div>
      </div>

      {/* 정답 연출 */}
      {flash && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="animate-pop text-center">
            <p className={cn("text-3xl font-black", flash.optimal ? "text-neon text-glow" : "text-ok")}>
              {flash.optimal ? "PERFECT!" : "SOLVED!"}
            </p>
            <p className="num mt-1 text-lg font-bold text-ink">
              +{flash.points.toLocaleString()}
              {flash.overdrive && <span className="ml-2 text-neon">⚡×2</span>}
            </p>
            <p className="num mt-0.5 text-sm text-aqua">+{flash.time}초</p>
            {flash.optimal && <p className="mt-0.5 text-xs text-neon">최소 게이트 달성 +80</p>}
          </div>
        </div>
      )}

      {energyFound && (
        <p className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded-full bg-neon/20 px-3 py-1 text-xs font-bold text-neon">
          🦉 아울 에너지 발견!
        </p>
      )}
    </div>
  );
}
