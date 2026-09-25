"use client";

// 🚀 아울스페이스 — HUD (기획서 §9)
// 세로 화면 상단 44px + 하단 로그. 플레이 영역을 침범하지 않는다.

import type { SpaceTheme } from "../theme";
import type { LogLine, LogTag } from "../types";

export type HudState = {
  lives: number;
  maxLives: number;
  bombs: number;
  maxBombs: number;
  stage: number;
  stageName: string;
  graze: number;
  kills: number;
  elapsed: number;
  chipGauge: number;
  chipNeed: number;
  main: { emoji: string; name: string; lv: number };
  subs: { emoji: string; lv: number }[];
  passives: { emoji: string; lv: number }[];
  boss: { name: string; emoji: string; hp: number; maxHp: number; phase: number; phases: number } | null;
  banner: { text: string; sub: string } | null;
  log: LogLine[];
  rule: string | null;
};

const LOG_COLOR: Record<LogTag, (t: SpaceTheme) => string> = {
  GRAZE: (t) => t.graze,
  SKILL: (t) => t.chip,
  ALERT: (t) => t.boss,
  FATAL: (t) => t.danger,
  INFO: (t) => t.dim,
  DROP: (t) => t.chip,
};

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Hud({ hud, theme }: { hud: HudState; theme: SpaceTheme }) {
  const low = hud.lives <= 1;

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* 상단 44px */}
      <div
        className="flex h-11 items-center gap-2 px-3"
        style={{ background: `linear-gradient(${theme.bg}dd, transparent)` }}
      >
        <span className="text-base leading-none" style={{ letterSpacing: "-2px" }}>
          {Array.from({ length: hud.maxLives }, (_, i) => (
            <span key={i} style={{ opacity: i < hud.lives ? 1 : 0.22 }}>
              🦉
            </span>
          ))}
        </span>
        <span className="num text-[11px]" style={{ color: theme.dim }}>
          💣 {hud.bombs}
        </span>

        <span className="num ml-auto text-sm font-black" style={{ color: theme.text }}>
          {fmtTime(hud.elapsed)}
        </span>
        <span className="arcade text-[10px]" style={{ color: theme.player }}>
          STAGE {hud.stage}
        </span>
      </div>

      {/* 칩 게이지 */}
      <div className="mx-3 h-1.5 overflow-hidden rounded-full" style={{ background: `${theme.dim}33` }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, (hud.chipGauge / hud.chipNeed) * 100)}%`, background: theme.chip }}
        />
      </div>

      {/* 보스 HP + 페이즈 분절 */}
      {hud.boss && (
        <div className="mx-auto mt-2 w-[min(420px,86%)]">
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="text-xs font-bold" style={{ color: theme.boss }}>
              {hud.boss.emoji} {hud.boss.name}
            </span>
            <span className="num text-[10px]" style={{ color: theme.dim }}>
              PHASE {hud.boss.phase + 1}/{hud.boss.phases}
            </span>
          </div>
          <div className="relative h-2.5 overflow-hidden rounded-full" style={{ background: `${theme.dim}40` }}>
            <div
              className="h-full rounded-full transition-[width] duration-100"
              style={{ width: `${Math.max(0, (hud.boss.hp / hud.boss.maxHp) * 100)}%`, background: theme.boss }}
            />
            {Array.from({ length: hud.boss.phases - 1 }, (_, i) => (
              <span
                key={i}
                className="absolute top-0 h-full w-px"
                style={{ left: `${((i + 1) / hud.boss!.phases) * 100}%`, background: theme.bg }}
              />
            ))}
          </div>
        </div>
      )}

      {/* 배너 */}
      {hud.banner && (
        <div className="absolute inset-x-0 top-[28%] text-center">
          <p className="animate-pop text-3xl font-black" style={{ color: theme.warn }}>
            {hud.banner.text}
          </p>
          <p className="arcade mt-1 text-xs" style={{ color: theme.dim }}>
            {hud.banner.sub}
          </p>
        </div>
      )}

      {/* 하단: GRAZE 카운터 (이 게임의 자랑 지표) */}
      <div className="absolute inset-x-0 bottom-14 text-center">
        <p className="arcade text-xs" style={{ color: theme.graze }}>
          GRAZE <span className="num text-base font-black">{hud.graze}</span>
        </p>
      </div>

      {/* 하단 왼쪽: 내 기체 구성 */}
      <div className="absolute bottom-2 left-3 flex max-w-[60%] flex-wrap items-center gap-1">
        <span
          className="flex h-7 items-center gap-1 rounded-lg px-1.5 text-sm"
          style={{ background: `${theme.surface}cc`, border: `1.5px solid ${theme.player}88` }}
        >
          {hud.main.emoji}
          <span className="num text-[8px]" style={{ color: theme.dim }}>
            {hud.main.lv}
          </span>
        </span>
        {hud.subs.map((s, i) => (
          <span
            key={`s${i}`}
            className="flex h-7 items-center gap-0.5 rounded-lg px-1 text-sm"
            style={{ background: `${theme.surface}aa`, border: `1px solid ${theme.dim}55` }}
          >
            {s.emoji}
            <span className="num text-[8px]" style={{ color: theme.dim }}>
              {s.lv}
            </span>
          </span>
        ))}
        {hud.passives.map((s, i) => (
          <span key={`p${i}`} className="text-[13px] opacity-80">
            {s.emoji}
          </span>
        ))}
      </div>

      {/* 하단 오른쪽: 전투 로그 3줄 */}
      <div className="absolute bottom-2 right-3 w-[min(240px,45%)] text-right">
        {hud.log.map((l, i) => (
          <p
            key={`${l.t}-${i}`}
            className="num truncate text-[10px] leading-tight"
            style={{ color: LOG_COLOR[l.tag](theme) }}
          >
            <span style={{ opacity: 0.75 }}>[{l.tag}]</span> {l.text}
          </p>
        ))}
      </div>

      {low && (
        <p className="absolute inset-x-0 top-14 text-center text-[11px] font-bold" style={{ color: theme.danger }}>
          마지막 기체예요
        </p>
      )}
      {hud.rule && (
        <p className="absolute right-3 top-12 text-[10px]" style={{ color: theme.boss }}>
          특수 규칙 {hud.rule}
        </p>
      )}
    </div>
  );
}
