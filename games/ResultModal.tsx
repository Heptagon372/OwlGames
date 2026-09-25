"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Home, Ticket } from "lucide-react";
import { useTranslations } from "next-intl";
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

type Stat = { label: string; value: string };
type T = (key: string, values?: Record<string, string | number>) => string;

/** 게임별 상세 기록 (아울러닝 §12 결과 화면). 라벨·단위는 전부 `result.stats` 메시지에서 온다 */
function gameStats(game: GameId, meta: Record<string, unknown> | null, t: T): Stat[] {
  if (!meta) return [];
  const n = (k: string) => (typeof meta[k] === "number" ? (meta[k] as number) : 0);
  const stage = () =>
    meta.cleared ? t("stageCleared", { stage: n("stage") }) : t("stageValue", { stage: n("stage") });
  const damage = () => (n("damage_taken") === 0 ? t("noDamage") : t("times", { count: n("damage_taken") }));

  if (game === "flight") {
    const stats = [
      { label: t("distance"), value: `${formatNumber(n("distance_m"))} m` },
      { label: t("comboMax"), value: formatNumber(n("combo_max")) },
      { label: t("nearMiss"), value: formatNumber(n("near_miss")) },
      { label: t("items"), value: t("count", { count: formatNumber(n("items")) }) },
      { label: t("phase"), value: `P${n("phase_max")}` },
    ];
    if (n("special_cleared") > 0) {
      stats.push({ label: t("special"), value: t("specialValue", { count: n("special_cleared") }) });
    }
    return stats;
  }
  if (game === "logic") {
    return [
      { label: t("solved"), value: t("solvedValue", { count: formatNumber(n("solved")) }) },
      { label: t("optimal"), value: t("times", { count: formatNumber(n("optimal")) }) },
      { label: t("tierMax"), value: `T${n("tier_max")}` },
      { label: t("comboMax"), value: formatNumber(n("combo_max")) },
      { label: t("hints"), value: t("times", { count: formatNumber(n("hints")) }) },
      { label: t("avgSolve"), value: t("seconds", { sec: (n("avg_solve_ms") / 1000).toFixed(1) }) },
    ];
  }
  if (game === "space") {
    const stats = [
      { label: t("stage"), value: stage() },
      { label: t("survived"), value: t("seconds", { sec: formatNumber(n("duration_s")) }) },
      { label: t("kills"), value: formatNumber(n("kills")) },
      { label: t("graze"), value: `${formatNumber(n("graze"))} ⭐` },
      { label: t("livesLeft"), value: "🦉".repeat(Math.max(0, n("lives_left"))) || t("none") },
      { label: t("damage"), value: damage() },
    ];
    if (meta.boss_killed) stats.push({ label: t("bossKilled"), value: t("bossKilledValue") });
    return stats;
  }
  if (game === "survive") {
    const stats = [
      { label: t("stage"), value: stage() },
      { label: t("survived"), value: t("seconds", { sec: formatNumber(n("duration_s")) }) },
      {
        label: t("kills"),
        value: t("killsWithObstacles", { kills: formatNumber(n("kills")), obstacles: n("obstacles") }),
      },
      { label: t("levelReached"), value: `Lv.${n("level")}` },
      { label: t("evolutions"), value: t("count", { count: formatNumber(n("evolutions")) }) },
      { label: t("damage"), value: damage() },
    ];
    if (n("revives_used") > 0) stats.push({ label: t("revives"), value: t("times", { count: n("revives_used") }) });
    return stats;
  }
  if (game === "typer") {
    return [
      { label: t("destroyed"), value: t("count", { count: formatNumber(n("hits")) }) },
      { label: t("missed"), value: t("count", { count: formatNumber(n("misses")) }) },
      { label: t("comboMax"), value: formatNumber(n("max_combo")) },
      { label: t("stage"), value: t("stageValue", { stage: n("stage_max") || 1 }) },
    ];
  }
  return [
    { label: t("correct"), value: t("count", { count: formatNumber(n("correct")) }) },
    { label: t("wrong"), value: t("count", { count: formatNumber(n("wrong")) }) },
    { label: t("maxStreak"), value: formatNumber(n("max_streak")) },
    { label: t("stage"), value: t("stageValue", { stage: n("stage_max") || 1 }) },
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
  const t = useTranslations("result");
  const ts = useTranslations("result.stats");
  const tc = useTranslations("common");
  const tg = useTranslations("games");
  const tn = useTranslations("nav");
  const tr = useTranslations("ranks");
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
  const title = tg(`${game}.title`);
  const stats = gameStats(game, meta ?? null, ts);
  const before = result.total_points - result.points;

  if (result.status === "rejected") {
    return (
      <Modal open title={t("rejectedTitle")} dismissible={false}>
        <p className="text-sm leading-relaxed text-mute">
          {result.reason ?? t("rejectedDefault")}
          <br />
          {t("rejectedNote")}
        </p>
        <div className="mt-6 grid gap-2">
          <Button size="lg" block onClick={onRetry}>
            <RotateCcw className="size-5" /> {tc("retry")}
          </Button>
          <ButtonLink href="/lobby" variant="ghost" block>
            {tc("toLobby")}
          </ButtonLink>
        </div>
      </Modal>
    );
  }

  return (
    <>
      <Modal open title={`${gameMeta.emoji} ${t("title", { title })}`} dismissible={false}>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="glass rounded-tile p-4 text-center">
              <p className="text-xs text-mute">{t("raw")}</p>
              <p className="num mt-1 text-2xl font-black">
                {formatNumber(result.raw_score)}
                <span className="ml-1 text-sm text-mute">{gameMeta.scoreUnit}</span>
              </p>
            </div>
            <div className="card-neon rounded-tile p-4 text-center">
              <p className="text-xs text-neon-soft">{t("gained")}</p>
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
              <span className="text-sm font-bold text-aqua">{t("position")}</span>
              <span className="flex items-center gap-2">
                {typeof position.before === "number" && position.before !== position.after && (
                  <span className="num text-sm text-mute line-through">
                    {t("positionValue", { n: position.before })}
                  </span>
                )}
                <span className="num text-xl font-black text-aqua">{t("positionValue", { n: position.after })}</span>
                <DeltaChip from={position.before} to={position.after} />
              </span>
            </div>
          )}

          <div className="glass rounded-tile p-4">
            <div className="mb-3 flex items-center gap-3">
              <RankBadge rankIdx={result.rank_after} size="md" />
              <div className="min-w-0 flex-1">
                <p className="rank-ink font-bold" style={{ color: rankInfo(result.rank_after).colors[0] }}>
                  {tr(String(result.rank_after))}
                </p>
                <p className="num text-xs text-mute">{t("totalPoints", { points: formatNumber(result.total_points) })}</p>
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
              {t("energyGained", { count: result.owl_energy_gained ?? 0 })}
              {typeof result.owl_energy === "number" && (
                <span className="num ml-auto text-sm font-bold text-mute">
                  {t("energyHave", { count: result.owl_energy })}
                </span>
              )}
            </div>
          )}

          {result.tickets_gained > 0 && (
            <div className="flex items-center gap-2 rounded-tile border border-amber/50 bg-amber/10 px-4 py-3 font-extrabold text-amber-soft">
              <Ticket className="size-5" />
              {t("ticketGained", { count: result.tickets_gained })}
            </div>
          )}

          <div className="grid gap-2">
            <Button size="lg" block onClick={onRetry}>
              <RotateCcw className="size-5" /> {tc("retry")}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <ButtonLink href="/lobby" variant="outline" block>
                <Home className="size-4" /> {tc("toLobby")}
              </ButtonLink>
              <ButtonLink href="/ticket" variant="outline" block>
                <Ticket className="size-4" /> {tn("ticket")}
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
