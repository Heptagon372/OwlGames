"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/** 연출 단계 (§8.2) — 결과는 서버 RPC 가 준 값만 표시한다 */
export type GachaState = "idle" | "spinning" | "reveal";

/** 집게가 훑는 동안 화면에 뜨는 문구 (0.9초마다 바뀐다) */
const LINES = ["SCANNING...", "TARGET LOCK", "GRABBING..."] as const;

/** 유리관 안의 캡슐 — 좌표는 뷰박스(0~240) 기준 */
const CAPSULES = [
  { x: 60, y: 168, c: "#22d3ee", d: "0s" },
  { x: 92, y: 176, c: "#e879f9", d: "0.35s" },
  { x: 124, y: 168, c: "#a78bfa", d: "0.7s" },
  { x: 156, y: 176, c: "#ffb020", d: "0.2s" },
  { x: 76, y: 150, c: "#7dd3fc", d: "0.55s" },
  { x: 140, y: 150, c: "#f472b6", d: "0.85s" },
  { x: 108, y: 146, c: "#4ade80", d: "0.45s" },
];

/**
 * 부스 키오스크 뽑기 기계 — 네온 크레인(집게) 기계.
 *
 * 연출만 담당한다. `state` 는 키오스크가 서버 응답에 맞춰 넘긴다:
 *   idle     대기 (네온 간판만 숨쉬듯 빛난다)
 *   spinning 집게가 좌우로 훑고 → 내려가 → 캡슐을 쥔다  (최소 3초, §8.2)
 *   reveal   집게가 올라오고 캡슐이 배출구로 떨어진다 → 섬광
 */
