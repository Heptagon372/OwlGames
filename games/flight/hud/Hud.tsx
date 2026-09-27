"use client";

// 아울러닝 HUD (기획서 §15 + 2.0) — 화면 면적 18% 이하, 플레이 영역 침범 금지
import Image from "next/image";
import { primaryLabel, type Keymap } from "@/lib/keybinds";
import { Pause } from "lucide-react";
import { useTranslations } from "next-intl";
import { CFG, COLOR_INFO, type Color, type SizeKey } from "../config";
import { text } from "@/games/core/i18n";
import { cn } from "@/lib/cn";
import { stageColor } from "@/lib/stages";
import type { Banner, ChoiceId, GameStatus, SkillKind } from "../engine/game";
import { spriteUrl } from "../engine/assets";

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
  shields: number;
  rainbow: number;
  efficiency: number;
  banner: Banner;
  status: GameStatus;
  /** 체감 속도 km/h */
  speed: number;
  /** 2.0 단계 (16 이상 = ∞) */
  stage: number;
  stageTag: string;
  stageKey: string;
  /** 다음 단계까지 진행도 0~1 */
  stageProgress: number;
  fever: number;
  feverT: number;
  power: number;
  powerReady: boolean;
  powerUnlocked: boolean;
  skill: SkillKind | null;
  skillT: number;
  colorChain: number;
  scoreMult: number;
  nearChain: number;
  magnetT: number;
  doubleT: number;
  breakerT: number;
  phantomT: number;
  turboT: number;
  overdrive: boolean;
  choice: { options: ChoiceId[]; t: number } | null;
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

const SKILL_ICON: Record<SkillKind, string> = { breaker: "💥", freeze: "❄️", phantom: "👻" };
const CHOICE_ICON: Record<ChoiceId, string> = {
  energy: "⚡",
  score: "✖2",
  shield: "🛡️",
  magnet: "🧲",
  fever: "🔥",
  power: "🌈",
  rainbow: "🌈",
};

/** 보상 카드 그림 (리소스 시트 아이템) */
const CHOICE_ART: Record<ChoiceId, string> = {
  energy: "item-energy",
  score: "item-star",
  shield: "item-shield",
  magnet: "item-magnet",
  fever: "item-rage",
  power: "trail-R",
  rainbow: "item-box",
};

/** 배너 옆 연출 그림 (리소스 시트 "특수 이벤트 / 연출") — 메시지 키로 고른다 */
const BANNER_ART: Record<string, string> = {
  "event.laser": "ev-laser",
  barrage: "ev-laser",
  "event.featherRain": "ev-feather",
  "event.storm": "ev-storm",
  "event.phantomWorld": "ev-phantom",
  "event.turbo": "ev-turbo",
  "event.colorChaos": "ev-chaos",
  "event.glitch": "ev-quake",
  "event.golden": "ev-golden",
  gravityFlip: "ev-gravity",
  wave: "ev-quake",
  colorBurst: "ev-chain",
  fever: "ev-golden",
  infiniteIn: "ev-golden",
  overdrive: "ev-turbo",
  "stageName.color": "ev-chain",
  "stageName.energy": "ev-feather",
  "stageName.laser": "ev-laser",
  "stageName.wave": "ev-gravity",
  "stageName.power": "ev-chain",
  "stageName.storm": "ev-items",
  "stageName.missile": "ev-missile",
  "stageName.turbo": "ev-turbo",
  "stageName.glitch": "ev-chaos",
  "stageName.barrage": "ev-laser",
  "stageName.chaos": "ev-quake",
  "stageName.final": "ev-golden",
};

function bannerArt(b: NonNullable<Banner>): string | null {
  const name = b.m.p?.name;
  const key = typeof name === "string" && name.startsWith("@") ? name.slice(1) : b.m.k;
  return BANNER_ART[key] ?? null;
}

const BANNER_TONE: Record<NonNullable<NonNullable<Banner>["tone"]>, string> = {
  stage: "border-neon/50 text-neon",
  danger: "border-alert/60 text-alert",
  good: "border-ok/50 text-ok",
  legend: "border-amber/60 text-amber",
};

