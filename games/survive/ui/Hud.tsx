"use client";

// 🦉 아울 서바이버즈 v3 — HUD + 전투 로그 (기획서 §9.2 · §10.2)
// HUD 총 면적 15% 이하. 색은 전부 테마에서 온다 (다크/라이트 둘 다 대비 확보).
// 엔진은 문구 대신 메시지 키를 담고, 여기서 번역한다 (`games/core/i18n.ts`).

import { useTranslations } from "next-intl";
import { text, type Msg } from "@/games/core/i18n";
import type { BossKind } from "../data/stages";
import type { Theme } from "../theme";
import type { LogLine, LogTag } from "../types";

export type HudState = {
  hp: number;
  maxHp: number;
  elapsed: number;
  stage: number;
  /** 다음 단계까지 남은 초 (보스 단계면 null) */
  stageLeft: number | null;
  endless: boolean;
  kills: number;
  level: number;
  xp: number;
  xpNext: number;
  actives: { emoji: string; lv: number; evolved: boolean }[];
  passives: { emoji: string; lv: number }[];
  boss: {
    kind: BossKind;
    hp: number;
    maxHp: number;
    /** 십오각형 제한 시간 */
    timeLeft: number | null;
    /** 십오각형 분노 0~1 */
    rage: number | null;
    /** 시한폭탄 도화선 */
    fuse: number | null;
    /** 구각형 포식 게이지 0~1 */
    gauge: number | null;
  } | null;
  banner: { m: Msg; sub: Msg } | null;
  log: LogLine[];
};

