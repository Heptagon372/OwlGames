"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Home, Ticket } from "lucide-react";
import { ExpBar } from "@/components/ExpBar";
import { LevelUpOverlay } from "@/components/LevelUpOverlay";
import { RankBadge } from "@/components/RankBadge";
import { DeltaChip, recordPosition } from "@/components/RankDelta";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatNumber } from "@/lib/format";
import { GAMES } from "@/lib/games";
import { rankInfo } from "@/lib/rank";
import type { GameId, SubmitResult } from "@/lib/types";

const BAR_MS = 1400;

/** 게임별 상세 기록 (아울러닝 §12 결과 화면) */
function gameStats(game: GameId, meta: Record<string, unknown> | null): { label: string; value: string }[] {
  if (!meta) return [];
  const n = (k: string) => (typeof meta[k] === "number" ? (meta[k] as number) : 0);
  if (game === "flight") {
    const stats = [
      { label: "거리", value: `${formatNumber(n("distance_m"))} m` },
      { label: "최고 콤보", value: formatNumber(n("combo_max")) },
      { label: "NEAR MISS", value: formatNumber(n("near_miss")) },
      { label: "아이템", value: `${formatNumber(n("items"))}개` },
      { label: "도달 페이즈", value: `P${n("phase_max")}` },
    ];
    if (n("special_cleared") > 0) stats.push({ label: "특수 구간", value: `${n("special_cleared")}회 완주` });
    return stats;
  }
  if (game === "logic") {
    const stats = [
      { label: "해결", value: `${formatNumber(n("solved"))}문제` },
      { label: "최적화", value: `${formatNumber(n("optimal"))}회` },
      { label: "최고 티어", value: `T${n("tier_max")}` },
      { label: "최고 콤보", value: formatNumber(n("combo_max")) },
      { label: "힌트", value: `${formatNumber(n("hints"))}회` },
      { label: "평균 풀이", value: `${(n("avg_solve_ms") / 1000).toFixed(1)}초` },
    ];
    return stats;
  }
  if (game === "space") {
    const stats = [
      { label: "스테이지", value: `STAGE ${n("stage")}${meta.cleared ? " 클리어" : ""}` },
      { label: "생존", value: `${formatNumber(n("duration_s"))}초` },
      { label: "처치", value: formatNumber(n("kills")) },
      { label: "GRAZE", value: `${formatNumber(n("graze"))} ⭐` },
      { label: "남은 생명", value: "🦉".repeat(Math.max(0, n("lives_left"))) || "없음" },
      { label: "피격", value: n("damage_taken") === 0 ? "무피격 ✨" : `${n("damage_taken")}회` },
    ];
    if (meta.boss_killed) stats.push({ label: "보스", value: "격파 ✅" });
    return stats;
  }
  if (game === "survive") {
    const stats = [
      { label: "스테이지", value: `STAGE ${n("stage")}${meta.cleared ? " 클리어" : ""}` },
      { label: "생존", value: `${formatNumber(n("duration_s"))}초` },
      { label: "처치", value: `${formatNumber(n("kills"))} (장애물 ${n("obstacles")})` },
      { label: "레벨", value: `Lv.${n("level")}` },
      { label: "진화", value: `${formatNumber(n("evolutions"))}개` },
      { label: "피격", value: n("damage_taken") === 0 ? "무피격 ✨" : `${n("damage_taken")}회` },
    ];
    if (n("revives_used") > 0) stats.push({ label: "부활", value: `${n("revives_used")}회` });
    return stats;
  }
  if (game === "typer") {
    return [
      { label: "파괴", value: `${formatNumber(n("hits"))}개` },
      { label: "놓침", value: `${formatNumber(n("misses"))}개` },
      { label: "최고 콤보", value: formatNumber(n("max_combo")) },
      { label: "도달 단계", value: `STAGE ${n("stage_max") || 1}` },
    ];
  }
  return [
    { label: "정답", value: `${formatNumber(n("correct"))}개` },
    { label: "오답", value: `${formatNumber(n("wrong"))}개` },
    { label: "최고 연속", value: formatNumber(n("max_streak")) },
    { label: "도달 단계", value: `STAGE ${n("stage_max") || 1}` },
  ];
}

/** 결과 모달 (§7 공통) — 원점수 · 포인트 · 경험치 바 · 레벨업/랭크업 연출 · 티켓 알림 */
export function ResultModal({
  game,
  result,
  meta,
  position,
  onRetry,
}: {
  game: GameId;
  result: SubmitResult;
  meta?: Record<string, unknown> | null;
  /** 제출 전/후 전체 등수 */
  position?: { before: number | null; after: number | null };
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

  // 등수가 확정되면 다음 판을 위해 기록해 둔다
  useEffect(() => {
    if (typeof position?.after === "number") recordPosition(position.after);
  }, [position?.after]);

  // 경험치 바가 다 찬 뒤 랭크업 연출
  useEffect(() => {
    if (!rankUp) return;
    const t = setTimeout(() => setOverlay("rank"), BAR_MS + 250);
    return () => clearTimeout(t);
  }, [rankUp]);

  const gameMeta = GAMES[game];
  const stats = gameStats(game, meta ?? null);
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
      <Modal open title={`${gameMeta.emoji} ${gameMeta.title} 결과`} dismissible={false}>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="glass rounded-tile p-4 text-center">
              <p className="text-xs text-mute">원점수</p>
              <p className="num mt-1 text-2xl font-black">
                {formatNumber(result.raw_score)}
                <span className="ml-1 text-sm text-mute">{gameMeta.scoreUnit}</span>
              </p>
            </div>
            <div className="grad-line glow-iris glass rounded-tile p-4 text-center">
              <p className="text-xs text-neon-soft">획득 포인트</p>
              <p className="num grad-text mt-1 text-2xl font-black">+{formatNumber(points)}P</p>
            </div>
          </div>

          {stats.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 glass rounded-tile px-4 py-3 text-sm">
              {stats.map((s) => (
                <div key={s.label} className="flex items-center justify-between gap-2">
                  <dt className="text-mute">{s.label}</dt>
                  <dd className="num font-bold">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {typeof position?.after === "number" && (
            <div className="flex items-center justify-between gap-3 rounded-tile border border-aqua/40 bg-aqua/10 px-4 py-3">
              <span className="text-sm font-bold text-aqua">전체 등수</span>
              <span className="flex items-center gap-2">
                {typeof position.before === "number" && position.before !== position.after && (
                  <span className="num text-sm text-mute line-through">{position.before}위</span>
                )}
                <span className="num text-xl font-black text-aqua">{position.after}위</span>
                <DeltaChip from={position.before} to={position.after} />
              </span>
            </div>
          )}

          <div className="glass rounded-tile p-4">
            <div className="mb-3 flex items-center gap-3">
              <RankBadge rankIdx={result.rank_after} size="md" />
              <div className="min-w-0 flex-1">
                <p className="rank-ink font-bold" style={{ color: rankInfo(result.rank_after).colors[0] }}>
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

          {(result.owl_energy_gained ?? 0) > 0 && (
            <div className="flex items-center gap-2 rounded-tile border border-amber/50 bg-amber/10 px-4 py-3 font-extrabold text-amber-soft">
              🦉 아울 에너지 +{result.owl_energy_gained}
              {typeof result.owl_energy === "number" && (
                <span className="num ml-auto text-sm font-bold text-mute">보유 {result.owl_energy}</span>
              )}
            </div>
          )}

          {result.tickets_gained > 0 && (
            <div className="flex items-center gap-2 rounded-tile border border-amber/50 bg-amber/10 px-4 py-3 font-extrabold text-amber-soft">
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