export function Hud({
  hud,
  keyMap,
  onCycleColor,
  onSkill,
  onPick,
  onPause,
  pauseLeft,
}: {
  hud: HudState;
  /** PC 키 안내 (색 버튼 옆) — 설정에서 바꾼 키 */
  keyMap: Keymap<"flight">;
  onCycleColor: () => void;
  onSkill: () => void;
  onPick: (i: number) => void;
  onPause: () => void;
  pauseLeft: number;
}) {
  const t = useTranslations("hud.flight");
  const tc = useTranslations("hud.common");
  const info = COLOR_INFO[hud.color];
  const colorName = t(`color.${hud.color}`);
  const ratio = Math.max(0, hud.energy / hud.energyMax);
  const energyColor = ratio > 0.5 ? "#6BF0A0" : ratio > CFG.energy.lowRatio ? "#FFD27A" : "#FF5C7A";
  const skillNow: SkillKind = hud.color === "R" ? "breaker" : hud.color === "B" ? "freeze" : "phantom";
  const infinite = hud.stage > CFG.stages.length;
  const sColor = infinite ? "#FFB020" : stageColor(hud.stage);

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* 좌상단: 에너지 + FEVER */}
      <div className="absolute left-3 top-3 w-[34%] max-w-[240px]">
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
        <div className="mt-1.5 flex items-center gap-1.5">
          <span
            className={cn("font-mono text-[9px] font-black tracking-widest", hud.feverT > 0 ? "text-amber" : "text-dim")}
          >
            {hud.feverT > 0 ? `🔥 ${hud.feverT.toFixed(1)}` : "FEVER"}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-night/80">
            <div
              className={cn("h-full rounded-full", hud.feverT > 0 && "animate-pulse")}
              style={{
                width: `${hud.feverT > 0 ? (hud.feverT / CFG.fever.sec) * 100 : hud.fever}%`,
                background: "linear-gradient(90deg,#FF5C32,#FFB020)",
                boxShadow: hud.fever > 70 || hud.feverT > 0 ? "0 0 10px #FFB020" : undefined,
              }}
            />
          </div>
        </div>
      </div>

      {/* 중앙 상단: STAGE + 진행 · 콤보 */}
      <div className="absolute left-1/2 top-2.5 -translate-x-1/2 text-center">
        <div
          className="flex items-center gap-2 rounded-full border bg-night/75 px-3 py-1"
          style={{ borderColor: `${sColor}88`, boxShadow: `0 0 14px ${sColor}33` }}
        >
          <span className="arcade text-[11px]" style={{ color: sColor }}>
            {hud.stageTag}
          </span>
          <span className="text-[11px] font-bold text-ink">{t(`stageName.${hud.stageKey}`)}</span>
        </div>
        <div className="mx-auto mt-1 h-1 w-24 overflow-hidden rounded-full bg-night/70">
          <div className="h-full rounded-full" style={{ width: `${hud.stageProgress * 100}%`, background: sColor }} />
        </div>
        {hud.overdrive && <p className="arcade mt-1 animate-pulse text-[11px] text-alert">OVERDRIVE</p>}
        {hud.turboT > 0 && !hud.overdrive && <p className="arcade mt-1 animate-pulse text-[11px] text-amber">TURBO</p>}
        {hud.combo >= 3 && (
          <p
            className={cn(
              "num mt-0.5 font-black text-neon-soft transition-transform",
              hud.combo % 10 === 0 ? "scale-125 text-glow" : "",
              hud.combo >= 10 ? "text-base" : "text-sm",
            )}
          >
            {hud.combo} COMBO{hud.comboMult > 1 && <span className="ml-1 text-[10px] text-neon">×{hud.comboMult.toFixed(2)}</span>}
          </p>
        )}
      </div>

      {/* 우상단: 거리·점수·속도 */}
      <div className="absolute right-3 top-3 text-right">
        <p className="arcade text-lg text-aqua drop-shadow-[0_0_10px_rgba(61,217,235,0.5)]">
          {Math.floor(hud.meters).toLocaleString()}
          <span className="ml-1 text-[10px]">M</span>
        </p>
        <p className="arcade mt-1 text-[11px] text-neon">
          {Math.round(hud.score).toLocaleString()}
          {hud.scoreMult > 1 && (
            <span className="ml-1 rounded bg-amber/20 px-1 text-[10px] text-amber">×{+hud.scoreMult.toFixed(1)}</span>
          )}
        </p>
        <p className="arcade mt-1.5 text-[10px] text-mute">
          <span style={{ color: hud.speed > 80 ? "#FF5C7A" : hud.speed > 60 ? "#FFB020" : undefined }}>{hud.speed}</span> KM/H
        </p>
      </div>

      {/* 배너 (단계 소개 · 이벤트 · 경고) */}
      {hud.banner && !hud.choice && hud.status !== "ready" && (
        <div className="absolute left-1/2 top-[27%] flex -translate-x-1/2 animate-pop items-center gap-3">
          {bannerArt(hud.banner) && (
            <Image
              src={spriteUrl(bannerArt(hud.banner)!)}
              alt=""
              width={110}
              height={100}
              className={cn(
                "h-auto w-[clamp(56px,11vw,96px)] rounded-xl border-2 shadow-lg",
                BANNER_TONE[hud.banner.tone ?? "stage"],
              )}
              draggable={false}
            />
          )}
          <div className="text-center">
            <p
              className={cn(
                "whitespace-nowrap rounded-2xl border bg-night/85 px-5 py-2.5 text-lg font-black",
                BANNER_TONE[hud.banner.tone ?? "stage"],
              )}
            >
              {text(t, hud.banner.m)}
            </p>
            {hud.banner.sub && (
              <p className="mt-1.5 text-sm font-bold text-ink drop-shadow">{text(t, hud.banner.sub)}</p>
            )}
          </div>
        </div>
      )}

      {/* 좌하단: 크기 + 버프 */}
      <div className="absolute bottom-3 left-3 flex max-w-[45%] flex-wrap items-center gap-1.5">
        <span className="num grid size-9 place-items-center rounded-xl border border-line bg-night/80 text-sm font-black text-ink">
          {hud.size}
        </span>
        {hud.shields > 0 && <Buff label={hud.shields > 1 ? "🛡️×2" : "🛡️"} />}
        {hud.rainbow > 0 && <Buff label="🌈" sec={hud.rainbow} />}
        {hud.efficiency > 0 && <Buff label="⚡" sec={hud.efficiency} />}
        {hud.magnetT > 0 && <Buff label="🧲" sec={hud.magnetT} />}
        {hud.doubleT > 0 && <Buff label="✖2" sec={hud.doubleT} />}
        {hud.breakerT > 0 && <Buff label="🔥" sec={hud.breakerT} />}
        {hud.phantomT > 0 && <Buff label="💜" sec={hud.phantomT} />}
        {hud.skill && <Buff label={SKILL_ICON[hud.skill]} sec={hud.skillT} />}
        {hud.nearChain >= CFG.nearChain.danger && <Buff label={`⚠ ×${CFG.nearChain.dangerMult}`} />}
        {hud.colorChain >= CFG.colorChain.x15 && hud.powerUnlocked && (
          <Buff label={`🎨 ×${hud.colorChain >= CFG.colorChain.x2 ? 2 : 1.5}`} />
        )}
      </div>

      {/* 우하단: COLOR POWER + 색상 버튼 (최소 72px) */}
      <div className="pointer-events-auto absolute bottom-3 right-3 flex items-end gap-2.5">
        {hud.powerUnlocked && (
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSkill();
            }}
            aria-label={t("skillAria", { skill: t(`skillName.${skillNow}`) })}
            disabled={!hud.powerReady}
            className={cn(
              "relative grid size-[68px] place-items-center rounded-full border-2 bg-night/80 active:scale-95",
              hud.powerReady ? "animate-pulse border-amber" : "border-line opacity-80",
            )}
            style={hud.powerReady ? { boxShadow: `0 0 26px ${info.hex}` } : undefined}
          >
            <svg viewBox="0 0 68 68" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle
                cx="34"
                cy="34"
                r="30"
                fill="none"
                stroke={hud.powerReady ? "#FFB020" : info.hex}
                strokeWidth="4"
                strokeDasharray={`${(hud.power / CFG.power.need) * 188.5} 188.5`}
                strokeLinecap="round"
              />
            </svg>
            <span className="text-xl leading-none">{SKILL_ICON[skillNow]}</span>
            <span className="absolute -bottom-1.5 rounded bg-night px-1 font-mono text-[9px] font-black text-mute">
              {hud.powerReady ? t(`skillName.${skillNow}`) : `${hud.power}/${CFG.power.need}`}
            </span>
          </button>
        )}
        <div className="flex flex-col items-center gap-2">
          {hud.nextGate && (
            <div
              className="flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold"
              style={{ borderColor: COLOR_INFO[hud.nextGate].hex, color: COLOR_INFO[hud.nextGate].hex }}
            >
              <Image src={spriteUrl(`color-${hud.nextGate}`)} alt="" width={16} height={16} className="size-4" />
              {t("next")}
            </div>
          )}
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCycleColor();
            }}
            aria-label={t("colorAria", { color: colorName })}
            className="grid size-[84px] place-items-center rounded-full border-4 bg-night/80 active:scale-95"
            style={{ borderColor: info.hex, boxShadow: `0 0 24px ${info.hex}66` }}
          >
            <Image
              key={hud.color}
              src={spriteUrl(`color-${hud.color}`)}
              alt=""
              width={56}
              height={56}
              className="size-12 animate-pop"
              draggable={false}
            />
          </button>
          {/* PC: 색마다 바로 가는 키 (폰에서는 버튼을 눌러 순환) */}
          <div className="hidden gap-1 pc:flex">
            {(["R", "B", "P"] as const).map((c) => (
              <kbd
                key={c}
                className={`rounded-md border-2 bg-night/80 px-1.5 py-0.5 font-mono text-[11px] font-black ${hud.color === c ? "" : "opacity-50"}`}
                style={{ borderColor: COLOR_INFO[c].hex, color: COLOR_INFO[c].hex }}
              >
                {primaryLabel(keyMap, c === "R" ? "colorR" : c === "B" ? "colorB" : "colorP")}
              </kbd>
            ))}
          </div>
        </div>
      </div>

      {/* 일시정지 */}
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onPause();
        }}
        aria-label={tc("pause")}
        className="pointer-events-auto absolute right-3 top-[4.6rem] grid size-11 place-items-center rounded-xl border border-line bg-night/70 text-mute"
      >
        <Pause className="size-4" />
      </button>
      {pauseLeft < CFG.pause.totalSec && (
        <p className="num absolute right-16 top-[5.4rem] text-[10px] text-dim">
          {tc("pauseLeft", { sec: Math.ceil(pauseLeft) })}
        </p>
      )}

      {/* 🎁 CHOOSE 1 — 선택형 보상 (1·2·3 키 또는 탭) */}
      {hud.choice && (
        <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-night/70 px-4">
          <div className="text-center">
            <p className="arcade text-2xl text-amber drop-shadow-[0_0_14px_rgba(255,176,32,0.6)]">CHOOSE 1</p>
            <p className="num mt-1 text-xs text-mute">{t("choiceHint", { sec: Math.ceil(hud.choice.t) })}</p>
            <div className="mt-4 flex justify-center gap-3">
              {hud.choice.options.map((id, i) => (
                <button
                  key={id}
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onPick(i);
                  }}
                  className="glass grad-line relative flex min-h-[132px] w-[118px] flex-col items-center justify-center gap-1.5 rounded-tile px-2 py-3 active:scale-95 sm:w-[140px]"
                >
                  <span className="absolute left-2 top-1.5 hidden font-mono text-[10px] text-dim pc:inline">
                    {primaryLabel(keyMap, (["colorR", "colorB", "colorP"] as const)[i])}
                  </span>
                  <Image
                    src={spriteUrl(CHOICE_ART[id])}
                    alt={CHOICE_ICON[id]}
                    width={52}
                    height={52}
                    className="h-12 w-auto drop-shadow-[0_0_10px_rgba(255,210,122,0.35)]"
                    draggable={false}
                  />
                  <span className="text-sm font-black text-ink">{t(`choice.${id}`)}</span>
                  <span className="text-[11px] leading-tight text-mute">{t(`choiceSub.${id}`)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
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