export function GachaMachine({ state, className }: { state: GachaState; className?: string }) {
  const spinning = state === "spinning";
  const reveal = state === "reveal";
  const [line, setLine] = useState(0);

  useEffect(() => {
    if (!spinning) {
      setLine(0);
      return;
    }
    const id = setInterval(() => setLine((i) => Math.min(i + 1, LINES.length - 1)), 900);
    return () => clearInterval(id);
  }, [spinning]);

  return (
    <div className={cn("relative select-none", className)}>
      <svg viewBox="0 0 240 340" className="w-full" role="img" aria-label="뽑기 기계">
        <defs>
          <linearGradient id="gm-neon" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#22d3ee" />
            <stop offset="0.5" stopColor="#a78bfa" />
            <stop offset="1" stopColor="#e879f9" />
          </linearGradient>
          <linearGradient id="gm-glass" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stopColor="#a78bfa" stopOpacity="0.20" />
            <stop offset="0.55" stopColor="#22d3ee" stopOpacity="0.07" />
            <stop offset="1" stopColor="#070b18" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="gm-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1b2545" />
            <stop offset="1" stopColor="#0b1128" />
          </linearGradient>
          <filter id="gm-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ── 간판 ───────────────────────────────────────────── */}
        <g filter="url(#gm-glow)">
          <rect
            x="18" y="10" width="204" height="46" rx="12"
            fill="#0b1128" stroke="url(#gm-neon)" strokeWidth="2.5"
          />
          <text
            x="120" y="40" textAnchor="middle"
            className="font-mono" fontSize="19" fontWeight="700"
            fill="url(#gm-neon)" letterSpacing="2.5"
          >
            OWL GAMES
          </text>
        </g>
        {/* 간판 모서리 사선 */}
        <g stroke="url(#gm-neon)" strokeWidth="2" strokeLinecap="round" opacity="0.8">
          <path d="M26 22l10-10M26 34l22-22" />
          <path d="M214 44l-10 10M214 32l-22 22" />
        </g>

        {/* ── 유리관 ─────────────────────────────────────────── */}
        <rect x="26" y="64" width="188" height="152" rx="10" fill="url(#gm-glass)" />
        <rect
          x="26" y="64" width="188" height="152" rx="10"
          fill="none" stroke="url(#gm-neon)" strokeWidth="2.5" filter="url(#gm-glow)"
        />
        {/* 상단 조명 바 */}
        <rect x="42" y="72" width="156" height="5" rx="2.5" fill="#c4b5fd" opacity={spinning ? 0.95 : 0.55}
          className={spinning ? "animate-pulse-glow" : undefined} />
        {/* 유리 반사 */}
        <path d="M40 206L96 74" stroke="#ffffff" strokeOpacity="0.09" strokeWidth="14" strokeLinecap="round" />

        {/* ── 집게 ───────────────────────────────────────────── */}
        <g
          filter="url(#gm-glow)"
          className={spinning ? "animate-claw-hunt" : reveal ? "animate-claw-home" : undefined}
          style={{ transformOrigin: "120px 78px", transformBox: "view-box" }}
        >
          {/* 레일에서 내려오는 호스 */}
          <rect x="116" y="77" width="8" height="26" rx="4" fill="#2b3760" />
          <g
            className={spinning ? "animate-claw-dive" : reveal ? "animate-claw-lift" : undefined}
            style={{ transformOrigin: "120px 100px", transformBox: "view-box" }}
          >
            <rect x="108" y="98" width="24" height="22" rx="6" fill="#141d3a" stroke="url(#gm-neon)" strokeWidth="2.2" />
            {/* 집게발 — 내려가면 벌어지고, 올라올 때 오므린다 */}
            <g
              className={spinning ? "animate-claw-open" : reveal ? "animate-claw-close" : undefined}
              style={{ transformOrigin: "120px 120px", transformBox: "view-box" }}
            >
              <path d="M120 120l-17 10 5 18" fill="none" stroke="url(#gm-neon)" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M120 120l17 10-5 18" fill="none" stroke="url(#gm-neon)" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M120 120v20" stroke="url(#gm-neon)" strokeWidth="3.4" strokeLinecap="round" />
            </g>
            {/* 잡은 캡슐 — 올라오는 동안만 집게에 붙어 있다 */}
            {reveal && (
              <g className="animate-fade-in">
                <circle cx="120" cy="138" r="11" fill="#ffb020" />
                <path d="M109 138a11 11 0 0 1 22 0z" fill="#ffffff" opacity="0.32" />
              </g>
            )}
          </g>
        </g>

        {/* ── 캡슐 더미 ──────────────────────────────────────── */}
        <g>
          {CAPSULES.map((c, i) => (
            <g
              key={i}
              className={spinning ? "animate-capsule-bob" : undefined}
              style={{ animationDelay: c.d, transformOrigin: `${c.x}px ${c.y}px`, transformBox: "view-box" }}
            >
              <circle cx={c.x} cy={c.y} r="13" fill={c.c} opacity="0.9" />
              <path d={`M${c.x - 13} ${c.y}a13 13 0 0 1 26 0z`} fill="#ffffff" opacity="0.22" />
              <circle cx={c.x} cy={c.y} r="13" fill="none" stroke="#070b18" strokeOpacity="0.45" strokeWidth="1.2" />
            </g>
          ))}
          {/* 바닥 그림자 */}
          <rect x="34" y="188" width="172" height="20" rx="10" fill="#070b18" opacity="0.35" />
        </g>

        {/* ── 조작부 ─────────────────────────────────────────── */}
        <rect x="18" y="224" width="204" height="102" rx="14" fill="url(#gm-body)" stroke="url(#gm-neon)" strokeWidth="2" />
        {/* 조이스틱 */}
        <g className={spinning ? "animate-stick" : undefined} style={{ transformOrigin: "84px 258px", transformBox: "view-box" }}>
          <rect x="80" y="244" width="8" height="18" rx="4" fill="#4c3f8a" />
          <circle cx="84" cy="242" r="11" fill="#a78bfa" />
          <circle cx="80" cy="238" r="3.4" fill="#ffffff" opacity="0.5" />
        </g>
        <ellipse cx="84" cy="264" rx="20" ry="7" fill="#151d3c" stroke="#3b4770" />
        {/* 버튼 */}
        <ellipse cx="150" cy="260" rx="17" ry="9" fill="#0d1530" stroke="#3b4770" />
        <ellipse cx="150" cy="257" rx="15" ry="8" fill="#22d3ee" opacity={spinning ? 1 : 0.65}
          className={spinning ? "animate-pulse-glow" : undefined} />

        {/* 배출구 */}
        <rect x="52" y="282" width="136" height="34" rx="9" fill="#070b18" stroke="url(#gm-neon)" strokeWidth="1.8" />
        <text x="120" y="304" textAnchor="middle" className="font-mono" fontSize="11" fill="#8a94ad" letterSpacing="2">
          PRIZE
        </text>

        {/* 떨어지는 캡슐 — reveal 후반부에 배출구로 */}
        {reveal && (
          <g className="animate-capsule-fall" style={{ transformOrigin: "120px 140px", transformBox: "view-box" }}>
            <circle cx="120" cy="140" r="11" fill="#ffb020" />
            <path d="M109 140a11 11 0 0 1 22 0z" fill="#ffffff" opacity="0.32" />
          </g>
        )}

        {/* 받침 */}
        <rect x="30" y="326" width="28" height="8" rx="4" fill="#1b2545" />
        <rect x="182" y="326" width="28" height="8" rx="4" fill="#1b2545" />
      </svg>

      {/* 배출구 섬광 */}
      {reveal && (
        <span
          className="pointer-events-none absolute left-1/2 top-[86%] size-28 -translate-x-1/2 -translate-y-1/2 animate-flash rounded-full bg-neon/70 blur-xl"
          style={{ animationDelay: "1.25s" }}
          aria-hidden
        />
      )}

      {spinning && (
        <p className="mt-2 text-center font-mono text-sm tracking-[0.3em] text-aqua" aria-live="polite">
          {LINES[line]}
        </p>
      )}
    </div>
  );
}
