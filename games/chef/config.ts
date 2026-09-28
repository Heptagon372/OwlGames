// 🍳 아울 레스토랑 — 튜닝 값은 전부 여기 한 곳 (OWLRESTAURANT_GDD.md Part B)
//
// 점수·단계·거부 식을 바꾸면 supabase/migrations/20261005000000_chef.sql 의 chef_* 헬퍼도 같이 고친다
// (engine/score.ts 의 serverRaw·serverReject 가 그 식의 TS 사본이고, tests/chef-engine.test.ts 가 대조한다).

import { STAGE_STEP } from "@/lib/stages";

export type ToolId = "board" | "pan" | "pot" | "oven" | "mixer";
export const TOOL_IDS: readonly ToolId[] = ["board", "pan", "pot", "oven", "mixer"];

export type BugPlan = {
  /** 평균 등장 간격(초) — 실제 간격은 ×0.6~1.4 */
  every: number;
  /** 앉아 있는 시간(초) */
  dur: number;
  /** 동시에 떠 있는 최대 수 */
  max: number;
  /** 도구에도 앉는가 */
  tools: boolean;
};

export type StagePlan = {
  /** 이 단계를 넘기려면 처리할 주문 수 */
  orders: number;
  /** 동시 손님 상한 */
  customers: number;
  /** 도구별 칸 수 (0 = 아직 해금 전) */
  slots: Record<ToolId, number>;
  bugs: BugPlan | null;
};

const S = (board: number, pan: number, pot: number, oven: number, mixer: number) => ({ board, pan, pot, oven, mixer });
const B1: BugPlan = { every: 25, dur: 4, max: 1, tools: false };
const B2: BugPlan = { every: 18, dur: 5, max: 1, tools: false };
const B2T: BugPlan = { ...B2, tools: true };
const B3: BugPlan = { every: 13, dur: 5.5, max: 2, tools: true };
const B4: BugPlan = { every: 10, dur: 6, max: 2, tools: true };

/**
 * GDD §26 단계표 (index 0 = STAGE 1) — **25단계, 한 단계에 새 음식 하나** (25단계의 마지막 주문 = 풀스택 코스요리).
 * 도구는 그 도구를 처음 쓰는 음식과 같은 단계에 열린다 (냄비 7 · 오븐 10 · 믹서 14).
 */
export const STAGES: readonly StagePlan[] = [
  /*  1 핫도그     */ { orders: 2, customers: 1, slots: S(1, 1, 0, 0, 0), bugs: null },
  /*  2 버거       */ { orders: 2, customers: 1, slots: S(1, 1, 0, 0, 0), bugs: null },
  /*  3 프라이     */ { orders: 2, customers: 1, slots: S(1, 1, 0, 0, 0), bugs: null },
  /*  4 샐러드     */ { orders: 2, customers: 1, slots: S(1, 1, 0, 0, 0), bugs: null },
  /*  5 토스트     */ { orders: 2, customers: 2, slots: S(1, 1, 0, 0, 0), bugs: null },
  /*  6 샌드위치   */ { orders: 2, customers: 2, slots: S(1, 1, 0, 0, 0), bugs: B1 },
  /*  7 라면       */ { orders: 2, customers: 2, slots: S(1, 1, 1, 0, 0), bugs: B1 },
  /*  8 핫윙       */ { orders: 2, customers: 2, slots: S(1, 2, 1, 0, 0), bugs: B1 },
  /*  9 팬케이크   */ { orders: 2, customers: 2, slots: S(1, 2, 1, 0, 0), bugs: B1 },
  /* 10 케이크     */ { orders: 3, customers: 2, slots: S(1, 2, 1, 1, 0), bugs: B2 },
  /* 11 스테이크   */ { orders: 3, customers: 2, slots: S(1, 2, 1, 1, 0), bugs: B2T },
  /* 12 피자       */ { orders: 3, customers: 3, slots: S(2, 2, 1, 1, 0), bugs: B2T },
  /* 13 스파게티   */ { orders: 3, customers: 3, slots: S(2, 2, 1, 1, 0), bugs: B2T },
  /* 14 아이스크림 */ { orders: 3, customers: 3, slots: S(2, 2, 1, 1, 1), bugs: B3 },
  /* 15 타코       */ { orders: 3, customers: 3, slots: S(2, 2, 1, 1, 1), bugs: B3 },
  /* 16 덮밥       */ { orders: 3, customers: 3, slots: S(2, 2, 1, 1, 1), bugs: B3 },
  /* 17 Git 파스타 */ { orders: 3, customers: 3, slots: S(2, 2, 2, 1, 1), bugs: B3 },
  /* 18 오믈렛     */ { orders: 3, customers: 3, slots: S(2, 2, 2, 1, 1), bugs: B3 },
  /* 19 김밥       */ { orders: 3, customers: 3, slots: S(2, 2, 2, 1, 1), bugs: B3 },
  /* 20 치킨       */ { orders: 3, customers: 3, slots: S(2, 2, 2, 1, 1), bugs: B3 },
  /* 21 초밥       */ { orders: 3, customers: 3, slots: S(2, 2, 2, 1, 1), bugs: B4 },
  /* 22 카레       */ { orders: 3, customers: 3, slots: S(2, 2, 2, 1, 1), bugs: B4 },
  /* 23 핫팟       */ { orders: 3, customers: 3, slots: S(2, 2, 2, 1, 1), bugs: B4 },
  /* 24 라자냐     */ { orders: 3, customers: 3, slots: S(2, 2, 2, 1, 1), bugs: B4 },
  /* 25 풀스택     */ { orders: 4, customers: 3, slots: S(2, 2, 2, 1, 1), bugs: B4 },
];

