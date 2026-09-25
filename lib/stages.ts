// 공통 단계(STAGE) 체계 — 모든 게임이 같은 규칙으로 어려워진다.
//
// 규칙
// - 점수는 무한히 쌓이지만, 체감 난이도는 **15단계**로 끊어서 올라간다.
// - 단계가 하나 오를 때마다 난이도가 **곱**으로 붙는다 (덧셈 증가가 아니다).
// - 15단계를 넘어서도 계속 갈 수 있고, 그때부터는 마지막 배율이 유지된다(무한 스테이지).
//
// 각 게임은 자기 진행도(시간·거리·해결 수 등)를 0~1 비율로 바꿔 `stageFromRatio`에 넘긴다.

export const STAGE_COUNT = 15;

/** 단계마다 붙는 난이도 배율 (1.16^14 ≈ 8.1배) */
export const STAGE_STEP = 1.16;

/** 단계(1~) → 난이도 배율. 15단계를 넘으면 배율은 더 오르지 않는다 */
export function stageMult(stage: number): number {
  const s = Math.max(1, Math.min(STAGE_COUNT, Math.floor(stage)));
  return STAGE_STEP ** (s - 1);
}

/** 진행 비율(0~1) → 단계(1~15). 1을 넘겨도 15로 고정 */
export function stageFromRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  return Math.max(1, Math.min(STAGE_COUNT, Math.floor(ratio * STAGE_COUNT) + 1));
}

/** 다음 단계까지 남은 비율 (0~1) — HUD 게이지용 */
export function stageProgress(ratio: number): number {
  const r = Math.max(0, Math.min(1, ratio));
  return (r * STAGE_COUNT) % 1;
}

/** 단계 표시 문자열 */
export function stageLabel(stage: number): string {
  return `STAGE ${Math.min(STAGE_COUNT, stage)}`;
}

/**
 * 같은 단계 곡선을 게임마다 다른 세기로 쓴다.
 * `strength`가 0.5면 "단계마다 1.16^0.5배(≈7.7%)씩 곱으로" 어려워진다 —
 * 곱으로 붙는 성질은 그대로 두고, 떨어지는 속도처럼 8배까지 가면 안 되는 축을 눌러 쓴다.
 */
export function stageCurve(stage: number, strength = 1): number {
  return stageMult(stage) ** strength;
}

/** 점수 보너스 배율 — 높은 단계일수록 같은 행동이 더 큰 점수가 된다 */
export function stageScoreMult(stage: number): number {
  // 난이도 배율의 제곱근 정도로 완만하게 (난이도만큼 점수가 폭주하지 않게)
  return Math.sqrt(stageMult(stage));
}

/** 단계별 색 — HUD·배너에서 단계가 올라간 걸 눈으로 알게 한다 */
export function stageColor(stage: number): string {
  const palette = ["#6BF0A0", "#3DD9EB", "#7FA6FF", "#CDA8FF", "#FFB020", "#FF5C7A"];
  const idx = Math.min(palette.length - 1, Math.floor(((stage - 1) / STAGE_COUNT) * palette.length));
  return palette[idx];
}
