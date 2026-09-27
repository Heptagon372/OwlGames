// 🍳 아울 레스토랑 — 색 역할 (GDD §21)
//
// 화면이 전부 DOM 이라 플랫폼 토큰(`text-ink`·`glass`·`bg-ok` …)을 그대로 쓰고 다크/라이트를 따른다.
// 여기에는 토큰에 없는 게임 전용 색만 둔다.
//   · 완성·다 된 칸 = aqua 발광 · 선택된 접시 = neon(바이올렛) 테두리
//   · 버그 = alert 빨강 + RGB 갈라짐 (다른 무엇과도 같아 보이면 안 된다)
//   · 인내도 = 초록 → 노랑 → 빨강. amber 는 플랫폼에서 부엉이·에너지·티켓 전용이라 노랑은 다른 톤을 쓴다

import type { ToolId } from "./config";

export const TOOL_EMOJI: Record<ToolId, string> = {
  board: "🔪",
  pan: "🍳",
  pot: "🍲",
  oven: "🔥",
  mixer: "🥤",
};

/** 키보드 힌트 (도구) */
export const TOOL_KEY: Record<ToolId, string> = { board: "Q", pan: "W", pot: "E", oven: "R", mixer: "T" };

/** 재료 키 — ITEMS 순서 그대로 (재료가 늘어나도 같은 재료는 같은 키) */
export const ITEM_KEYS = [
  "KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon",
  "KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash",
  "KeyY", "KeyU",
] as const;

export function keyLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  return { Semicolon: ";", Comma: ",", Period: ".", Slash: "/" }[code] ?? code;
}

/** 인내도 비율 → 색 */
export function patienceColor(ratio: number): string {
  if (ratio > 0.5) return "var(--color-ok)";
  if (ratio > 0.25) return "#facc15";
  return "var(--color-alert)";
}

/** 손님 후드티 색 (look 으로 고른다) */
export const HOODIES = ["#7c9cff", "#a78bfa", "#22d3ee", "#e879f9", "#4ade80", "#fb7185", "#94a3b8", "#f472b6"] as const;