export const STAGE_MAX = STAGES.length; // 25 — 그다음은 ∞ (내부 stage = 26)
export const INF_STAGE = STAGE_MAX + 1;

/** 단계 S 까지 넘기려면 처리해야 하는 주문 수 누계 (S=0 → 0) */
export function ordersBefore(stage: number): number {
  let n = 0;
  for (let i = 0; i < Math.min(stage - 1, STAGE_MAX); i++) n += STAGES[i].orders;
  return n;
}

/**
 * 처리한 주문 수 + 코스요리 완료 수 → 도달 단계 (서버 `chef_stage` 의 TS 사본).
 * 25단계의 마지막은 코스요리라서 ∞(26) 은 "주문 수 충분 + 코스 1회 이상" 일 때만이다.
 */
export function stageOf(orders: number, courses: number): number {
  if (orders >= ordersBefore(INF_STAGE) && courses >= 1) return INF_STAGE;
  let s = 1;
  while (s < STAGE_MAX && orders >= ordersBefore(s + 1)) s++;
  return s;
}

export const CFG = {
  version: "chef-2",
  dt: 1 / 60,

  /** 조리 시간(초). 도구 키는 `lib/keybinds.ts` 의 `DEFAULT_KEYS.chef` (설정에서 바꾼다) */
  tools: {
    board: { cook: 1.5 },
    pan: { cook: 3.0 },
    pot: { cook: 4.0 },
    oven: { cook: 5.0 },
    mixer: { cook: 2.0 },
  } satisfies Record<ToolId, { cook: number }>,

  /** 인내도 = W × slack + base + (동시 손님 상한 − 1) × par  (GDD §25) — slack = slack0 ÷ curveOf(S, strength) */
  patience: {
    tapSec: 0.7,
    slack0: 2.5,
    strength: 0.45,
    base: 6,
    par: 5,
    /** CompileError · BUG REPORT 벌점 (최대치 비율) */
    penalty: 0.2,
    /** 벌점으로는 이 초 아래로 안 깎는다 */
    floorSec: 3,
    /** 코스·×2 주문 다음 접시 인내도 비율 */
    refill: 1.0,
    infMul: 0.88,
    infFloor: 0.7,
    /** 초보 보호 — 이 단계까지 인내도 ×mul (튜토리얼 구간) */
    beginnerUntil: 4,
    beginnerMul: 1.4,
  },

  spawn: {
    first: 1.0,
    gap0: 3.0,
    strength: 0.32,
    /** 연달아 앉을 때 최소 간격 */
    between: 2.5,
    infMul: 0.92,
    infFloor: 0.6,
    /** 손님이 떠나는 연출 시간 (그동안 테이블은 비어 있지 않다) */
    leave: 0.6,
  },

  bugs: {
    crawl: 1.0,
    /** 도구 버그 비율 (tools 인 단계에서) */
    toolShare: 0.4,
    /** 남은 인내도가 dur + crawl + fairPad 보다 짧은 테이블엔 앉지 않는다 */
    fairPad: 5,
    retry: 2,
    infEveryMul: 0.93,
    infEveryFloor: 5,
    infDurAdd: 0.2,
    durCap: 7,
    systemFromInf: 3,
    systemShare: 0.25,
    systemWarn: 1.5,
    systemDur: 2.5,
  },

  score: {
    /** 별 수 → 기본 점수 (index = 별) */
    base: [0, 100, 150, 220, 300, 400] as const,
    fast: 0.5,
    fastShow: 0.5,
    combo: 0.1,
    comboCap: 15,
    perfect: 50,
    perfectRatio: 0.5,
    hotfix: 80,
    clean: 100,
    fullStack: 1000,
    stageClear: 100,
    infLevel: 500,
  },

  infinite: {
    levelSec: 30,
    courseChance: 0.12,
    doubleFrom: 2,
    doubleChance: 0.15,
    doubleMaxStars: 3,
  },

  run: {
    /** STAGE CLEAR 멈춤 */
    stagePause: 1.5,
    /** 새 음식·도구 카드가 있으면 더 멈춘다 */
    newCard: 2.0,
    /** 게임 오버 글리치 뒤 결과까지 */
    endDelay: 1.6,
    /**
     * 한 판 상한 → CLOSING TIME. 서버 세션 상한 1,210초는 세션 시작(카운트다운 전)부터 벽시계로 잰다 —
     * 카운트다운 2.4초 · 메뉴 화면 · 가려진 창 · 끝 연출 1.6초 · 전송까지 들어가므로 여유를 둔다 (화면이 벽시계로도 끊는다)
     */
    sessionCap: 1180,
    /** 이 단계까지 다음에 누를 곳이 반짝인다 */
    tutorialUntil: 4,
  },

  /**
   * 🦉 아울 에너지 — 8단계에 들어간 판에서 30% (서버 조건 stage_max ≥ 8).
   * 25단계로 늘린 뒤에도 8 그대로 — 서버 본문(20261007_points_v2 이후 submit_game_session_core)이 8 이다
   */
  owlEnergy: { minStage: 8, chance: 0.3 },
} as const;

