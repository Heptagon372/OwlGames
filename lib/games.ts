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
    title: "올빼미 비행",
    emoji: "🦉",
    tagline: "한밤 캠퍼스를 날아라 — 원버튼 아케이드",
    rules: [
      "탭 · 클릭 · 스페이스 = 날갯짓",
      "가로등 · 전깃줄 · 🐛 버그를 피하기",
      "☕ 커피 = 3초 무적, ⭐ 별 = +20",
    ],
    duration: 180,
    scoreUnit: "m",
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
