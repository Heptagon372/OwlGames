"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Globe, Mail, MessageSquare, ShieldAlert, ShieldCheck } from "lucide-react";
import { startLoop } from "../core/loop";
import type { GameComponentProps } from "../core/types";
import { PHISH_CARDS, type PhishCard } from "@/data/phish-cards";
import { cn } from "@/lib/cn";
import { stageColor, stageCurve, stageFromRatio, stageLabel } from "@/lib/stages";

const DURATION = 90;
const WRONG_PENALTY = 5; // 오답 −5초
const SWIPE_THRESHOLD = 90;
/** 카드 하나를 볼 수 있는 시간 — 단계마다 곱으로 짧아진다 (§공통 15단계).
 *  STAGE 1에서 10초(한글 3~4줄을 천천히 읽는 시간), STAGE 15에서 4.3초. */
const CARD_SEC = 10;
const CARD_SEC_MIN = 3;
/** STAGE 기준: 45장을 넘기면 15단계 */
const STAGE_CARDS = 45;

function cardSec(stage: number): number {
  return Math.max(CARD_SEC_MIN, CARD_SEC / stageCurve(stage, 0.4));
}

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 🎣 피싱 헌터 — 카드를 좌(피싱)/우(정상)로 판별 (§7.3)
 *  한글 본문 가독성·접근성 때문에 카드 UI는 DOM으로 그리고, 타이머만 rAF로 돈다. */