const LOG_COLOR: Record<LogTag, (t: Theme) => string> = {
  INFO: (t) => t.dim,
  WARN: (t) => t.accent,
  CRIT: (t) => t.mine,
  DROP: (t) => t.hp,
  EVO: () => "#FACC15",
  ALERT: (t) => t.boss,
  FATAL: (t) => t.danger,
};

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Hud({ hud, theme, action }: { hud: HudState; theme: Theme; /** 상단바 오른쪽 끝 버튼 (⏸) */ action?: React.ReactNode }) {
  const t = useTranslations("hud.survive");
  const hpRatio = Math.max(0, hud.hp / hud.maxHp);
  const xpRatio = Math.max(0, Math.min(1, hud.xp / hud.xpNext));
  const low = hpRatio <= 0.3;
  const boss = hud.boss;

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* 상단바 */}
      <div
        className="flex items-center gap-3 px-3 py-1.5"
        style={{ background: `linear-gradient(${theme.bg}dd, transparent)` }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-28 overflow-hidden rounded-full sm:w-40" style={{ background: `${theme.dim}40` }}>
              <div
                className="h-full rounded-full transition-[width] duration-150"
                style={{ width: `${hpRatio * 100}%`, background: low ? theme.danger : theme.hp }}
              />
            </div>
            <span className="num text-[11px] font-bold" style={{ color: low ? theme.danger : theme.text }}>
              {Math.max(0, Math.round(hud.hp))}/{Math.round(hud.maxHp)}
            </span>
          </div>
        </div>

        <span className="num text-lg font-black tabular-nums" style={{ color: theme.text }}>
          {fmtTime(hud.elapsed)}
        </span>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
          <span className="arcade text-[10px]" style={{ color: theme.accent }}>
            {t("ui.stage", { stage: hud.stage })}
            {hud.endless && <span className="ml-1">{t("ui.endless")}</span>}
          </span>
          <span className="num text-[11px]" style={{ color: theme.dim }}>
            {t("ui.kill", { n: hud.kills })}
          </span>
          {action}
        </div>
      </div>

      {/* XP 바 */}
      <div className="mx-3 h-2 overflow-hidden rounded-full" style={{ background: `${theme.dim}33` }}>
        <div className="h-full rounded-full" style={{ width: `${xpRatio * 100}%`, background: theme.xp }} />
      </div>
      <div className="flex items-center justify-between px-3 pt-0.5">
        <span className="num text-[10px]" style={{ color: theme.dim }}>
          {t("ui.level", { level: hud.level })}
        </span>
        <span className="num text-[10px]" style={{ color: hud.stageLeft === null ? theme.boss : theme.dim }}>
          {hud.stageLeft === null ? t("ui.bossFight") : t("ui.next", { sec: Math.ceil(hud.stageLeft) })}
        </span>
      </div>

      {/* 보스 HP (§6 — 화면 상단 보스 체력바) */}
      {boss && (
        <div className="mx-auto mt-2 w-[min(560px,82%)]">
          <div className="flex items-center justify-between gap-2 px-1 pb-1">
            <span className="truncate text-xs font-bold" style={{ color: theme.boss }}>
              👑 {t(`boss.${boss.kind}`)} — {t(`bossTitle.${boss.kind}`)}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {boss.fuse !== null && boss.fuse > 0 && (
                <span className="num text-[11px] font-bold" style={{ color: theme.danger }}>
                  {t("ui.fuse", { sec: Math.ceil(boss.fuse) })}
                </span>
              )}
              {boss.timeLeft !== null && (
                <span
                  className="num text-sm font-black"
                  style={{ color: boss.timeLeft <= 60 ? theme.danger : theme.text }}
                >
                  {t("ui.limit", { time: fmtTime(boss.timeLeft) })}
                </span>
              )}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full" style={{ background: `${theme.dim}40` }}>
            <div
              className="h-full rounded-full transition-[width] duration-100"
              style={{ width: `${Math.max(0, Math.min(100, (boss.hp / boss.maxHp) * 100))}%`, background: theme.boss }}
            />
          </div>
          {boss.gauge !== null && (
            <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: `${theme.dim}30` }}>
              <div className="h-full rounded-full" style={{ width: `${boss.gauge * 100}%`, background: theme.danger }} />
            </div>
          )}
          {boss.rage !== null && (
            <div className="mt-1 flex items-center gap-2">
              <span className="num text-[10px] font-bold" style={{ color: theme.danger }}>
                😡 {t("ui.rage")}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: `${theme.dim}30` }}>
                <div className="h-full rounded-full" style={{ width: `${boss.rage * 100}%`, background: theme.danger }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 배너 */}
      {hud.banner && (
        <div className="absolute inset-x-0 top-1/3 px-4 text-center">
          <p className="animate-pop text-3xl font-black" style={{ color: theme.accent }}>
            {text(t, hud.banner.m)}
          </p>
          <p className="mt-1 text-sm font-bold" style={{ color: theme.text }}>
            {text(t, hud.banner.sub)}
          </p>
        </div>
      )}

      {/* 하단 왼쪽: 스킬 슬롯 */}
      <div className="absolute bottom-2 left-3 flex max-w-[55%] flex-wrap gap-1">
        {hud.actives.map((s, i) => (
          <span
            key={`a${i}`}
            className="flex h-8 w-8 flex-col items-center justify-center rounded-lg text-sm"
            style={{
              background: `${theme.surface}cc`,
              border: `1.5px solid ${s.evolved ? "#FACC15" : `${theme.dim}66`}`,
            }}
          >
            {s.emoji}
            <span className="num text-[7px] leading-none" style={{ color: theme.dim }}>
              {"•".repeat(s.lv)}
            </span>
          </span>
        ))}
        {hud.passives.map((s, i) => (
          <span
            key={`p${i}`}
            className="flex h-8 w-8 flex-col items-center justify-center rounded-lg text-sm opacity-80"
            style={{ background: `${theme.surface}99`, border: `1px solid ${theme.dim}44` }}
          >
            {s.emoji}
            <span className="num text-[7px] leading-none" style={{ color: theme.dim }}>
              {"•".repeat(s.lv)}
            </span>
          </span>
        ))}
      </div>

      {/* 하단 오른쪽: 전투 로그 (터미널) */}
      <div className="absolute bottom-2 right-3 w-[min(300px,45%)] text-right">
        {hud.log.map((l, i) => (
          <p key={`${l.t}-${i}`} className="num truncate text-[10px] leading-tight" style={{ color: LOG_COLOR[l.tag](theme) }}>
            <span style={{ opacity: 0.75 }}>[{l.tag}]</span> {text(t, l.m)}
          </p>
        ))}
      </div>
    </div>
  );
}
