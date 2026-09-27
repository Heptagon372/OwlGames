// 서버 보안 규칙의 TS 사본 (DECISIONS §5-27 · §5-28) — 테스트가 봇 판으로 "정상 플레이를 막지 않는지" 확인하는 용도.
// 원본은 supabase/migrations/20261009000000_security_v2.sql 의 security_play_sec. 바꾸면 양쪽을 같이.

import { bossesBefore } from "@/games/survive/config";
import type { GameId } from "./types";

/** app_config.security.play 기본값 */
export const PLAY_BOUND = {
  slackSec: 30,
  flightMinMps: 5,
  chefSecPerPlate: 30,
  owlisSecPerPiece: 15,
  surviveSecPerStage: 30,
  surviveSecPerBoss: 600,
} as const;

type Meta = Record<string, unknown>;
const num = (m: Meta, k: string): number | null => (typeof m[k] === "number" ? (m[k] as number) : null);

/**
 * 시간 포인트에 쓰는 "진행으로 증명되는 플레이 시간" =
 * min(서버 경과, duration_s + 3, 게임별 진행 한도). 방치·일시정지 시간만 잘린다.
 */
export function playSecBound(game: GameId, meta: Meta, elapsed: number, c = PLAY_BOUND): number {
  let v = Math.max(0, elapsed);
  const dur = num(meta, "duration_s");
  if (dur !== null) v = Math.min(v, Math.max(0, dur) + 3);
  const n = (k: string) => Math.max(0, num(meta, k) ?? 0);
  if (game === "flight") v = Math.min(v, n("distance_m") / c.flightMinMps + c.slackSec);
  else if (game === "chef") v = Math.min(v, (n("served_total") + 1) * c.chefSecPerPlate + c.slackSec);
  else if (game === "owlis") v = Math.min(v, (n("pieces") + 1) * c.owlisSecPerPiece + c.slackSec);
  else if (game === "survive") {
    const stage = Math.min(Math.max(1, Math.floor(num(meta, "stage") ?? 1)), 100_000);
    v = Math.min(v, stage * c.surviveSecPerStage + bossesBefore(stage + 1) * c.surviveSecPerBoss + c.slackSec);
  }
  return Math.max(0, v);
}
