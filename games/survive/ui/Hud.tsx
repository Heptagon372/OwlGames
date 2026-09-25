"use client";

// 아울 서바이버즈 HUD (기획서 §13) — 화면 면적 15% 이하, 조이스틱 영역과 겹치지 않게.
import { CFG } from "../config";
import { cn } from "@/lib/cn";
import { stageColor, stageLabel, STAGE_COUNT } from "@/lib/stages";
import type { PassiveId, WeaponId } from "../types";

export type HudState = {
  hp: number;
  maxHp: number;
  timeLeft: number;
  zone: number;
  stage15: number;
  stageProgress: number;
  level: number;
  xp: number;
  xpNext: number;
  kills: number;
  score: number;
  weapons: { id: WeaponId; level: number; emoji: string; evolved: boolean }[];
  passives: { id: PassiveId; level: number; emoji: string }[];
  banner: { text: string; sub?: string } | null;
  rerolls: number;
};

export function Hud({ hud }: { hud: HudState }) {
  const hpRatio = Math.max(0, hud.hp / hud.maxHp);
  const xpRatio = Math.max(0, Math.min(1, hud.xp / hud.xpNext));
  const color = stageColor(hud.stage15);

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* 상단: 체력 · 타이머 · 구역/단계 */}
      <div className="absolute inset-x-0 top-0 px-3 pt-2">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="h-3 overflow-hidden rounded-full border border-line bg-night/80">
              <div
                className={cn("h-full rounded-full transition-[width] duration-150", hpRatio > 0.3 ? "bg-ok" : "bg-alert")}
                style={{ width: `${hpRatio * 100}%`, boxShadow: `0 0 10px ${hpRatio > 0.3 ? "#6BF0A0" : "#FF5C7A"}` }}
              />
            </div>
            <p className="num mt-0.5 text-[10px] text-mute">
              {Math.max(0, Math.ceil(hud.hp))} / {hud.maxHp}
            </p>
          </div>

          <p className="arcade text-xl text-ink">{Math.max(0, Math.ceil(hud.timeLeft))}</p>

          <div className="min-w-0 flex-1 text-right">
            <p className="arcade text-[11px]" style={{ color }}>
              {stageLabel(hud.stage15)}
              <span className="ml-1 text-[9px] text-mute">/{STAGE_COUNT}</span>
            </p>
            <p className="num text-[10px] text-mute">{CFG.zones[hud.zone].name}</p>
          </div>
        </div>

        {/* 단계 진행 + XP */}
        <div className="mt-1.5 flex items-center gap-2">
          <span className="num text-[10px] font-bold text-neon">Lv.{hud.level}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel">
            <div className="h-full rounded-full bg-neon" style={{ width: `${xpRatio * 100}%` }} />
          </div>
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-panel" title="다음 단계까지">
            <div className="h-full rounded-full" style={{ width: `${hud.stageProgress * 100}%`, background: color }} />
          </div>
        </div>
      </div>

      {/* 우상단: 처치 수·점수 */}
      <div className="absolute right-3 top-16 text-right">
        <p className="arcade text-sm text-alert">{hud.kills.toLocaleString()} KILL</p>
        <p className="arcade mt-1 text-[11px] text-neon">{hud.score.toLocaleString()}</p>
      </div>

      {/* 좌하단: 무기·패시브 슬롯 */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-1.5">
        <div className="flex gap-1.5">
          {hud.weapons.map((w) => (
            <span
              key={w.id}
              className={cn(
                "grid size-9 place-items-center rounded-lg border bg-night/80 text-base",
                w.evolved ? "border-neon shadow-[0_0_12px_rgba(255,176,32,0.6)]" : "border-line",
              )}
              title={`${w.id} Lv${w.level}`}
            >
              {w.emoji}
              <span className="num absolute mt-6 text-[9px] text-mute">{w.level}</span>
            </span>
          ))}
        </div>
        <div className="flex gap-1.5">
          {hud.passives.map((p) => (
            <span
              key={p.id}
              className="grid size-7 place-items-center rounded-lg border border-line bg-night/70 text-xs"
              title={`${p.id} Lv${p.level}`}
            >
              {p.emoji}
            </span>
          ))}
        </div>
      </div>

      {/* 배너 */}
      {hud.banner && (
        <div className="absolute left-1/2 top-1/3 -translate-x-1/2 animate-pop text-center">
          <p
            className="rounded-2xl border bg-night/85 px-5 py-2.5 text-lg font-black"
            style={{ borderColor: color, color }}
          >
            {hud.banner.text}
          </p>
          {hud.banner.sub && <p className="mt-1.5 text-sm font-bold text-ink drop-shadow">{hud.banner.sub}</p>}
        </div>
      )}
    </div>
  );
}
