// 🧩 아울리스 — DifficultyManager (§16~§19, §44, §47~§49)
//
// 플레이어의 성과(Performance Score)가 `pending` 에 쌓이고, 초당 조금씩 내부 난이도 D 로 옮겨진다.
// 여기에 시간 몫(timeRamp)이 늘 더해진다 — 서버의 level_max 상한 = 1 + 경과초 × (maxUp + timeRamp) + KO × koBump.
//   + 연쇄 · 보낸 방해 블록 · 버틴 시간     − 받은 방해 블록 · 위험한 필드
// D 는 초당 maxUp 보다 빨리 오르지 않고(§47 부드러운 보간), 못할 때는 내려가되 최고치 - 1 아래로는 안 간다(§48).
// 화면 LEVEL 은 **최고치**를 따른다 — 한 번 오른 LEVEL 은 떨어지지 않는다(§48). 대신 AI 파라미터는 지금 D 를 따른다.
//
// AI 파라미터(속도·판단력)는 전부 `aiParams(D)` 한 곳에서 나온다 — 코드 곳곳에 난이도를 하드코딩하지 않는다(§52).

import { CFG, gravityCps, lerpLevel, levelOf, plusOf } from "../config";

export type Difficulty = {
  /** 지금 내부 난이도 (1 ~ ∞) */
  d: number;
  /** 지금까지 최고 — 표시 LEVEL 과 점수 배율은 이것을 쓴다 */
  peak: number;
  /** 아직 D 로 옮겨지지 않은 성과 */
  pending: number;
};

export function newDifficulty(): Difficulty {
  const d = CFG.difficulty.start;
  return { d, peak: d, pending: 0 };
}

/** 성과를 쌓는다 (음수면 감점) */
export function addPerf(x: Difficulty, v: number): void {
  const lim = CFG.difficulty.pendingClamp;
  x.pending = Math.max(-lim, Math.min(lim, x.pending + v));
}

export const perf = {
  chain: (k: number) => CFG.difficulty.perf.chainK * k * k,
  sent: (cells: number) => CFG.difficulty.perf.sentK * cells,
  received: (cells: number) => -CFG.difficulty.perf.receivedK * cells,
};

export type DiffChange = { level: boolean; plus: boolean };

/**
 * 한 틱. 표시 LEVEL 이나 '+' 가 올랐으면 알려 준다 (배너용).
 * `danger` = 플레이어 필드 위험도 (0~1).
 */
export function tickDifficulty(x: Difficulty, dt: number, danger: number, out: DiffChange): DiffChange {
  const c = CFG.difficulty;
  out.level = false;
  out.plus = false;

  if (danger > c.perf.dangerFrom) {
    addPerf(x, (-c.perf.dangerK * (danger - c.perf.dangerFrom)) / (1 - c.perf.dangerFrom) * dt);
  }

  // 성과 몫은 초당 maxUp / maxDown 으로 제한해 옮기고, 시간 몫(timeRamp)은 성과와 상관없이 늘 더한다
  // — 계속 못해도 난이도는 결국 오르고, 판은 언젠가 끝난다.
  const want = x.pending * Math.min(1, c.response * dt);
  const applied = Math.max(-c.maxDown * dt, Math.min(c.maxUp * dt, want));
  x.pending -= applied;

  const beforeLevel = levelOf(x.peak);
  const beforePlus = plusOf(x.peak);
  // 시간 몫은 최고치(= 표시 LEVEL · 바닥)도 같이 밀어 올린다
  const ramp = c.timeRamp * dt;
  x.d = Math.max(c.start, x.peak - c.floorBelowPeak, x.d + applied) + ramp;
  x.peak = Math.max(x.peak + ramp, x.d);
  out.level = levelOf(x.peak) > beforeLevel;
  out.plus = plusOf(x.peak) > beforePlus;
  return out;
}

/** AI 를 KO — 난이도가 바로 조금 오른다 (서버 상한식에도 들어간다) */
export function bumpKO(x: Difficulty): void {
  x.d += CFG.difficulty.koBump;
  if (x.d > x.peak) x.peak = x.d;
}

/** 화면 표시: "3" · "5" · "5+" · "5++" · "5 MAX" */
export function levelLabel(d: number): string {
  const lv = levelOf(d);
  const plus = plusOf(d);
  if (plus > CFG.difficulty.maxPlus) return `${lv} MAX`;
  return `${lv}${"+".repeat(plus)}`;
}

/* ── AI 파라미터 (§15, §22, §45) ─────────────────────────────── */

export type AIParams = {
  thinkSec: number;
  moveSec: number;
  /** 떨어뜨리는 속도 (칸/초). Infinity 면 하드 드롭 */
  dropCps: number;
  candidates: number;
  lookahead: boolean;
  beam: number;
  mistake: number;
  potential: number;
  fireChain: number;
  attackScale: number;
  /** 한 틱에 평가할 수 있는 배치 수 — 계산을 여러 프레임에 나눈다 (모바일에서 프레임이 튀지 않게) */
  evalsPerTick: number;
  gravity: number;
};

export function aiParams(d: number, out?: AIParams): AIParams {
  const a = CFG.ai;
  const p = a.plus;
  const over = Math.max(0, d - 5);
  const o: AIParams = out ?? ({} as AIParams);
  o.thinkSec = Math.max(p.thinkMin, lerpLevel(a.thinkSec, d) * p.thinkMul ** over);
  o.moveSec = Math.max(p.moveMin, lerpLevel(a.moveSec, d) * p.moveMul ** over);
  o.dropCps = d >= 5 ? Infinity : lerpLevel(a.dropCps, d);
  o.candidates = Math.round(lerpLevel(a.candidates, d));
  o.lookahead = d >= a.lookaheadFrom;
  o.beam = a.beam + Math.floor(over);
  o.mistake = lerpLevel(a.mistake, d) * p.mistakeMul ** over;
  o.potential = lerpLevel(a.potential, d);
  o.fireChain = Math.min(p.fireMax, Math.round(lerpLevel(a.fireChain, d) + over * p.fireStep));
  o.attackScale = Math.min(p.attackMax, lerpLevel(a.attackScale, d) + over * p.attackStep);
  o.evalsPerTick = Math.min(16, Math.round(12 * (1 + over * 0.5)));
  o.gravity = gravityCps(d);
  return o;
}
