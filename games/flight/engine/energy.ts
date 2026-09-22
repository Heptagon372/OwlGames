// 에너지 (기획서 §5) — "에너지는 시간이 아니라 날갯짓의 비용이다"
import { CFG, type SizeKey } from "../config";

export type EnergyState = {
  value: number;
  max: number;
  /** ⚡ 효율 버프 남은 시간 */
  efficiency: number;
};

export function initEnergy(size: SizeKey): EnergyState {
  const max = CFG.energy.maxBySize[size];
  return { value: max * CFG.energy.startRatio, max, efficiency: 0 };
}

export function setSize(e: EnergyState, size: SizeKey): void {
  const ratio = e.value / e.max;
  e.max = CFG.energy.maxBySize[size];
  e.value = Math.min(e.max, e.max * ratio);
}

export function isLow(e: EnergyState): boolean {
  return e.value <= e.max * CFG.energy.lowRatio;
}

/** 날갯짓 1프레임 소비. drainMult는 페이즈 배율 */
export function drainFlap(e: EnergyState, dt: number, drainMult: number): void {
  const mult = e.efficiency > 0 ? CFG.energy.efficiencyMult : 1;
  add(e, -CFG.energy.flapDrain * drainMult * mult * dt);
}

export function add(e: EnergyState, delta: number): void {
  e.value = Math.max(0, Math.min(e.max, e.value + delta));
}

export function tickBuffs(e: EnergyState, dt: number): void {
  e.efficiency = Math.max(0, e.efficiency - dt);
}
