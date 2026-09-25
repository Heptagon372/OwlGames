"use client";

// 🦉 아울 서바이버즈 v2 — HUD + 전투 로그 (기획서 §9.2 · §10.2)
// HUD 총 면적 15% 이하. 색은 전부 테마에서 온다 (다크/라이트 둘 다 대비 확보).

import type { Theme } from "../theme";
import type { LogLine, LogTag } from "../types";

export type HudState = {
  hp: number;
  maxHp: number;
  elapsed: number;
  stage: number;
  stageName: string;
  kills: number;
  level: number;
  xp: number;
  xpNext: number;
  actives: { emoji: string; lv: number; evolved: boolean }[];
  passives: { emoji: string; lv: number }[];
  boss: { name: string; emoji: string; hp: number; maxHp: number; phase: number } | null;
  banner: { text: string; sub: string } | null;
  log: LogLine[];
  rule: string | null;
};

const LOG_COLOR: Record<LogTag, (t: Theme) => string> = {
  INFO: (t) => t.dim,
  WARN: (t) => t.accent,
  CRIT: (t) => t.xp,
  DROP: (t) => t.hp,
  EVO: () => "#FACC15",
  ALERT: (t) => t.boss,
  FATAL: (t) => t.danger,
};

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Hud({ hud, theme }: { hud: HudState; theme: Theme }) {
  const hpRatio = Math.max(0, hud.hp / hud.maxHp);
  const xpRatio = Math.max(0, Math.min(1, hud.xp / hud.xpNext));
  const low = hpRatio <= 0.3;

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
            STAGE {hud.stage}
          </span>
          <span className="num text-[11px]" style={{ color: theme.dim }}>
            KILL {hud.kills}
          </span>
        </div>
      </div>

      {/* XP 바 */}
      <div className="mx-3 h-2 overflow-hidden rounded-full" style={{ background: `${theme.dim}33` }}>
        <div className="h-full rounded-full" style={{ width: `${xpRatio * 100}%`, background: theme.xp }} />
      </div>
      <div className="flex items-center justify-between px-3 pt-0.5">
        <span className="num text-[10px]" style={{ color: theme.dim }}>
          Lv.{hud.level} · {hud.stageName}
        </span>
        {hud.rule && (
          <span className="num text-[10px]" style={{ color: theme.boss }}>
            특수 규칙 {hud.rule}
          </span>
        )}
      </div>

      {/* 보스 HP */}
      {hud.boss && (
        <div className="mx-auto mt-2 w-[min(520px,80%)]">
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="text-xs font-bold" style={{ color: theme.boss }}>
              {hud.boss.emoji} {hud.boss.name}
            </span>
            <span className="num text-[10px]" style={{ color: theme.dim }}>
              PHASE {hud.boss.phase + 1}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full" style={{ background: `${theme.dim}40` }}>
            <div
              className="h-full rounded-full transition-[width] duration-100"
              style={{ width: `${Math.max(0, (hud.boss.hp / hud.boss.maxHp) * 100)}%`, background: theme.boss }}
            />
          </div>
        </div>
      )}

      {/* 배너 */}
      {hud.banner && (
        <div className="absolute inset-x-0 top-1/3 text-center">
          <p className="animate-pop text-3xl font-black" style={{ color: theme.accent }}>
            {hud.banner.text}
          </p>
          <p className="arcade mt-1 text-xs" style={{ color: theme.dim }}>
            {hud.banner.sub}
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
            <span style={{ opacity: 0.75 }}>[{l.tag}]</span> {l.text}
          </p>
        ))}
      </div>
    </div>
  );
}
