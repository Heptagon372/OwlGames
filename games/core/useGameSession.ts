"use client";

import { useCallback, useRef, useState } from "react";
import { fetchMyPosition } from "@/lib/client-queries";
import { startGameSession, submitGameSession } from "@/lib/rpc";
import type { GameId, SubmitResult } from "@/lib/types";
import type { GameEndMeta } from "./types";

export type Phase = "intro" | "starting" | "playing" | "submitting" | "result" | "error";

/** 세션 발급 → 플레이 → 제출. 점수·포인트 계산은 전부 서버 (§7 공통) */
export function useGameSession(game: GameId) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [meta, setMeta] = useState<GameEndMeta | null>(null);
  /** 제출 전/후 전체 등수 — 결과 화면에서 "14위 → 11위"로 보여준다 */
  const [position, setPosition] = useState<{ before: number | null; after: number | null }>({
    before: null,
    after: null,
  });
  const positionBefore = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionId = useRef<string | null>(null);
  const startedAt = useRef(0);

  const start = useCallback(async () => {
    setPhase("starting");
    setError(null);
    setResult(null);
    try {
      sessionId.current = await startGameSession(game);
      startedAt.current = Date.now();
      // 시작 시점 등수를 기억해 뒀다가 결과에서 변동을 보여준다
      fetchMyPosition()
        .then((p) => {
          positionBefore.current = p;
        })
        .catch(() => {});
      setPhase("playing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "게임을 시작할 수 없어요");
      setPhase("error");
    }
  }, [game]);

  const finish = useCallback(
    async (rawScore: number, meta: GameEndMeta) => {
      setPhase("submitting");
      setMeta(meta);
      try {
        const elapsed = (Date.now() - startedAt.current) / 1000;
        const res = await submitGameSession(sessionId.current ?? "", game, rawScore, {
          ...meta,
          client_elapsed_sec: Math.round(elapsed),
        });
        setResult(res);
        setPhase("result");
        fetchMyPosition()
          .then((after) => setPosition({ before: positionBefore.current, after }))
          .catch(() => setPosition({ before: positionBefore.current, after: null }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "결과 제출에 실패했어요");
        setPhase("error");
      }
    },
    [game],
  );

  const reset = useCallback(() => {
    sessionId.current = null;
    setResult(null);
    setMeta(null);
    setPosition({ before: null, after: null });
    setError(null);
    setPhase("intro");
  }, []);

  return { phase, result, meta, position, error, start, finish, reset };
}
