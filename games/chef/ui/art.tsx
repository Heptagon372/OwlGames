"use client";

// 🍳 그림 — 사용자 제공 리소스 시트 두 장에서 자른 그림 (public/assets/chef)
//   시트 1 (scripts/slice-chef-sheet.py): 음식 25종 · 재료 · 주방 도구 · 접시/쓰레기통/트레이
//   시트 2 (scripts/slice-chef-extras.py): 손님 8명(+얼굴) · 버그 4종 · UI 아이콘 · 연출 배지 · 장식
//
// 그림을 못 받았으면(네트워크·파일 없음) **이모지로 대신한다** — 그림 없이도 게임이 돈다 (아울러닝의 도형 폴백과 같은 원칙).
// 딸기는 시트에 없어서 늘 이모지다.

import { useState } from "react";
import type { ToolId } from "../config";
import { LOOKS } from "../engine/game";
import { ITEM, type ItemId } from "../data/items";
import { RECIPE, RECIPES, type RecipeId } from "../data/recipes";
import { TOOL_EMOJI } from "../theme";

const BASE = "/assets/chef";

/** 시트에 그림이 있는 재료 */
const ITEM_ART = new Set<ItemId>([
  "bun", "sausage", "patty", "cheese", "lettuce", "sauce", "potato", "spice", "tomato", "onion", "ham",
  "noodle", "egg", "chicken", "batter", "cream", "syrup", "meat", "rice", "seaweed", "fish",
]);

export type Prop = "plate" | "trash" | "tray";
export type UiName =
  | "heart" | "timer" | "star" | "combo" | "order" | "coin" | "play" | "gear" | "home"
  | "cancel" | "ok" | "warn" | "bugwarn" | "skull";
export type BadgeName =
  | "new" | "combo-bonus" | "fast" | "multi" | "done" | "time-low" | "time-out" | "bug-alert"
  | "infinite" | "bubble-order" | "bubble-time" | "gameover";
export type DecorName =
  | "sign" | "menu-board" | "hello" | "computer" | "server" | "chair" | "plant" | "lamps" | "counter" | "window"
  | "neon" | "banner" | "table" | "rug" | "trash" | "code-board" | "plant-shelf" | "cabinet" | "rack" | "sofa" | "flags";
export type BugLook = "green" | "red" | "blue" | "gold";

/** 손님 그림 수 (look 로 고른다) — 엔진이 같은 수로 겹치지 않게 고른다 */
export const CUSTOMER_LOOKS = LOOKS;

export const artUrl = {
  food: (id: RecipeId) => `${BASE}/food/${id}.webp`,
  item: (id: ItemId) => (ITEM_ART.has(id) ? `${BASE}/item/${id}.webp` : null),
  tool: (id: ToolId | Prop) => `${BASE}/tool/${id}.webp`,
  customer: (look: number) => `${BASE}/cust/c${(look % CUSTOMER_LOOKS) + 1}.webp`,
  face: (look: number) => `${BASE}/cust/f${(look % CUSTOMER_LOOKS) + 1}.webp`,
  bug: (b: BugLook) => `${BASE}/bug/${b}.webp`,
  ui: (n: UiName) => `${BASE}/ui/${n}.webp`,
  badge: (n: BadgeName) => `${BASE}/badge/${n}.webp`,
  decor: (n: DecorName) => `${BASE}/decor/${n}.webp`,
};

/** 첫 판 전에 미리 받아 둔다 (메뉴 화면에서 부른다) */
export function preloadArt(): void {
  if (typeof window === "undefined") return;
  const urls = [
    ...RECIPES.map((r) => artUrl.food(r.id)),
    ...[...ITEM_ART].map((id) => artUrl.item(id)!),
    ...(["board", "pan", "pot", "oven", "mixer", "plate", "trash", "tray"] as const).map(artUrl.tool),
    ...Array.from({ length: CUSTOMER_LOOKS }, (_, k) => [artUrl.customer(k), artUrl.face(k)]).flat(),
    ...(["green", "red", "blue", "gold"] as const).map(artUrl.bug),
    ...(["heart", "timer", "star", "combo", "coin", "ok", "cancel", "warn", "bugwarn"] as const).map(artUrl.ui),
    ...(["new", "fast", "combo-bonus", "multi", "done", "time-low", "time-out", "bug-alert", "bubble-order", "infinite"] as const).map(artUrl.badge),
    ...(["table", "lamps"] as const).map(artUrl.decor),
  ];
  for (const u of urls) {
    const img = new Image();
    img.decoding = "async";
    img.src = u;
  }
}

