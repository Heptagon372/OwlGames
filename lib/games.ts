import type { GameId } from "./types";

export type GameMeta = {
  id: GameId;
  title: string;
  emoji: string;
  tagline: string;
  rules: string[];
  /** 제한 시간(초). flight는 최대 생존 시간 */
  duration: number;
  /** 원점수 단위 */
  scoreUnit: string;
  accent: "amber" | "cyan" | "rose";
};

export const GAMES: Record<GameId, GameMeta> = {
  typer: {
    id: "typer",
    title: "나이트 타이퍼",
    emoji: "⌨️",
    tagline: "떨어지는 명령어를 쳐서 방화벽을 뚫어라",
    rules: [
      "떨어지는 명령어를 정확히 입력하고 Enter",
      "바닥에 닿으면 방화벽 게이지 +20%, 100%면 종료",
      "연속 성공 시 콤보 ×1.2 → ×1.5 → ×2.0",
    ],
    duration: 60,
    scoreUnit: "점",
    accent: "amber",
  },
  flight: {
    id: "flight",
    title: "아울러닝",
    emoji: "🦉",
    tagline: "색을 맞추고, 몸집을 고르고, 날갯짓을 아끼며 더 멀리",
    rules: [
      "꾹 누르면 상승 · 떼면 활공 (에너지는 날갯짓할 때만 줄어요)",
      "색 게이트는 같은 색·도형으로 통과 — 틀려도 죽지 않고 에너지만 깎여요",
      "🪶 에너지 · 🟢🔵 크기 · 🛡️🌈 버프를 챙기며 더 멀리",
    ],
    duration: 180,
    scoreUnit: "점",
    accent: "cyan",
  },
  phish: {
    id: "phish",
    title: "피싱 헌터",
    emoji: "🎣",
    tagline: "진짜일까 피싱일까? 보안관 부엉이의 판별",
    rules: [
      "← 왼쪽 스와이프 = 🚨 피싱",
      "→ 오른쪽 스와이프 = ✅ 정상",
      "연속 정답 보너스, 오답은 −5초",
    ],
    duration: 90,
    scoreUnit: "점",
    accent: "rose",
  },
};

export const GAME_IDS = Object.keys(GAMES) as GameId[];

export function isGameId(v: string): v is GameId {
  return v in GAMES;
}

/** §7 공통: points = 30 + min(270, floor(raw / K)) — 표시·데모용. 실제 지급은 서버 */
export function estimatePoints(raw: number, k: number): number {
  return 30 + Math.min(270, Math.floor(Math.max(0, raw) / k));
}
