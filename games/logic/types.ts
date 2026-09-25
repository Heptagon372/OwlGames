// 🔌 아울 로직 (OWL LOGIC) 타입 계약 — 기획서 §5
// UI(SVG)와 엔진이 공유하는 유일한 계약. 여기 없는 모양은 엔진 밖으로 나가지 않는다.

export type Gate = "AND" | "OR" | "NOT" | "XOR" | "NAND" | "MUX";
export type Tier = 1 | 2 | 3 | 4 | 5;

/** 슬롯 입력 소스 */
export type Source = { kind: "input"; index: number } | { kind: "slot"; index: number };

/** 배선은 고정. 플레이어는 슬롯에 넣을 게이트 종류만 정한다 (GDD §5 설계 포인트) */
export type SlotDef = {
  /** 이 슬롯으로 들어오는 배선 (MUX는 [sel, a, b], NOT은 [0]번만 사용) */
  inputs: Source[];
};

export type Puzzle = {
  id: string;
  tier: Tier;
  inputs: string[]; // ['A','B','C'] — truth 행 순서는 inputs[0]이 MSB
  slots: SlotDef[];
  outputSlot: number; // 최종 출력이 나오는 슬롯 index
  parts: Partial<Record<Gate, number>>; // 지급 부품과 개수 (모자라게 줄 수 있음)
  truth: number[]; // 길이 2^n, 0|1
  minGates: number; // 최적화 보너스 기준 (실제 필요한 최소 게이트 수)
  hint: string; // 성질만 알려주는 한 줄 (정답 게이트를 찍지 않는다)
};

/** 슬롯별 배치 (null = 비어 있음) */
export type Placement = (Gate | null)[];

export type RowResult = { expected: number; actual: number | null; ok: boolean };

/**
 * 한 판의 누적 상태 (기획서 §6·§7.1).
 * 시계(남은 시간)는 UI가 들고 있고, 엔진은 `onSolve`에 들어온 solveMs로만 시간을 센다.
 */
export type LogicRunState = {
  solved: number;
  optimal: number;
  hints: number;
  wrongSubmits: number;
  combo: number;
  comboMax: number;
  tierMax: Tier;
  solveMsList: number[];
  /** Σ(120 × 콤보배율 × 티어계수) — OVERDRIVE ×2가 이미 반영된 값 */
  score: number;
  /** OVERDRIVE 종료 시각 (run 내부 시계 ms, -1 = 아직 없음) */
  overdriveUntilMs: number;
  /** OVERDRIVE ×2로 더 얻은 점수 (서버 재계산에 같이 보낸다) */
  overdriveBonus: number;
  /** onSolve(solveMs)가 누적하는 내부 시계 (ms) — OVERDRIVE 판정 기준 */
  clockMs: number;
  /** 힌트 없이 연속으로 해결한 수 (OVERDRIVE 트리거) */
  streak: number;
  /** combo_mult_avg 계산용 */
  comboMultSum: number;
  /** tier_mult_avg 계산용 */
  tierMultSum: number;
  multCount: number;
  /** 🦉 아울 에너지를 주웠는지 — UI가 켠다 (서버가 최종 판정) */
  owlEnergyFound: boolean;
};

/** 서버 검증용 meta (기획서 §7.3) — 키 구성이 서버와 1:1이라 마음대로 늘리면 안 된다 */
export type LogicMeta = {
  duration_s: number;
  solved: number;
  optimal: number;
  tier_max: number;
  combo_max: number;
  hints: number;
  wrong_submits: number;
  avg_solve_ms: number;
  time_left: number;
  combo_mult_avg: number;
  tier_mult_avg: number;
  overdrive_bonus_score: number;
  owl_energy_found: boolean;
  v: string;
};
