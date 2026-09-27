// 🧩 아울리스 (OWLIS) — 밸런스 한 곳 (기획서 OWLIS_GDD.md)
//
// 매직넘버 금지: 엔진·AI·난이도·점수가 쓰는 수치는 전부 여기서 나온다.
// 점수·거부 기준에 닿는 값(점수 표·난이도 상승 속도·KO 보정)을 바꾸면
// supabase/migrations/20261002000000_owlis.sql 의 같은 식도 같이 고친다 (tests/owlis-engine.test.ts 가 대조한다).

export const CFG = {
  version: "1.0.0",

  /** 필드 — 6열 × 12행 + 보이지 않는 윗줄 1행 (§5 → DECISIONS §5-19) */
  field: { cols: 6, rows: 12, hidden: 1, spawnCol: 2 },

  /** 블록 색 수 (1~4). 5번은 방해 블록 */
  colors: 4,
  /** 같은 색 몇 개가 붙으면 터지는가 (§7) */
  matchMin: 4,
  /** NEXT 로 보여 주는 개수 — AI 도 똑같이 이만큼만 안다 (§46) */
  preview: 2,

  /** 조작 */
  control: {
    /** 좌우 키를 누르고 있을 때: 첫 반복까지 / 반복 간격 (초) */
    das: 0.15,
    arr: 0.05,
    /** 소프트 드롭 속도 (칸/초) */
    softCps: 22,
    /** 바닥에 닿은 뒤 굳을 때까지 (초) · 움직여서 미룰 수 있는 횟수 */
    lockDelay: 0.5,
    lockResets: 10,
  },

  /** 연출 시간 — 엔진이 이 시간 동안 다음 단계로 넘어가지 않는다 */
  anim: {
    /** 터지는 블록이 번쩍이는 시간 */
    clear: 0.36,
    /** 블록이 떨어지는 연출 속도 (칸/초) */
    settleCps: 26,
    /** 방해 블록이 떨어지기 시작하는 높이 (칸) */
    garbageLift: 4,
    /** 다음 블록이 나오기 전 숨 고르기 */
    spawnDelay: 0.06,
  },

  /** 공격 (§9~§11) */
  attack: {
    /** 연쇄 단계별 공격력 — 1~6단계 (§9 표). 7단계부터는 step7 씩 오른다 */
    table: [1, 2, 4, 6, 9, 12] as readonly number[],
    step7: 4,
    /** 한 단계에서 4개를 넘겨 터뜨린 블록 1개당 추가 공격력 */
    perExtraCell: 0.5,
    /** 공격력 → 방해 블록 칸 수 (5연쇄 ≈ 3줄, 7연쇄 ≈ 6줄) */
    cellsPerPower: 0.8,
    /** 한 번에 떨어지는 방해 블록 상한 (5줄) — 나머지는 다음 차례에 */
    maxDropCells: 30,
  },

  /** 점수 (§24~§26) */
  score: {
    /** 블록 1개 기본 점수 */
    cell: 10,
    /** 연쇄 단계별 점수 배율 — 1~6단계 (§9). 7단계부터 step7 씩 */
    comboMult: [1, 1.2, 1.5, 2, 2.5, 3] as readonly number[],
    comboStep7: 0.5,
    /** 연쇄가 끝났을 때 보너스 = chainBonus × 연쇄² (2연쇄부터) */
    chainBonus: 40,
    /** AI LEVEL 배율 (§25) — LEVEL 1~5, 5+ 는 내부 난이도 1 당 plusStep 씩 (상한 plusMax) */
    aiMult: [1, 1.2, 1.5, 2, 3] as readonly number[],
    aiPlusStep: 0.5,
    aiPlusMax: 6,
    /** COUNTER! (§29) · EMERGENCY CLEAR! (§28) · AI KO */
    counter: 500,
    emergency: 300,
    ko: 1500,
    /** 생존 보너스 이정표 [초, 점수] — 지날 때마다 한 번씩 (§26) */
    survival: [
      [60, 100],
      [180, 500],
      [300, 1000],
      [600, 5000],
      [1200, 20000],
    ] as readonly (readonly [number, number])[],
  },

  /** COUNTER — 공격을 받은 직후(또는 받을 게 쌓인 채로) 큰 연쇄로 받아친다 (§29) */
  counter: { minCombo: 3, windowSec: 6 },
  /** EMERGENCY — 위험도 CRITICAL 에서 연쇄 성공 (§28) */
  emergency: { minCombo: 2, danger: 0.8 },

  /** 위험도 구간 (§27) — 0~1 */
  danger: { warning: 0.3, danger: 0.6, critical: 0.8 },

  /** OWL FEVER (§30) */
  fever: {
    /** 연쇄가 끝날 때 게이지 += perCombo × 연쇄 (1연쇄는 single) */
    perCombo: 0.07,
    single: 0.025,
    sec: 12,
    scoreMult: 1.5,
    attackMult: 1.5,
  },

  /**
   * 난이도 관리자 (§16~§19, §44, §47~§49)
   *   D = 내부 난이도 (1 ~ ∞). 화면에는 LEVEL 1~5, 그 뒤로 5+ · 5++ · 5+++ · 5 MAX.
   *   플레이어 성과가 `pending` 에 쌓이고, 초당 response 비율로 D 에 옮겨진다 — 단 초당 maxUp 이상은 못 오른다.
   *   시간 몫(timeRamp)은 성과와 상관없이 늘 더해진다 — 못해도 결국 어려워지고 판은 끝난다.
   *   ⚠️ maxUp · timeRamp · koBump 는 서버 거부 기준(level_max 상한)과 같은 값이어야 한다.
   */
  difficulty: {
    start: 1,
    /** 아무것도 안 해도 오르는 속도 (초당) — 결국 언젠가는 진다 */
    timeRamp: 0.007,
    maxUp: 0.03,
    maxDown: 0.02,
    /** 성과가 D 로 옮겨지는 비율 (초당) */
    response: 0.35,
    /** 못할 때 내려가는 바닥 = 최고 난이도 - floorBelowPeak (§48: 갑자기 쉬워지지 않게) */
    floorBelowPeak: 1,
    pendingClamp: 3,
    /** 성과 점수 (§17) */
    perf: {
      /** 연쇄 하나가 끝날 때 chainK × 연쇄² */
      chainK: 0.012,
      /** 보낸 방해 블록 1칸 */
      sentK: 0.004,
      /** 받은 방해 블록 1칸 (−) */
      receivedK: 0.004,
      /** 위험도가 dangerFrom 을 넘은 동안 초당 (−) × 넘은 비율 */
      dangerK: 0.06,
      dangerFrom: 0.55,
    },
    /** AI 를 KO 시키면 난이도가 바로 이만큼 오른다 */
    koBump: 0.25,
    /** 화면 표시: 5 이후 +1 마다 '+' 하나, maxPlus 개를 넘으면 MAX */
    maxPlus: 3,
  },

  /**
   * AI 파라미터 (§15, §19, §22) — LEVEL 1~5 기준값. 사이 값은 선형 보간, 5 이후는 plus 규칙으로 계속 강해진다.
   * 어떤 값도 "정보를 더 보는" 방향이 아니다 (§46) — 판단·속도만 좋아진다.
   */
  ai: {
    /** 블록이 나온 뒤 움직이기 시작할 때까지 (초) */
    thinkSec: [1.1, 0.8, 0.55, 0.35, 0.22] as readonly number[],
    /** 조작 한 번 사이 간격 (초) */
    moveSec: [0.2, 0.15, 0.11, 0.08, 0.06] as readonly number[],
    /** 떨어뜨리는 속도 (칸/초) — 5 부터는 하드 드롭 */
    dropCps: [7, 10, 14, 22, 40] as readonly number[],
    /** 고려하는 배치 수 (§22: 1~2 / 2~3 / 3~5 / 5~8 / 전부) — 22 = 전부 */
    candidates: [2, 3, 5, 8, 22] as readonly number[],
    /** 다음 블록까지 내다보는가 (2수) — 이 난이도부터 · 1수에서 추려 볼 후보 수 */
    lookaheadFrom: 4.5,
    beam: 6,
    /** 최선이 아닌 수를 둘 확률 */
    mistake: [0.4, 0.25, 0.12, 0.05, 0.02] as readonly number[],
    /** 연쇄 잠재력(한 수 더 두면 몇 연쇄가 나는가)을 보는 무게 */
    potential: [0, 0, 0.6, 1, 1.2] as readonly number[],
    /** 여유가 있을 때 이만큼의 연쇄가 되어야 터뜨린다 (그 전엔 쌓는다) */
    fireChain: [1, 2, 3, 4, 5] as readonly number[],
    /** 공격력 배율 — 초반엔 봐준다. 5+ 에서만 조금씩 세진다 */
    attackScale: [0.7, 0.85, 1, 1, 1] as readonly number[],
    /** 5 이후 1 오를 때마다 */
    plus: {
      thinkMul: 0.85,
      thinkMin: 0.06,
      moveMul: 0.88,
      moveMin: 0.025,
      mistakeMul: 0.6,
      fireStep: 0.5,
      fireMax: 7,
      attackStep: 0.05,
      attackMax: 1.25,
    },
    /** 여유가 없으면(위험도·받을 방해 블록) 연쇄 길이를 따지지 않고 바로 터뜨린다 */
    panicDanger: 0.55,
    panicIncoming: 12,
    /** 상대(플레이어) 필드가 이만큼 위험하면 2연쇄라도 바로 친다 — 공개 정보만 쓴다 (§23) */
    strikeFrom: 4,
    strikeDanger: 0.55,
    /** KO 된 뒤 새 필드로 다시 시작할 때까지 */
    rebootSec: 2.2,
    /** KO 보너스를 받으려면 그 AI 에게 이만큼은 보냈어야 한다 (자멸은 보너스 없음) */
    koMinSent: 6,
  },

  /** 두 필드에 같이 걸리는 중력 (칸/초) — 난이도에 따라 빨라진다 (§19) */
  gravity: {
    cps: [0.9, 1.3, 1.8, 2.4, 3] as readonly number[],
    plusMul: 1.12,
    max: 12,
  },

  /** 🦉 아울 에너지 드랍 — AI LEVEL 3 이상을 본 판에서만 가끔 (서버 조건과 동일) */
  owlEnergy: { minLevel: 3, chance: 0.3 },

  /** 한 판 상한 — 서버 max_sec(1800)보다 먼저 끝낸다 */
  run: { hardCapSec: 1780, endDelay: 1.8 },

  /**
   * 일시정지 — 한 판에 합쳐서 이만큼만 (UI 전용, 규칙은 안 바뀐다). 멈춘 동안 필드는 가린다(생각할 시간 금지).
   * 멈춘 시간도 서버 경과시간(max_sec 1800)에 들어가므로 hardCapSec + intro + endDelay + 이 값이 1800 을 넘지 않게.
   */
  pause: { totalSec: 10 },

  platform: { K: 40, basePoints: 30, maxBonus: 270, maxSessionSec: 1800 },
} as const;

