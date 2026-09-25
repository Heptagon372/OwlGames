"use client";

import { useCallback, useRef, useState } from "react";
import { applyTheme, currentTheme } from "@/lib/theme";
import { cn } from "@/lib/cn";

/**
 * 다크 ↔ 라이트 스위치 (§13).
 *
 * 해가 호를 그리며 뜨고 진다. 노브 위치는 **CSS가 `html[data-theme]`을 보고** 정하기 때문에
 * (globals.css 의 `.theme-switch`) 서버 렌더와 저장된 테마가 달라도 깜빡이지 않는다.
 * 여기서는 클릭과 "한 번 더 재생"만 관리한다.
 */
export function ThemeToggle({ className, label }: { className?: string; label?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  // 토글할 때마다 key가 바뀌면서 호 애니메이션이 다시 재생된다 (첫 렌더에는 재생하지 않는다)
  const [arc, setArc] = useState<{ n: number; rise: boolean } | null>(null);

  const toggle = useCallback(() => {
    const next = currentTheme() === "light" ? "dark" : "light";
    setArc((a) => ({ n: (a?.n ?? 0) + 1, rise: next === "light" }));

    const root = document.documentElement;
    // 색 전환은 바꾸는 순간에만 켠다 (평소에 켜 두면 입력이 굼떠 보인다)
    root.setAttribute("data-theme-anim", "");
    window.setTimeout(() => root.removeAttribute("data-theme-anim"), 700);
    applyTheme(next);
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      onClick={toggle}
      aria-label="화면 테마 바꾸기"
      title="화면 테마 (다크 / 라이트)"
      className={cn("theme-switch inline-flex min-h-11 items-center gap-2 px-0.5", className)}
    >
      <span className="grad-line glass relative block h-9 w-[72px] overflow-hidden rounded-full">
        {/* 밤하늘 — 도트 매트릭스로 '디지털' 질감 */}
        <span
          className="absolute inset-0 bg-[#0a1024]"
          style={{
            backgroundImage: "radial-gradient(rgb(167 139 250 / 0.5) 0.5px, transparent 0.6px)",
            backgroundSize: "4px 4px",
          }}
          aria-hidden
        />
        {/* 낮하늘 — 켜지면 위로 덮인다 */}
        <span
          className="theme-day absolute inset-0 bg-linear-to-b from-[#7fc7f5] via-[#bfe0f8] to-[#ffd9a0]"
          style={{
            backgroundImage:
              "radial-gradient(rgb(255 255 255 / 0.55) 0.5px, transparent 0.6px), linear-gradient(180deg, #7fc7f5, #bfe0f8 55%, #ffd9a0)",
            backgroundSize: "4px 4px, 100% 100%",
          }}
          aria-hidden
        />
        {/* 지평선 */}
        <span
          className="absolute inset-x-1.5 bottom-[7px] h-px"
          style={{
            backgroundImage: "repeating-linear-gradient(90deg, rgb(255 255 255 / 0.55) 0 2px, transparent 2px 4px)",
          }}
          aria-hidden
        />
        {/* 상태 라벨 — 노브 반대쪽에 뜬다 */}
        <span className="arcade theme-label-night absolute right-2.5 top-1/2 -translate-y-1/2 text-[8px] text-[#c4b5fd]">
          NGT
        </span>
        <span className="arcade theme-label-day absolute left-2.5 top-1/2 -translate-y-1/2 text-[8px] text-[#7c4a12]">
          DAY
        </span>

        {/* 노브 — X는 CSS 전환, Y(호)는 클릭할 때마다 재생 */}
        <span className="theme-knob absolute left-1 top-1 block size-7">
          <span
            key={arc?.n ?? 0}
            className={cn("block size-7", arc && (arc.rise ? "animate-arc-rise" : "animate-arc-set"))}
          >
            <SunMoon />
          </span>
        </span>

        {/* 스캔 스윕 한 줄 */}
        {arc && (
          <span
            key={`sweep-${arc.n}`}
            className="animate-sweep pointer-events-none absolute inset-y-0 left-0 w-3 bg-white/45 blur-[1.5px]"
            aria-hidden
          />
        )}
      </span>
      {label && (
        /* 두 글자를 같은 칸에 겹쳐 두고 투명도로 교대 — 폭이 흔들리지 않는다 */
        <span className="grid text-xs font-bold text-mute">
          <span className="theme-label-night col-start-1 row-start-1">다크</span>
          <span className="theme-label-day col-start-1 row-start-1">라이트</span>
        </span>
      )}
    </button>
  );
}

/** 해와 달을 겹쳐 두고 CSS로 교대시킨다 (둘 다 네모난 각으로 잘라 디지털 느낌) */
function SunMoon() {
  return (
    <span className="relative block size-7">
      <svg viewBox="0 0 28 28" className="theme-moon absolute inset-0 size-7" aria-hidden>
        <circle cx="14" cy="14" r="8.5" fill="#dfe4ff" />
        <circle cx="18.5" cy="11" r="7.5" fill="#0a1024" />
        <rect x="9" y="15" width="2" height="2" fill="#0a1024" opacity=".5" />
        <rect x="12" y="19" width="2" height="2" fill="#0a1024" opacity=".35" />
      </svg>
      <svg viewBox="0 0 28 28" className="theme-sun absolute inset-0 size-7" aria-hidden>
        <g fill="#ffb020">
          <circle cx="14" cy="14" r="6" />
          <rect x="13" y="0.5" width="2" height="3.5" />
          <rect x="13" y="24" width="2" height="3.5" />
          <rect x="0.5" y="13" width="3.5" height="2" />
          <rect x="24" y="13" width="3.5" height="2" />
          <rect x="4" y="4" width="2" height="2" />
          <rect x="22" y="4" width="2" height="2" />
          <rect x="4" y="22" width="2" height="2" />
          <rect x="22" y="22" width="2" height="2" />
        </g>
      </svg>
    </span>
  );
}
