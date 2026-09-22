// 부엉이 물리·크기·색 (순수 함수 — 검증 스크립트와 공유한다)
import { CFG, type Color, type SizeKey, SIZE_ORDER } from "../config";

export type OwlPhysics = { y: number; vy: number };

/** 한 프레임 적분. flapping이면 상승 가속이 더해진다 */
export function stepPhysics(p: OwlPhysics, flapping: boolean, dt: number, flapMult = 1): OwlPhysics {
  const accel = CFG.physics.gravity + (flapping ? CFG.physics.flap * flapMult : 0);
  const vy = clamp(p.vy + accel * dt, CFG.physics.vyMaxUp, CFG.physics.vyMaxDown);
  return { y: p.y + vy * dt, vy };
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** 히트박스 타원 반경 (스프라이트의 70%) */
export function hitbox(size: SizeKey): { rx: number; ry: number } {
  const s = CFG.size.scale[size] * CFG.size.hitboxRatio;
  return { rx: CFG.size.baseRx * s, ry: CFG.size.baseRy * s };
}

export function spriteRadius(size: SizeKey): { rx: number; ry: number } {
  const s = CFG.size.scale[size];
  return { rx: CFG.size.baseRx * s, ry: CFG.size.baseRy * s };
}

export function growSize(size: SizeKey): SizeKey {
  return SIZE_ORDER[Math.min(SIZE_ORDER.length - 1, SIZE_ORDER.indexOf(size) + 1)];
}

export function shrinkSize(size: SizeKey): SizeKey {
  return SIZE_ORDER[Math.max(0, SIZE_ORDER.indexOf(size) - 1)];
}

export function colorMatches(owl: Color, gate: Color, rainbow: boolean): boolean {
  return rainbow || owl === gate;
}
