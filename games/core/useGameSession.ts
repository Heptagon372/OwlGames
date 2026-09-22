"use client";

import { useCallback, useRef, useState } from "react";
import { startGameSession, submitGameSession } from "@/lib/rpc";
import type { GameId, SubmitResult } from "@/lib/types";
import type { GameEndMeta } from "./types";

export type Phase = "intro" | "starting" | "playing" | "submitting" | "result" | "error";

/** 세션 발급 → 플레이 → 제출. 점수·포인트 계산은 전부 서버 (§7 공통) */
export function useGameSession(game: GameId) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [meta, setMeta] = useState<GameEndMeta | null>(null);
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
    setError(null);
    setPhase("intro");
  }, []);

  return { phase, result, meta, error, start, finish, reset };
}