export type Config = typeof CFG;

/* ── 공용 수식 (엔진·점수·테스트·서버가 같은 값을 써야 하는 것들) ──────────── */

/** 연쇄 단계 k(1~) 의 공격력 (§9) */
export function stepPower(k: number, cells: number): number {
  const t = CFG.attack.table;
  const base = k <= t.length ? t[Math.max(1, k) - 1] : t[t.length - 1] + (k - t.length) * CFG.attack.step7;
  return base + Math.max(0, cells - CFG.matchMin) * CFG.attack.perExtraCell;
}

/** 연쇄 단계 k(1~) 의 점수 배율 (§9) */
export function comboMult(k: number): number {
  const t = CFG.score.comboMult;
  if (k <= 1) return t[0];
  if (k <= t.length) return t[k - 1];
  return t[t.length - 1] + (k - t.length) * CFG.score.comboStep7;
}

/** 표시 LEVEL (1~5) */
export function levelOf(d: number): number {
  return Math.max(1, Math.min(5, Math.floor(d)));
}

/** 5 이후 '+' 개수 (0~maxPlus+1, maxPlus+1 = MAX) */
export function plusOf(d: number): number {
  if (d < 6) return 0;
  return Math.min(CFG.difficulty.maxPlus + 1, Math.floor(d - 5));
}

/** AI LEVEL 점수 배율 (§25) — 표시 난이도(최고치) 기준 */
export function aiMult(d: number): number {
  const t = CFG.score.aiMult;
  if (d < 5) return t[levelOf(d) - 1];
  return Math.min(CFG.score.aiPlusMax, t[4] + (d - 5) * CFG.score.aiPlusStep);
}

/** 생존 보너스 합계 (§26) — 지난 이정표를 전부 더한다 */
export function survivalBonus(sec: number): number {
  let sum = 0;
  for (const [at, pts] of CFG.score.survival) if (sec >= at) sum += pts;
  return sum;
}

/** LEVEL 1~5 기준표 + 5 이후 규칙으로 보간한 값 */
export function lerpLevel(table: readonly number[], d: number): number {
  const x = Math.max(1, Math.min(5, d)) - 1;
  const i = Math.min(3, Math.floor(x));
  const f = x - i;
  return table[i] + (table[i + 1] - table[i]) * f;
}

/** 두 필드 공통 중력 (칸/초) */
export function gravityCps(d: number): number {
  const g = CFG.gravity;
  const base = lerpLevel(g.cps, d);
  if (d <= 5) return base;
  return Math.min(g.max, base * g.plusMul ** (d - 5));
}
