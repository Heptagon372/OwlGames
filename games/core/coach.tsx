"use client";

// 게임 첫 조작 안내 — 반투명 손가락이 "이렇게 해 보세요"를 보여 준다 (DECISIONS §5-43)
// - 입력을 절대 가로채지 않는다(pointer-events-none · aria-hidden). 화면 위에 옅게 얹힐 뿐 게임 판정·점수에 영향이 없다.
// - 그림은 사용자가 준 손가락 한 장(scripts/slice-coach-hand.py → public/assets/ui/coach-hand.webp).
//   움직임(탭·꾹 누르기·좌우 끌기·아래로 튕기기·조이스틱)은 CSS 애니메이션(globals.css 의 coach-*)으로 입힌다.
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const HAND_SRC = "/assets/ui/coach-hand.webp";
/** 그림 안에서 누르는 점(링 가운데)의 비율 — slice-coach-hand.py 가 찍어 주는 값 */
const TIP_X = 0.484;
const TIP_Y = 0.275;
/** 그림 가로:세로 (240×304) */
const HAND_RATIO = 304 / 240;
/** 손가락 불투명도 — 게임 화면이 비쳐 보이도록 옅게 */
export const COACH_OPACITY = 0.42;

export type Gesture = "tap" | "hold" | "drag-x" | "flick-down" | "joystick";
/** 부모 기준 좌표 — px 숫자 또는 "70%" 같은 CSS 길이 */
export type Point = { x: number | string; y: number | string };

const ANIM: Record<Gesture, string> = {
  tap: "animate-coach-tap",
  hold: "animate-coach-hold",
  "drag-x": "animate-coach-drag-x",
  "flick-down": "animate-coach-flick-down",
  joystick: "animate-coach-joystick",
};

/**
 * 부모(position: relative) 기준 `at` 에 손끝이 오도록 손가락을 그린다.
 * @param labelAt 안내 글 위치 — 화면 아래쪽에 가까우면 "above"
 * @param labelAlign 화면 오른쪽 끝이면 "end"(글이 손끝 왼쪽으로 뻗는다), 왼쪽 끝이면 "start"
 */
export function CoachHand({
  at,
  gesture,
  label,
  labelAt = "below",
  labelAlign = "center",
  size = 84,
}: {
  at: Point;
  gesture: Gesture;
  label?: string;
  labelAt?: "below" | "above";
  labelAlign?: "center" | "start" | "end";
  size?: number;
}) {
  const h = size * HAND_RATIO;
  const tx = labelAlign === "end" ? "-88%" : labelAlign === "start" ? "-12%" : "-50%";
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-[15] select-none"
      style={{ left: at.x, top: at.y, opacity: COACH_OPACITY }}
    >
      {gesture === "joystick" && (
        <span className="absolute size-[132px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-white/70" />
      )}
      {/* key — 동작이 바뀌면 애니메이션을 처음부터 */}
      <div key={gesture} className={cn("origin-top-left motion-reduce:animate-none", ANIM[gesture])}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HAND_SRC}
          alt=""
          draggable={false}
          width={size}
          height={Math.round(h)}
          className="block max-w-none"
          style={{ width: size, height: h, transform: `translate(${-TIP_X * 100}%, ${-TIP_Y * 100}%)` }}
        />
      </div>
      {label && (
        <p
          className="absolute left-0 whitespace-nowrap rounded-full bg-night/75 px-3 py-1 text-xs font-bold text-white"
          style={
            labelAt === "below"
              ? { top: h * (1 - TIP_Y) + 4, transform: `translateX(${tx})` }
              : { top: -h * TIP_Y - 4, transform: `translate(${tx}, -100%)` }
          }
        >
          {label}
        </p>
      )}
    </div>
  );
}

/**
 * 안내 단계를 차례로 돈다 — `ms[i]` 동안 i 번째 단계, 전체를 `loops` 번 돌면 끝(-1).
 * `active` 가 false 인 동안(일시정지·세로 안내·카드 선택 …)은 시간이 흐르지 않는다. `stop()` 은 바로 끝낸다.
 */
export function useCoachSteps(ms: readonly number[], active: boolean, loops = 1): { step: number; stop: () => void } {
  const [step, setStep] = useState(0);
  const msRef = useRef(ms);
  msRef.current = ms;
  const elapsed = useRef(0);
  const done = step < 0;

  useEffect(() => {
    if (!active || done) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      elapsed.current += now - last;
      last = now;
      const list = msRef.current;
      const total = list.reduce((a, b) => a + b, 0);
      if (total <= 0 || elapsed.current >= total * loops) {
        setStep(-1);
        return;
      }
      let r = elapsed.current % total;
      let i = 0;
      while (i < list.length - 1 && r >= list[i]) r -= list[i++];
      setStep(i);
    }, 100);
    return () => clearInterval(id);
  }, [active, done, loops]);

  const stop = useCallback(() => setStep(-1), []);
  return { step, stop };
}

/**
 * `root` 안에서 `selector` 에 맞는 첫 번째 **보이는** 요소의 가운데(root 기준 좌표, 스크롤 포함)를 따라간다.
 * 게임 화면이 다시 그려져 요소가 옮겨 가도 손가락이 따라가도록 짧은 간격으로 다시 잰다.
 */
export function useTargetPoint(
  root: React.RefObject<HTMLElement | null>,
  selector: string,
  active: boolean,
): { x: number; y: number } | null {
  const [pt, setPt] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!active) {
      setPt(null);
      return;
    }
    const measure = () => {
      const el = root.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      let found: { x: number; y: number } | null = null;
      for (const node of el.querySelectorAll<HTMLElement>(selector)) {
        const r = node.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        found = {
          x: Math.round(r.left + r.width / 2 - box.left + el.scrollLeft),
          y: Math.round(r.top + r.height / 2 - box.top + el.scrollTop),
        };
        break;
      }
      setPt((p) => (p?.x === found?.x && p?.y === found?.y ? p : found));
    };
    measure();
    const id = setInterval(measure, 150);
    return () => clearInterval(id);
  }, [root, selector, active]);
  return pt;
}