/**
 * 단계 곡선 — 공통 `lib/stages.ts` 와 같은 "단계마다 1.16배씩 곱" 이지만 **25단계까지** 오른다
 * (공통 곡선은 15단계에서 멈춘다). ∞ 는 25단계 값에서 따로 ∞ LV 배율이 붙는다.
 */
export function curveOf(stage: number, strength = 1): number {
  const s = Math.max(1, Math.min(STAGE_MAX, Math.floor(stage)));
  return STAGE_STEP ** ((s - 1) * strength);
}

/** 단계(∞ 는 25단계로 본다) → 인내도 여유 배율 */
export function slackOf(stage: number, infLevel: number): number {
  const p = CFG.patience;
  const s = p.slack0 / curveOf(stage, p.strength);
  if (stage <= p.beginnerUntil) return s * p.beginnerMul;
  if (stage < INF_STAGE) return s;
  return Math.max(p.infFloor, s * p.infMul ** Math.max(0, infLevel - 1));
}

/** 새 손님 등장 간격 */
export function gapOf(stage: number, infLevel: number): number {
  const c = CFG.spawn;
  const g = c.gap0 / curveOf(stage, c.strength);
  if (stage < INF_STAGE) return g;
  return Math.max(c.infFloor, g * c.infMul ** Math.max(0, infLevel - 1));
}

export function planOf(stage: number): StagePlan {
  return STAGES[Math.min(stage, STAGE_MAX) - 1];
}

/** 버그 계획 (∞ 에서는 LV 마다 잦아지고 길어진다) */
export function bugPlanOf(stage: number, infLevel: number): BugPlan | null {
  const p = planOf(stage).bugs;
  if (!p || stage < INF_STAGE) return p;
  const b = CFG.bugs;
  const lv = Math.max(0, infLevel - 1);
  return {
    ...p,
    every: Math.max(b.infEveryFloor, p.every * b.infEveryMul ** lv),
    dur: Math.min(b.durCap, p.dur + b.infDurAdd * lv),
  };
}

/** 점수 단계 배율 = √(1.16^(S−1)) — 서버 chef_mult 와 같다 (∞ 는 25단계 값, 최대 ≈ ×5.94) */
export function scoreMultOf(stage: number): number {
  return Math.sqrt(curveOf(stage));
}

/** STAGE CLEAR 보너스 누계 — 단계 S 에 도달했으면 1..S-1 을 다 받았다 */
export function stageClearTotal(stage: number): number {
  const n = Math.min(stage, INF_STAGE) - 1;
  return (CFG.score.stageClear * n * (n + 1)) / 2;
}
