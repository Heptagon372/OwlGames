// 페이즈·단계·난이도 (기획서 §3 · §9 + 2.0 §2 15단계)
// 2.0에서 기존 특수 구간(COLOR RUSH 등)은 랜덤 이벤트(director.ts)로 대체했다.
import {
  CFG,
  FINAL_STAGE,
  drainMultFromMeters,
  infiniteLevel,
  phaseFromMeters,
  scrollFromMeters,
  stageDef,
  stageFromMeters,
  type StageKey,
} from "../config";

export { phaseFromMeters, scrollFromMeters, drainMultFromMeters, stageFromMeters };

/** 현재 페이즈에서 허용되는 최대 난이도 */
export function difficultyCap(phase: number): number {
  return [2, 3, 4, 5, 5][phase] ?? 5;
}

/** 단계의 새 요소 키 — ∞ 는 "infinite" */
export function stageKey(stage: number): StageKey | "infinite" {
  return stage > FINAL_STAGE ? "infinite" : stageDef(stage).key;
}

/** 단계 표시 — 1~15는 "STAGE 07", ∞ 는 "∞ Lv.2" */
export function stageTag(stage: number): string {
  if (stage > FINAL_STAGE) return `∞ Lv.${infiniteLevel(stage)}`;
  return `STAGE ${String(stage).padStart(2, "0")}`;
}

/** 세트피스가 끼어들 확률 (단계 첫 청크의 소개용 세트피스는 별도로 반드시 나온다) */
export function setPieceChance(stage: number): number {
  if (stage > FINAL_STAGE) return CFG.setPiece.infiniteChance;
  if (stage < 5) return 0;
  return Math.min(CFG.setPiece.maxChance, CFG.setPiece.baseChance + (stage - 5) * CFG.setPiece.perStage);
}
