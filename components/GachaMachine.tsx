"use client";

import { cn } from "@/lib/cn";

export type GachaState = "idle" | "spinning" | "reveal";

const CAPSULES = [
  { x: 52, y: 58, c: "#FFB020", d: "0s" },
  { x: 78, y: 52, c: "#3DD9EB", d: "0.08s" },
  { x: 104, y: 60, c: "#FF5C7A", d: "0.16s" },
  { x: 64, y: 80, c: "#6BF0A0", d: "0.24s" },
  { x: 92, y: 82, c: "#CDA8FF", d: "0.32s" },
  { x: 78, y: 100, c: "#FFD27A", d: "0.12s" },
  { x: 108, y: 88, c: "#7FA6FF", d: "0.2s" },
  { x: 50, y: 96, c: "#FF9CD2", d: "0.28s" },
];

/** 부스 키오스크 뽑기 연출 (§8.2). 결과는 서버 RPC가 준 값만 표시한다 */
export function GachaMachine({ state, className }: { state: GachaState; className?: string }) {
  const spinning = state === "spinning";
  return (
    <div className={cn("relative select-none", className)}>
      <svg viewBox="0 0 160 220" className="w-full" role="img" aria-label="뽑기 기계">
        <defs>
          <radialGradient id="dome" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
            <stop offset="0.6" stopColor="#3dd9eb" stopOpacity="0.1" />
            <stop offset="1" stopColor="#0b1020" stopOpacity="0.5" />
          </radialGradient>
          <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a3665" />
            <stop offset="1" stopColor="#141b33" />
          </linearGradient>
        </defs>

        {/* 유리 돔 */}
        <circle cx="80" cy="80" r="62" fill="url(#dome)" stroke="#3dd9eb" strokeOpacity="0.45" strokeWidth="2" />
        <g className={spinning ? "animate-jitter" : undefined}>
          {CAPSULES.map((c, i) => (
            <g key={i} style={{ animationDelay: c.d }} className={spinning ? "animate-jitter" : undefined}>
              <circle cx={c.x} cy={c.y} r="11" fill={c.c} opacity="0.92" />
              <path d={`M${c.x - 11} ${c.y} a11 11 0 0 1 22 0 z`} fill="#ffffff" opacity="0.25" />
            </g>
          ))}
        </g>
        {/* 하이라이트 */}
        <path d="M44 48 a48 48 0 0 1 30 -22" stroke="#fff" strokeOpacity="0.35" strokeWidth="5" strokeLinecap="round" fill="none" />

        {/* 본체 */}
        <rect x="26" y="136" width="108" height="66" rx="12" fill="url(#body)" stroke="#3dd9eb" strokeOpacity="0.35" strokeWidth="2" />
        <rect x="18" y="200" width="124" height="14" rx="7" fill="#232e55" />
        {/* 손잡이 */}
        <g className={spinning ? "animate-spin" : undefined} style={{ transformOrigin: "80px 156px", transformBox: "view-box" }}>
          <circle cx="80" cy="156" r="13" fill="#0b1020" stroke="#ffb020" strokeWidth="3" />
          <rect x="78" y="145" width="4" height="22" rx="2" fill="#ffb020" />
        </g>
        {/* 배출구 */}
        <rect x="56" y="176" width="48" height="18" rx="6" fill="#0b1020" stroke="#3dd9eb" strokeOpacity="0.4" strokeWidth="1.5" />

        {/* 떨어지는 캡슐 */}
        {state === "reveal" && (
          <g className="animate-drop" style={{ transformOrigin: "80px 110px", transformBox: "view-box" }}>
            <circle cx="80" cy="110" r="12" fill="#ffb020" />
            <path d="M68 110 a12 12 0 0 1 24 0 z" fill="#fff" opacity="0.3" />
          </g>
        )}
      </svg>

      {state === "reveal" && (
        <span
          className="pointer-events-none absolute left-1/2 top-[80%] size-24 -translate-x-1/2 animate-flash rounded-full bg-neon/70 blur-xl"
          style={{ animationDelay: "0.9s" }}
          aria-hidden
        />
      )}
      {spinning && (
        <p className="mt-2 text-center font-mono text-sm tracking-[0.3em] text-aqua">DRAWING...</p>
      )}
    </div>
  );
}
