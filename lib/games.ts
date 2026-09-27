import type { GamePoints } from "./config";
import type { GameId, RetiredGameId } from "./types";

export type GameMeta = {
  id: GameId;
  title: string;
  emoji: string;
  tagline: string;
  rules: string[];
  /** 제한 시간(초). flight·survive·owlis는 최대 생존 시간 */
  duration: number;
  /** 화면에 그대로 쓰는 시간 표기 (게임마다 "최대"·"부터"가 달라서 문구로 들고 있는다) */
  durationLabel: string;
  /** 원점수 단위 */
  scoreUnit: string;
  accent: "amber" | "cyan" | "rose";
};

export const GAMES: Record<GameId, GameMeta> = {
  flight: {
    id: "flight",
    title: "아울러닝",
    emoji: "🦉",
    tagline: "색을 맞추고, 장애물을 피하고, 능력을 발동시켜 어디까지?",
    rules: [
      "꾹 누르면 상승 · 떼면 활공 — 색 게이트는 같은 색으로 PERFECT",
      "레이저·미사일·중력 반전… 단계마다 새 위기가 와요 (벽만 즉사)",
      "NEAR MISS·PERFECT로 🔥 FEVER, 10연속이면 COLOR POWER (Q)",
    ],
    duration: 180,
    durationLabel: "최대 180초",
    scoreUnit: "점",
    accent: "cyan",
  },
  survive: {
    id: "survive",
    title: "아울 서바이버즈",
    emoji: "🛡️",
    tagline: "끝없는 전장에서 살아남아라",
    rules: [
      "이동만 하세요 — 공격은 전부 자동 (가로 화면)",
      "단계마다 새 도형이 나오고, 보스를 잡아야 넘어가요",
      "15단계 십오각형을 잡으면 무한 진행",
    ],
    duration: 2400,
    durationLabel: "무한 생존",
    scoreUnit: "점",
    accent: "rose",
  },
  owlis: {
    id: "owlis",
    title: "아울리스",
    emoji: "🧩",
    tagline: "네가 잘할수록, 상대 AI도 강해진다",
    rules: [
      "두 칸짜리 아울 블록을 돌려 쌓고, 같은 색 4개가 붙으면 터져요",
      "터진 뒤 떨어진 블록이 또 붙으면 연쇄(COMBO) — 연쇄가 길수록 AI에게 방해 블록을 보내요",
      "AI는 내 실력을 보고 LEVEL 1 → 5 → 5+ 로 진화해요. 내 필드가 차면 끝",
    ],
    duration: 1800,
    durationLabel: "무한 (패배할 때까지)",
    scoreUnit: "점",
    accent: "cyan",
  },
  chef: {
    id: "chef",
    title: "아울 레스토랑",
    emoji: "🍳",
    tagline: "코드를 요리하고, 버그를 피해라!",
    rules: [
      "손님이 주문한 코딩 음식을 레시피 순서대로 쌓아 제출해요",
      "도마·팬·냄비·오븐·믹서를 동시에 돌려 여러 테이블을 챙겨요",
      "🐛 버그가 앉은 테이블엔 내면 안 돼요. 손님 한 명이라도 기다리다 지치면 끝",
    ],
    duration: 1200,
    durationLabel: "25단계 + 무한",
    scoreUnit: "점",
    accent: "amber",
  },
};

export const GAME_IDS = Object.keys(GAMES) as GameId[];

export function isGameId(v: string): v is GameId {
  return Object.prototype.hasOwnProperty.call(GAMES, v);
}

/**
 * 내린 게임 (행사 중 교체). DB 에는 예전 세션·통계가 남아 있으니 **기록을 그릴 때만** 쓴다.
 * 로비·랭킹 탭·게임 라우트에는 나오지 않는다 (`GAMES` 에 없으므로).
 */
export const RETIRED_GAMES: Record<RetiredGameId, { emoji: string; title: string }> = {
  typer: { emoji: "⌨️", title: "나이트 타이퍼" },
  logic: { emoji: "🔌", title: "아울 로직" },
  phish: { emoji: "🎣", title: "피싱 헌터" },
  space: { emoji: "🚀", title: "아울스페이스" },
};

/** 세션 행의 game 값 → 이모지 (내린 게임도 안전하게) */
export function gameEmoji(id: string): string {
  if (isGameId(id)) return GAMES[id].emoji;
  return RETIRED_GAMES[id as RetiredGameId]?.emoji ?? "🎮";
}

/** 세션 행의 game 값 → 한국어 이름 (관리자 화면용 — 플레이어 화면은 messages 의 games.* 를 쓴다) */
export function gameTitleKo(id: string): string {
  if (isGameId(id)) return GAMES[id].title;
  return RETIRED_GAMES[id as RetiredGameId]?.title ?? id;
}

/**
 * 포인트 = 기본 + floor(플레이 초 / 60 × 분당[게임]) + floor(원점수 / K[게임]) — 상한 없음.
 * DB `public.game_points` 와 같은 식 (표시용 — 실제 지급은 서버, 시간은 서버 시계).
 */
export function estimatePoints(game: GameId, raw: number, sec: number, cfg: GamePoints, k: number): number {
  const rate = cfg.per_min[game] ?? 0;
  const byRaw = k > 0 ? Math.floor(Math.max(0, raw) / k) : 0;
  return Math.floor(cfg.base) + Math.floor((Math.max(0, sec) / 60) * rate) + byRaw;
}