/**
 * 그림 한 장 — 실패하면 fallback (이모지 등).
 * size 는 정사각 상자, 가로로 긴 그림(배지·장식)은 w·h 를 따로 준다 (object-contain 이라 비율은 지킨다).
 */
export function Art({
  src,
  size,
  w,
  h,
  fallback = null,
  className = "",
  style,
}: {
  src: string | null;
  size?: number;
  w?: number | string;
  h?: number | string;
  fallback?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  // 실패는 그 주소에만 — 같은 자리(테이블)에 다른 그림이 오면 다시 시도한다
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return <>{fallback}</>;
  return (
    // 작은 아이콘을 수십 장 그려서 next/image 대신 그냥 img (크기 고정 · 지연 로딩 없음)
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      onError={() => setFailedSrc(src)}
      className={`pointer-events-none inline-block select-none object-contain ${className}`}
      style={{ width: w ?? size, height: h ?? size, ...style }}
    />
  );
}

export function UiIcon({ name, size = 20, className = "", fallback = null }: { name: UiName; size?: number; className?: string; fallback?: React.ReactNode }) {
  return <Art src={artUrl.ui(name)} size={size} className={className} fallback={fallback} />;
}

export function Badge({
  name,
  w,
  h,
  className = "",
  style,
  fallback = null,
}: {
  name: BadgeName;
  w?: number | string;
  h: number | string;
  className?: string;
  style?: React.CSSProperties;
  fallback?: React.ReactNode;
}) {
  return <Art src={artUrl.badge(name)} w={w ?? "auto"} h={h} className={className} style={style} fallback={fallback} />;
}

export function Decor({ name, w, h, className = "", style }: { name: DecorName; w?: number | string; h: number | string; className?: string; style?: React.CSSProperties }) {
  return <Art src={artUrl.decor(name)} w={w ?? "auto"} h={h} className={className} style={style} />;
}

export function BugArt({ look, size, className = "", fallback }: { look: BugLook; size: number; className?: string; fallback: React.ReactNode }) {
  return <Art src={artUrl.bug(look)} size={size} className={className} fallback={fallback} />;
}

function Emoji({ ch, size, className = "" }: { ch: string; size: number; className?: string }) {
  return (
    <span className={`inline-block text-center leading-none ${className}`} style={{ fontSize: size * 0.85, width: size }} aria-hidden>
      {ch}
    </span>
  );
}

export function DishIcon({ id, size = 28, className = "" }: { id: RecipeId; size?: number; className?: string }) {
  return <Art src={artUrl.food(id)} size={size} className={className} fallback={<Emoji ch={RECIPE[id].emoji} size={size} className={className} />} />;
}

export function ToolIcon({ tool, size = 20, className = "" }: { tool: ToolId; size?: number; className?: string }) {
  return <Art src={artUrl.tool(tool)} size={size} className={className} fallback={<Emoji ch={TOOL_EMOJI[tool]} size={size} className={className} />} />;
}

export function PropIcon({ prop, size = 20, className = "", style }: { prop: Prop; size?: number; className?: string; style?: React.CSSProperties }) {
  const ch = prop === "plate" ? "🍽️" : prop === "trash" ? "🗑️" : "▶";
  return <Art src={artUrl.tool(prop)} size={size} className={className} style={style} fallback={<Emoji ch={ch} size={size} className={className} />} />;
}

/** 재료 그림이 없을 때 (딸기 · 실패) 쓰는 이모지 */
export function itemEmoji(id: ItemId): string {
  return ITEM[id].emoji;
}
