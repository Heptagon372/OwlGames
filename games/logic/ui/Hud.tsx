"use client";

// 아울 로직 HUD — 남은 시간·단계·콤보·점수 (기획서 §6·§8)
import { CFG } from "../config";
import { stageColor, stageLabel, STAGE_COUNT } from "@/lib/stages";
import { cn } from "@/lib/cn";

export type LogicHudState = {
  timeLeft: number;
  score: number;
  combo: number;
  comboMult: number;
  overdrive: boolean;
  tier: number;
  stage: number;
  stageProgress: number;
  solved: number;
  optimal: number;
};

export function Hud({ hud }: { hud: LogicHudState }) {
  const urgent = hud.timeLeft <= 10;
  const barRatio = Math.max(0, Math.min(1, hud.timeLeft / CFG.time.base));
  const color = stageColor(hud.stage);

  return (
    <div className="shrink-0 px-4 pt-3">
      <div className="flex items-end justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="arcade rounded-full border px-2 py-1 text-[10px]"
            style={{ color, borderColor: `${color}66`, background: `${color}1a` }}
          >
            {stageLabel(hud.stage)}/{STAGE_COUNT}
          </span>
          <span className="num rounded-full border border-line px-2 py-1 text-[10px] text-mute">
            T{hud.tier} · 해결 {hud.solved}
          </span>
        </div>
        <span className="num text-sm font-bold text-neon">{hud.score.toLocaleString()}</span>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <span
          className={cn("num text-3xl font-black tabular-nums", urgent ? "animate-pulse text-alert" : "text-ink")}
        >
          {hud.timeLeft.toFixed(1)}
        </span>
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-night ring-1 ring-line">
          <div
            className="h-full rounded-full transition-[width] duration-150"
            style={{ width: `${barRatio * 100}%`, background: urgent ? "#FF5C7A" : color }}
          />
        </div>
      </div>

      {/* 단계 진행 게이지 — 다음 STAGE까지 */}
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-night">
        <div className="h-full rounded-full bg-aqua/60" style={{ width: `${hud.stageProgress * 100}%` }} />
      </div>

      <div className="mt-1.5 flex h-6 items-center justify-between">
        <span className="num text-xs text-mute">
          {hud.combo >= CFG.combo.step ? (
            <span className="font-bold text-neon">
              {hud.combo} COMBO ×{hud.comboMult.toFixed(1)}
            </span>
          ) : (
            <>최적화 {hud.optimal}회</>
          )}
        </span>
        {hud.overdrive && (
          <span className="arcade animate-pulse rounded-full bg-neon/20 px-2 py-0.5 text-[10px] text-neon text-glow">
            ⚡ OVERDRIVE ×2
          </span>
        )}
      </div>
    </div>
  );
}
