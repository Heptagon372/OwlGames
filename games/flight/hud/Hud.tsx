"use client";

// 아울러닝 HUD (기획서 §15) — 화면 면적 18% 이하, 플레이 영역 침범 금지
import { Pause } from "lucide-react";
import { CFG, COLOR_INFO, type Color, type SizeKey } from "../config";
import { cn } from "@/lib/cn";
import type { Banner, GameStatus } from "../engine/game";

export type HudState = {
  energy: number;
  energyMax: number;
  low: boolean;
  meters: number;
  score: number;
  combo: number;
  comboMult: number;
  color: Color;
  nextGate: Color | null;
  size: SizeKey;
  shield: boolean;
  rainbow: number;
  efficiency: number;
  banner: Banner;
  status: GameStatus;
  special: string | null;
};

export function ShapeIcon({ shape, className, style }: { shape: "circle" | "square" | "triangle"; className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden>
      {shape === "circle" && <circle cx="12" cy="12" r="9" fill="currentColor" />}
      {shape === "square" && <rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" />}
      {shape === "triangle" && <path d="M12 3 L21 20 L3 20 Z" fill="currentColor" />}
    </svg>
  );
}

export function Hud({
  hud,
  onCycleColor,
  onPause,
  pauseLeft,
}: {
  hud: HudState;
  onCycleColor: () => void;
  onPause: () => void;
  pauseLeft: number;
}) {
  const info = COLOR_INFO[hud.color];
  const ratio = Math.max(0, hud.energy / hud.energyMax);
  const energyColor = ratio > 0.5 ? "#6BF0A0" : ratio > CFG.energy.lowRatio ? "#FFD27A" : "#FF5C7A";

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* 좌상단: 에너지 */}
      <div className="absolute left-3 top-3 w-[38%] max-w-[260px]">
        <div className="mb-1 flex items-center justify-between font-mono text-[10px] tracking-widest text-mute">
          <span>FLIGHT ENERGY</span>
          <span className="num">{Math.round(hud.energy)}</span>
        </div>
        <div className={cn("h-3 overflow-hidden rounded-full border border-line bg-night/80", hud.low && "animate-pulse")}>
          <div
            className="h-full rounded-full transition-[width] duration-100"
            style={{ width: `${ratio * 100}%`, background: energyColor, boxShadow: `0 0 12px ${energyColor}` }}
          />
        </div>
      </div>

      {/* 우상단: 거리·점수 */}
      <div className="absolute right-3 top-3 text-right">
        <p className="num text-xl font-black text-aqua drop-shadow-[0_0_10px_rgba(61,217,235,0.5)]">
          {Math.floor(hud.meters).toLocaleString()}m
        </p>
        <p className="num text-sm font-bold text-neon">{Math.round(hud.score).toLocaleString()}</p>
      </div>

      {/* 중앙 상단: 콤보 */}
      {hud.combo >= 3 && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2 text-center">
          <p
            className={cn(
              "num font-black text-neon-soft transition-transform",
              hud.combo % 10 === 0 ? "scale-125 text-glow" : "",
              hud.combo >= 10 ? "text-lg" : "text-base",
            )}
          >
            {hud.combo} COMBO
          </p>
          {hud.comboMult > 1 && <p className="num text-[11px] text-neon">×{hud.comboMult.toFixed(2)}</p>}
        </div>
      )}

      {/* 특수 구간 */}
      {hud.special && (
        <p className="absolute left-1/2 top-16 -translate-x-1/2 rounded-full border border-aqua/50 bg-night/70 px-3 py-1 font-mono text-[11px] text-aqua">
          {hud.special}
        </p>
      )}

      {/* 배너 (페이즈 힌트 · 특수 구간 · 경고) */}
      {hud.banner && (
        <div className="absolute left-1/2 top-1/3 -translate-x-1/2 animate-pop text-center">
          <p className="rounded-2xl border border-neon/40 bg-night/85 px-5 py-2.5 text-lg font-black text-neon">
            {hud.banner.text}
          </p>
          {hud.banner.sub && <p className="mt-1.5 text-sm font-bold text-ink drop-shadow">{hud.banner.sub}</p>}
        </div>
      )}

      {/* 좌하단: 크기 + 버프 */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2">
        <span className="num grid size-9 place-items-center rounded-xl border border-line bg-night/80 text-sm font-black text-ink">
          {hud.size}
        </span>
        {hud.shield && <Buff label="🛡️" />}
        {hud.rainbow > 0 && <Buff label="🌈" sec={hud.rainbow} />}
        {hud.efficiency > 0 && <Buff label="⚡" sec={hud.efficiency} />}
      </div>

      {/* 우하단: 색상 버튼 (최소 72px) */}
      <div className="pointer-events-auto absolute bottom-3 right-3 flex flex-col items-center gap-2">
        {hud.nextGate && (
          <div
            className="flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold"
            style={{ borderColor: COLOR_INFO[hud.nextGate].hex, color: COLOR_INFO[hud.nextGate].hex }}
          >
            <ShapeIcon shape={COLOR_INFO[hud.nextGate].shape} className="size-3" />
            다음
          </div>
        )}
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onCycleColor();
          }}
          aria-label={`색상 변경 (현재 ${info.label})`}
          className="grid size-[84px] place-items-center rounded-full border-4 bg-night/80 active:scale-95"
          style={{ borderColor: info.hex, boxShadow: `0 0 24px ${info.hex}66` }}
        >
          <ShapeIcon shape={info.shape} className="size-10" style={{ color: info.hex }} />
        </button>
      </div>

      {/* 일시정지 */}
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onPause();
        }}
        aria-label="일시정지"
        className="pointer-events-auto absolute right-3 top-16 grid size-11 place-items-center rounded-xl border border-line bg-night/70 text-mute"
      >
        <Pause className="size-4" />
      </button>
      {pauseLeft < CFG.pause.totalSec && (
        <p className="num absolute right-16 top-[4.7rem] text-[10px] text-dim">일시정지 {Math.ceil(pauseLeft)}초</p>
      )}
    </div>
  );
}

function Buff({ label, sec }: { label: string; sec?: number }) {
  return (
    <span className="flex items-center gap-1 rounded-xl border border-line bg-night/80 px-2 py-1.5 text-sm">
      {label}
      {sec !== undefined && <span className="num text-[10px] text-mute">{sec.toFixed(1)}</span>}
    </span>
  );
}
