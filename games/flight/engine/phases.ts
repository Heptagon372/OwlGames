// 페이즈·난이도·특수 구간 (기획서 §3 · §9 · §10)
import { CFG, drainMultFromMeters, phaseFromMeters, scrollFromMeters } from "../config";

export type SpecialKind = "colorRush" | "featherStorm" | "turbo" | "night";

export const SPECIALS: { kind: SpecialKind; label: string; desc: string }[] = [
  { kind: "colorRush", label: "🌈 COLOR RUSH", desc: "게이트 점수 ×2" },
  { kind: "featherStorm", label: "🪶 FEATHER STORM", desc: "아이템 점수 ×1.5" },
  { kind: "turbo", label: "⚡ TURBO FLIGHT", desc: "거리 점수 ×2" },
  { kind: "night", label: "🌙 NIGHT FLIGHT", desc: "NEAR MISS ×2" },
];

export type SpecialState = { kind: SpecialKind; endMeters: number; label: string; desc: string } | null;

export { phaseFromMeters, scrollFromMeters, drainMultFromMeters };

/** 페이즈 진입 힌트 (3초 배너) */
export function phaseHint(phase: number): string {
  return CFG.phases[phase]?.hint ?? "";
}

/** 현재 페이즈에서 허용되는 최대 난이도 */
export function difficultyCap(phase: number): number {
  return [2, 3, 4, 5, 5][phase] ?? 5;
}

/** 1500m 이후 400m마다 35% 확률 (기획서 §10) */
export function rollSpecial(meters: number, rand: () => number): SpecialState {
  if (meters < CFG.special.fromMeters) return null;
  if (rand() > CFG.special.chance) return null;
  const s = SPECIALS[Math.floor(rand() * SPECIALS.length)];
  return { kind: s.kind, label: s.label, desc: s.desc, endMeters: meters + CFG.special.lengthMeters };
}

/** 특수 구간 반영한 스크롤 속도. 구간 중에는 난이도 상승을 멈춘다 */
export function effectiveScroll(meters: number, special: SpecialState, frozenMeters: number | null): number {
  const base = scrollFromMeters(frozenMeters ?? meters);
  return special?.kind === "turbo" ? base * CFG.special.turboMult : base;
}
