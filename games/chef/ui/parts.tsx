"use client";

// 🍳 작은 그림들 — 재료 아이콘 · 손님 부엉이 · 버그 · 원형 타이머.
// 재료는 리소스 시트 그림(ui/art.tsx), 그림이 없거나 못 받으면 이모지. 손님·버그·타이머는 코드로 그린 SVG.

import type { ItemId } from "../data/items";
import { ITEM } from "../data/items";
import { HOODIES } from "../theme";
import { Art, artUrl } from "./art";


function ItemFallback({ item, size, className }: { item: ItemId; size: number; className: string }) {
  if (item === "seaweed") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
        <rect x="3" y="4" width="18" height="16" rx="2.5" fill="#1f3d27" />
        <rect x="3" y="4" width="18" height="16" rx="2.5" fill="none" stroke="#3f7a4d" strokeWidth="1.2" />
        <path d="M6 9h12M6 13h12M6 17h8" stroke="#2f6b3d" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <span className={`inline-block leading-none ${className}`} style={{ fontSize: size * 0.9, width: size, textAlign: "center" }} aria-hidden>
      {ITEM[item].emoji}
    </span>
  );
}

/** 재료 그림 */
export function ItemIcon({ item, size = 24, className = "" }: { item: ItemId; size?: number; className?: string }) {
  return <Art src={artUrl.item(item)} size={size} className={className} fallback={<ItemFallback item={item} size={size} className={className} />} />;
}

/** 원형 타이머 (0~1) */
export function Ring({ p, size = 40, color = "var(--color-aqua)", width = 3 }: { p: number; size?: number; color?: string; width?: number }) {
  const r = size / 2 - width;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="pointer-events-none absolute inset-0 m-auto -rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line-strong)" strokeWidth={width} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(1, p)))}
        style={{ transition: "stroke-dashoffset 90ms linear" }}
      />
    </svg>
  );
}

/** 개발자 부엉이 손님 — 후드티 색·안경은 look 으로 고른다. mood: 0 편안 · 1 굳음 · 2 급함 · 3 화남 · 4 행복 */
export function Customer({ look, mood, size = 56 }: { look: number; mood: number; size?: number }) {
  const hoodie = HOODIES[look % HOODIES.length];
  const glasses = (look >> 3) % 3 === 0;
  const eyeY = mood === 3 ? 25 : 24;
  const brow =
    mood >= 2 && mood !== 4 ? (
      <>
        <path d="M17 17 L26 20" stroke="#1b1f33" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M47 17 L38 20" stroke="#1b1f33" strokeWidth="2.4" strokeLinecap="round" />
      </>
    ) : null;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={mood === 3 ? "animate-jitter" : ""}>
      {/* 몸 = 후드티 */}
      <path d="M10 62 C10 44 20 38 32 38 C44 38 54 44 54 62 Z" fill={hoodie} />
      <path d="M26 40 L32 48 L38 40" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="2" />
      {/* 머리 */}
      <ellipse cx="32" cy="26" rx="20" ry="18" fill="#8a6a4f" />
      <path d="M13 12 L20 18 L16 22 Z M51 12 L44 18 L48 22 Z" fill="#6d523c" />
      <ellipse cx="32" cy="30" rx="15" ry="12" fill="#e9d6bd" />
      {/* 눈 */}
      <circle cx="24" cy={eyeY} r="6.2" fill="#fff" />
      <circle cx="40" cy={eyeY} r="6.2" fill="#fff" />
      {mood === 4 ? (
        <>
          <path d="M20 25 Q24 21 28 25" stroke="#1b1f33" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M36 25 Q40 21 44 25" stroke="#1b1f33" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="24" cy={eyeY + 0.5} r={mood === 3 ? 2 : 2.8} fill="#1b1f33" />
          <circle cx="40" cy={eyeY + 0.5} r={mood === 3 ? 2 : 2.8} fill="#1b1f33" />
        </>
      )}
      {glasses && (
        <g fill="none" stroke="#1b1f33" strokeWidth="1.6">
          <rect x="16.5" y={eyeY - 6.5} width="15" height="12" rx="4" />
          <rect x="32.5" y={eyeY - 6.5} width="15" height="12" rx="4" />
        </g>
      )}
      {brow}
      {/* 부리 */}
      <path d="M29 31 L35 31 L32 36 Z" fill="#f5a524" />
      {mood === 3 && <path d="M50 6 l3 6 M54 4 l-1 7 M57 9 l-5 4" stroke="var(--color-alert)" strokeWidth="2.2" strokeLinecap="round" />}
    </svg>
  );
}

/** 🐛 버그 — 빨간 몸 + RGB 갈라짐 */
export function BugSprite({ size = 30, className = "" }: { size?: number; className?: string }) {
  const body = (dx: number, color: string, op = 1) => (
    <g transform={`translate(${dx} 0)`} opacity={op}>
      <ellipse cx="16" cy="18" rx="8" ry="10" fill={color} />
      <circle cx="16" cy="7" r="4.5" fill={color} />
      <path d="M13 4 L9 0 M19 4 L23 0" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 14 L2 11 M8 19 L1 19 M8 24 L2 27 M24 14 L30 11 M24 19 L31 19 M24 24 L30 27" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </g>
  );
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden style={{ overflow: "visible" }}>
      {body(-1.6, "#22d3ee", 0.55)}
      {body(1.6, "#e879f9", 0.55)}
      {body(0, "#ff3b5c")}
      <path d="M16 11 V28" stroke="rgba(0,0,0,0.35)" strokeWidth="1.2" />
      <circle cx="14.4" cy="6.4" r="1" fill="#fff" />
      <circle cx="17.6" cy="6.4" r="1" fill="#fff" />
    </svg>
  );
}

/**
 * 손님 — 시트의 손님 8명 중 하나(look), 못 받으면 위의 SVG 부엉이.
 * 기분은 그림을 바꾸지 않고 효과로: 2 급함 = 노란 번짐 · 3 화남 = 빨간 번짐 + 떨림 · 4 행복(떠남) = 살짝 커짐
 */
export function CustomerSprite({ look, mood, size }: { look: number; mood: number; size: number }) {
  const filter =
    mood === 3
      ? "drop-shadow(0 0 7px var(--color-alert)) saturate(1.15)"
      : mood === 2
        ? "drop-shadow(0 0 6px #facc15)"
        : "drop-shadow(0 3px 4px rgba(0,0,0,0.35))";
  return (
    <Art
      src={artUrl.customer(look)}
      size={size}
      className={`${mood === 3 ? "animate-jitter" : ""} ${mood === 4 ? "scale-110" : ""} transition-transform`}
      style={{ filter }}
      fallback={<Customer look={look} mood={mood} size={size} />}
    />
  );
}