export function PhishGame({ onEnd }: GameComponentProps) {
  const deck = useMemo(() => shuffle(PHISH_CARDS), []);
  const [index, setIndex] = useState(0);
  const [left, setLeft] = useState(DURATION);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; explain: string } | null>(null);

  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const statsRef = useRef({ correct: 0, wrong: 0, maxStreak: 0 });
  const penaltyRef = useRef(0);
  const lockedRef = useRef(false);
  const indexRef = useRef(0);
  const endedRef = useRef(false);
  const dragStart = useRef(0);
  const cardLeftRef = useRef(CARD_SEC);
  const [cardLeft, setCardLeft] = useState<number>(CARD_SEC);
  const [, force] = useState(0);

  const card: PhishCard | undefined = deck[index];

  const finish = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    onEnd(Math.round(scoreRef.current), {
      answered: statsRef.current.correct + statsRef.current.wrong,
      correct: statsRef.current.correct,
      wrong: statsRef.current.wrong,
      max_streak: statsRef.current.maxStreak,
      stage_max: stageFromRatio(indexRef.current / STAGE_CARDS),
    });
  }, [onEnd]);

  // 타이머
  useEffect(() => {
    endedRef.current = false;
    const loop = startLoop((dt, elapsed) => {
      const remain = DURATION - elapsed - penaltyRef.current;
      setLeft(Math.max(0, remain));

      // 카드 제한시간 (해설을 보여주는 동안에는 멈춘다)
      if (!lockedRef.current && !endedRef.current && remain > 0) {
        cardLeftRef.current -= dt;
        setCardLeft(Math.max(0, cardLeftRef.current));
        if (cardLeftRef.current <= 0) timeoutRef.current?.();
      }

      if (remain <= 0) {
        loop.stop();
        finish();
      }
    });
    return () => loop.stop();
  }, [finish]);

  // 시간 초과는 루프(=effect 클로저) 안에서 불러야 해서 ref로 건넨다
  const timeoutRef = useRef<(() => void) | null>(null);

  const answer = useCallback(
    (asPhish: boolean | null) => {
      if (lockedRef.current || endedRef.current) return;
      const current = deck[indexRef.current];
      if (!current) return;
      const ok = asPhish !== null && current.isPhish === asPhish;
      lockedRef.current = true;

      if (ok) {
        const bonus = Math.min(2, 1 + 0.1 * streakRef.current);
        scoreRef.current += 100 * bonus;
        streakRef.current += 1;
        statsRef.current.correct += 1;
        statsRef.current.maxStreak = Math.max(statsRef.current.maxStreak, streakRef.current);
      } else {
        streakRef.current = 0;
        statsRef.current.wrong += 1;
        penaltyRef.current += WRONG_PENALTY;
      }
      force((n) => n + 1);
      if (asPhish !== null) setDx(asPhish ? -420 : 420);
      setFeedback({
        ok,
        explain: asPhish === null ? `시간 초과 — ${current.explain}` : current.explain,
      });

      // 오답이면 해설 1초, 정답이면 짧게
      setTimeout(
        () => {
          setFeedback(null);
          setDx(0);
          lockedRef.current = false;
          const next = indexRef.current + 1;
          indexRef.current = next;
          setIndex(next);
          cardLeftRef.current = cardSec(stageFromRatio(next / STAGE_CARDS));
          setCardLeft(cardLeftRef.current);
          if (next >= deck.length) finish();
        },
        ok ? 260 : 1000,
      );
    },
    [deck, finish],
  );

  useEffect(() => {
    timeoutRef.current = () => answer(null);
  }, [answer]);

  // 키보드
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") answer(true);
      if (e.key === "ArrowRight") answer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer]);

  const bonus = Math.min(2, 1 + 0.1 * streakRef.current);
  const intent = dx < -40 ? "phish" : dx > 40 ? "safe" : null;

  return (
    <div className="flex h-full flex-col select-none bg-night">
      {/* HUD */}
      <div className="shrink-0 px-4 pt-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="font-mono text-[11px] text-mute">SCORE</p>
            <p className="num text-2xl font-black text-neon">{Math.round(scoreRef.current)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold" style={{ color: stageColor(stageFromRatio(index / STAGE_CARDS)) }}>
              {stageLabel(stageFromRatio(index / STAGE_CARDS))}
            </p>
            {streakRef.current > 0 && (
              <p className="num text-sm font-black text-neon-soft">
                {streakRef.current} 연속 · ×{bonus.toFixed(1)}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="font-mono text-[11px] text-mute">TIME</p>
            <p className={cn("num text-2xl font-black", left < 15 ? "text-alert" : "text-aqua")}>{left.toFixed(1)}</p>
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel">
          <div
            className={cn("h-full rounded-full transition-[width] duration-100", left < 15 ? "bg-alert" : "bg-aqua")}
            style={{ width: `${(left / DURATION) * 100}%` }}
          />
        </div>
      </div>

      {/* 카드 */}
      <div className="relative min-h-0 flex-1 px-4 py-4">
        {deck.slice(index + 1, index + 3).map((c, i) => (
          <div
            key={c.id}
            className="card-solid absolute inset-x-4 top-4 bottom-4 -z-10"
            style={{ transform: `scale(${0.96 - i * 0.03}) translateY(${(i + 1) * 10}px)`, opacity: 0.5 - i * 0.2 }}
          />
        ))}

        {card && (
          <div
            className={cn(
              "card-solid relative flex h-full flex-col overflow-hidden p-5 select-none",
              !dragging && "transition-transform duration-200",
            )}
            style={{ transform: `translateX(${dx}px) rotate(${dx * 0.05}deg)`, touchAction: "pan-y" }}
            onPointerDown={(e) => {
              if (lockedRef.current) return;
              dragStart.current = e.clientX;
              setDragging(true);
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => dragging && setDx(e.clientX - dragStart.current)}
            onPointerUp={() => {
              setDragging(false);
              if (dx < -SWIPE_THRESHOLD) answer(true);
              else if (dx > SWIPE_THRESHOLD) answer(false);
              else setDx(0);
            }}
            onPointerCancel={() => {
              setDragging(false);
              setDx(0);
            }}
          >
            {/* 스와이프 라벨 */}
            <div
              className={cn(
                "absolute left-4 top-4 z-10 rotate-[-12deg] rounded-xl border-2 px-3 py-1 text-lg font-black transition-opacity",
                "border-alert text-alert",
                intent === "phish" ? "opacity-100" : "opacity-0",
              )}
            >
              🚨 피싱
            </div>
            <div
              className={cn(
                "absolute right-4 top-4 z-10 rotate-[12deg] rounded-xl border-2 px-3 py-1 text-lg font-black transition-opacity",
                "border-ok text-ok",
                intent === "safe" ? "opacity-100" : "opacity-0",
              )}
            >
              ✅ 정상
            </div>

            {/* 카드 제한시간 — 단계가 오를수록 짧아진다 */}
            <div className="absolute inset-x-0 top-0 h-1 bg-night/60">
              <div
                className={cn(
                  "h-full transition-[width] duration-100",
                  cardLeft < 1.5 ? "bg-alert" : "bg-aqua/70",
                )}
                style={{ width: `${(cardLeft / cardSec(stageFromRatio(index / STAGE_CARDS))) * 100}%` }}
              />
            </div>

            <CardBody card={card} />

            <p className="mt-auto pt-4 text-center font-mono text-[11px] text-dim">
              ← 스와이프 = 피싱 · 정상 = 스와이프 →
            </p>
          </div>
        )}

        {/* 정답/오답 피드백 */}
        {feedback && (
          <div
            className={cn(
              "absolute inset-x-4 bottom-4 z-20 animate-rise rounded-card border p-4 text-center backdrop-blur-sm",
              feedback.ok ? "border-ok/60 bg-ok/15 text-ok" : "border-alert/60 bg-alert/15 text-alert",
            )}
          >
            <p className="text-lg font-black">{feedback.ok ? "정답! 👏" : `오답 · −${WRONG_PENALTY}초`}</p>
            <p className="mt-1 text-sm text-ink">{feedback.explain}</p>
          </div>
        )}
      </div>

      {/* 버튼 (PC·접근성) */}
      <div className="grid shrink-0 grid-cols-2 gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => answer(true)}
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-alert/50 bg-alert/10 text-lg font-black text-alert active:scale-95"
        >
          <ShieldAlert className="size-6" /> 피싱
        </button>
        <button
          type="button"
          onClick={() => answer(false)}
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-ok/50 bg-ok/10 text-lg font-black text-ok active:scale-95"
        >
          <ShieldCheck className="size-6" /> 정상
        </button>
      </div>
    </div>
  );
}

function CardBody({ card }: { card: PhishCard }) {
  if (card.kind === "url") {
    return (
      <div className="flex flex-1 flex-col justify-center">
        <p className="mb-3 flex items-center gap-2 font-mono text-xs text-aqua">
          <Globe className="size-4" /> URL
        </p>
        <div className="rounded-2xl border border-line bg-night p-4">
          <div className="mb-3 flex gap-1.5">
            <span className="size-2.5 rounded-full bg-alert/60" />
            <span className="size-2.5 rounded-full bg-neon/60" />
            <span className="size-2.5 rounded-full bg-ok/60" />
          </div>
          <p className="num text-lg leading-relaxed break-all text-ink">{card.body}</p>
        </div>
        <p className="mt-4 text-center text-sm text-mute">이 주소, 진짜일까요?</p>
      </div>
    );
  }

  if (card.kind === "sms") {
    return (
      <div className="flex flex-1 flex-col justify-center">
        <p className="mb-3 flex items-center gap-2 font-mono text-xs text-aqua">
          <MessageSquare className="size-4" /> 문자
        </p>
        <p className="num mb-2 text-sm text-mute">{card.sender}</p>
        <div className="rounded-2xl rounded-tl-sm border border-line bg-panel-2 p-4">
          <p className="text-[15px] leading-relaxed break-words text-ink">{card.body}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col justify-center">
      <p className="mb-3 flex items-center gap-2 font-mono text-xs text-aqua">
        <Mail className="size-4" /> 메일
      </p>
      <div className="rounded-2xl border border-line bg-night p-4">
        <p className="num text-xs break-all text-mute">{card.sender}</p>
        <p className="mt-2 text-base font-bold break-words text-ink">{card.title}</p>
        <hr className="my-3 border-line" />
        <p className="text-sm leading-relaxed break-words text-mute">{card.body}</p>
      </div>
    </div>
  );
}
