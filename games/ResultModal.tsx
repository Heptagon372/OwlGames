"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Home, Ticket } from "lucide-react";
import { ExpBar } from "@/components/ExpBar";
import { LevelUpOverlay } from "@/components/LevelUpOverlay";
import { RankBadge } from "@/components/RankBadge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatNumber } from "@/lib/format";
import { GAMES } from "@/lib/games";
import { rankInfo } from "@/lib/rank";
import type { GameId, SubmitResult } from "@/lib/types";

const BAR_MS = 1400;

/** 결과 모달 (§7 공통) — 원점수 · 포인트 · 경험치 바 · 레벨업/랭크업 연출 · 티켓 알림 */
export function ResultModal({
  game,
  result,
  onRetry,
}: {
  game: GameId;
  result: SubmitResult;
  onRetry: () => void;
}) {
  const rankUp = result.rank_after > result.rank_before;
  const levelUp = result.level_after > result.level_before;
  const [overlay, setOverlay] = useState<null | "rank" | "level">(null);
  const [points, setPoints] = useState(0);

  // 포인트 카운트업
  useEffect(() => {
    if (result.status !== "ok") return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      setPoints(Math.round(result.points * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [result]);

  // 경험치 바가 다 찬 뒤 랭크업 연출
  useEffect(() => {
    if (!rankUp) return;
    const t = setTimeout(() => setOverlay("rank"), BAR_MS + 250);
    return () => clearTimeout(t);
  }, [rankUp]);

  const meta = GAMES[game];
  const before = result.total_points - result.points;

  if (result.status === "rejected") {
    return (
      <Modal open title="기록이 인정되지 않았어요" dismissible={false}>
        <p className="text-sm leading-relaxed text-mute">
          {result.reason ?? "플레이 시간이 정상 범위를 벗어났어요."}
          <br />
          포인트는 지급되지 않았어요. 다시 한 판 해볼까요?
        </p>
        <div className="mt-6 grid gap-2">
          <Button size="lg" block onClick={onRetry}>
            <RotateCcw className="size-5" /> 다시하기
          </Button>
          <ButtonLink href="/lobby" variant="ghost" block>
            로비로
          </ButtonLink>
        </div>
      </Modal>
    );
  }

  return (
    <>
      <Modal open title={`${meta.emoji} ${meta.title} 결과`} dismissible={false}>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-tile border border-line bg-night/60 p-4 text-center">
              <p className="text-xs text-mute">원점수</p>
              <p className="num mt-1 text-2xl font-black">
                {formatNumber(result.raw_score)}
                <span className="ml-1 text-sm text-mute">{meta.scoreUnit}</span>
              </p>
            </div>
            <div className="rounded-tile border border-neon/40 bg-neon/10 p-4 text-center">
              <p className="text-xs text-neon-soft">획득 포인트</p>
              <p className="num mt-1 text-2xl font-black text-neon">+{formatNumber(points)}P</p>
            </div>
          </div>

          <div className="rounded-tile border border-line bg-night/60 p-4">
            <div className="mb-3 flex items-center gap-3">
              <RankBadge rankIdx={result.rank_after} size="md" />
              <div className="min-w-0 flex-1">
                <p className="font-bold" style={{ color: rankInfo(result.rank_after).colors[0] }}>
                  {rankInfo(result.rank_after).name}
                </p>
                <p className="num text-xs text-mute">누적 {formatNumber(result.total_points)}P</p>
              </div>
            </div>
            <ExpBar
              points={result.total_points}
              fromPoints={before}
              durationMs={BAR_MS}
              onLevelUp={() => {
                if (!rankUp && levelUp) setOverlay("level");
              }}
            />
          </div>

          {result.tickets_gained > 0 && (
            <div className="flex items-center gap-2 rounded-tile border border-neon/50 bg-neon/10 px-4 py-3 font-extrabold text-neon">
              <Ticket className="size-5" />
              🎟️ 뽑기 티켓 +{result.tickets_gained}
            </div>
          )}

          <div className="grid gap-2">
            <Button size="lg" block onClick={onRetry}>
              <RotateCcw className="size-5" /> 다시하기
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <ButtonLink href="/lobby" variant="outline" block>
                <Home className="size-4" /> 로비
              </ButtonLink>
              <ButtonLink href="/ticket" variant="outline" block>
                <Ticket className="size-4" /> 티켓
              </ButtonLink>
            </div>
          </div>
        </div>
      </Modal>

      <LevelUpOverlay
        open={overlay !== null}
        kind={overlay === "rank" ? "rank" : "level"}
        level={result.level_after}
        rankIdx={result.rank_after}
        ticketsGained={overlay === "rank" ? result.tickets_gained : 0}
        onDone={() => setOverlay(null)}
      />
    </>
  );
}
