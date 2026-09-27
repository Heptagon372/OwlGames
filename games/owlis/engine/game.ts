// 🧩 아울리스 — GameManager (§31 핵심 루프)
//
//   플레이어 필드 ─┐                         ┌─ AI 필드 (AIManager 가 조작)
//                  ├─ 연쇄 → 공격 → 상쇄 → 상대에게 방해 블록 ─┤
//   DifficultyManager: 플레이어 성과 → 내부 난이도 D → AI 파라미터 · 두 필드 중력
//   ScoreManager: 플레이어만 점수를 번다 (AI LEVEL 배율 · 피버 · COUNTER · EMERGENCY · KO · 생존 보너스)
//
// 고정 타임스텝(1/60)으로만 돈다. React·DOM 을 모른다 — 헤드리스 봇 테스트가 그대로 돌린다.

import { msg, type Msg } from "@/games/core/i18n";
import { mulberry32 } from "@/games/core/canvas";
import { CFG, aiMult, comboMult, survivalBonus } from "../config";
import { COLS, dangerOf, type StepResult } from "./board";
import { newBrain, updateBrain, type Brain } from "./ai";
import { aiParams, addPerf, bumpKO, levelLabel, newDifficulty, perf, tickDifficulty, type AIParams, type DiffChange, type Difficulty } from "./difficulty";
import {
  hardDrop,
  holdPiece,
  moveX,
  newField,
  rebootField,
  rotate,
  updateField,
  type Field,
  type FieldHooks,
} from "./field";
import type { Banner, Fx } from "../types";

/** 효과음 신호 — 엔진은 비트만 세우고 소리는 UI 가 낸다 */
export const CUE = {
  LOCK: 1 << 0,
  CLEAR: 1 << 1,
  SEND: 1 << 2,
  GARBAGE: 1 << 3,
  EVOLVE: 1 << 4,
  COUNTER: 1 << 5,
  EMERGENCY: 1 << 6,
  KO: 1 << 7,
  FEVER: 1 << 8,
  CRITICAL: 1 << 9,
  DEAD: 1 << 10,
  MOVE: 1 << 11,
  ROTATE: 1 << 12,
  HOLD: 1 << 13,
  SURVIVAL: 1 << 14,
} as const;

export type Action = "left" | "right" | "rotL" | "rotR" | "hard" | "hold";

/** 누르고 있는 입력 (DAS 는 엔진이 처리한다) */
export type Held = { left: boolean; right: boolean; soft: boolean };

export type Game = {
  seed: number;
  t: number;
  over: boolean;
  end: "topout" | "time" | null;
  player: Field;
  ai: Field;
  brain: Brain;
  diff: Difficulty;
  /** 이번 틱 AI 파라미터 (중력·공격 배율) */
  ap: AIParams;

  held: Held;
  actions: Action[];
  das: { dir: number; t: number; arr: number };

  /** 점수 */
  clearScore: number;
  counters: number;
  emergencies: number;
  ko: number;
  fevers: number;
  /** 플레이어 필드에 방해 블록이 마지막으로 떨어진 시각 (COUNTER 판정) */
  lastHitAt: number;
  aiSentSinceReboot: number;
  survivalPaid: number;

  fever: { gauge: number; t: number };
  critical: boolean;
  owlEnergyFound: boolean;

  /** UI 로 넘기는 것 */
  fx: Fx[];
  cues: number;
  /** 마지막 연쇄 단계 (효과음 음높이) */
  cueChain: number;
  banner: Banner | null;
  /** 지금 연쇄 공격 게이지 (0~1, HUD) */
  attackLive: number;
};

export function createGame(seed: number): Game {
  const s = seed >>> 0;
  const diff = newDifficulty();
  return {
    seed: s,
    t: 0,
    over: false,
    end: null,
    // 플레이어와 AI 는 같은 블록 순서를 받는다 (공정). 방해 블록 위치 난수는 따로.
    player: newField(0, s, mulberry32(s ^ 0xa11ce)),
    ai: newField(1, s, mulberry32(s ^ 0xb0b)),
    brain: newBrain(s),
    diff,
    ap: aiParams(diff.d),
    held: { left: false, right: false, soft: false },
    actions: [],
    das: { dir: 0, t: 0, arr: 0 },
    clearScore: 0,
    counters: 0,
    emergencies: 0,
    ko: 0,
    fevers: 0,
    lastHitAt: -99,
    aiSentSinceReboot: 0,
    survivalPaid: 0,
    fever: { gauge: 0, t: 0 },
    critical: false,
    owlEnergyFound: false,
    fx: [],
    cues: 0,
    cueChain: 0,
    banner: null,
    attackLive: 0,
  };
}

function say(g: Game, m: Msg, tone: Banner["tone"], sub?: Msg, t = 1.6): void {
  g.banner = { m, sub, t, tone };
}

/* ── 점수 · 공격 (ScoreManager / AttackManager) ─────────────────── */

function feverOn(g: Game): boolean {
  return g.fever.t > 0;
}

function centroid(f: Field): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i < f.flash.length; i++) {
    if (!f.flash[i]) continue;
    sx += i % COLS;
    sy += Math.floor(i / COLS);
    n++;
  }
  return n ? { x: sx / n + 0.5, y: sy / n + 0.5 } : { x: COLS / 2, y: 6 };
}

/** 공격력 → 보낼 칸 수. 먼저 내게 올 방해 블록을 지우고(상쇄), 남으면 상대에게 (§10, §29) */
function sendAttack(g: Game, from: Field, to: Field, power: number, scale: number): { cancelled: number; sent: number } {
  const raw = power * CFG.attack.cellsPerPower * scale + from.carry;
  const cells = Math.floor(raw);
  from.carry = raw - cells;
  const cancelled = Math.min(from.incoming, cells);
  from.incoming -= cancelled;
  const sent = cells - cancelled;
  if (sent > 0) {
    to.incoming += sent;
    from.stats.sent += sent;
    g.fx.push({ k: "send", from: from.side, cells: sent });
    g.cues |= CUE.SEND;
  }
  return { cancelled, sent };
}

function makeHooks(g: Game): FieldHooks {
  return {
    onStep(f: Field, chain: number, step: StepResult) {
      const c = centroid(f);
      let pts = 0;
      if (f.side === 0) {
        pts = step.cells * CFG.score.cell * comboMult(chain) * aiMult(g.diff.peak) * (feverOn(g) ? CFG.fever.scoreMult : 1);
        g.clearScore += pts;
      }
      g.fx.push({ k: "clear", side: f.side, chain, x: c.x, y: c.y, pts: Math.round(pts) });
      if (f.side === 0) {
        g.cues |= CUE.CLEAR;
        g.cueChain = Math.max(g.cueChain, chain);
      }
    },

    onChainEnd(f: Field, chain: number, power: number) {
      if (f.side === 1) {
        sendAttack(g, f, g.player, power, g.ap.attackScale);
        return;
      }
      // 플레이어 연쇄 끝 — 보너스 · 공격 · 성과 · 피버
      const mult = aiMult(g.diff.peak) * (feverOn(g) ? CFG.fever.scoreMult : 1);
      if (chain >= 2) g.clearScore += CFG.score.chainBonus * chain * chain * mult;
      const hitRecently = f.chainIncoming > 0 || g.t - g.lastHitAt <= CFG.counter.windowSec;
      const { cancelled, sent } = sendAttack(g, f, g.ai, power, feverOn(g) ? CFG.fever.attackMult : 1);
      g.aiSentSinceReboot += sent;

      addPerf(g.diff, perf.chain(chain) + perf.sent(sent));

      // COUNTER (§29) 와 EMERGENCY (§28) 는 겹칠 수 있다 — 둘 다 세고, 배너는 COUNTER 가 먼저
      const counter = chain >= CFG.counter.minCombo && hitRecently && cancelled + sent > 0;
      const emergency = chain >= CFG.emergency.minCombo && f.chainDanger >= CFG.emergency.danger;
      if (counter) {
        g.counters++;
        g.cues |= CUE.COUNTER;
      }
      if (emergency) {
        g.emergencies++;
        g.cues |= CUE.EMERGENCY;
      }
      if (counter) say(g, msg("counter"), "gold", msg("counterSub", { n: chain }));
      else if (emergency) say(g, msg("emergency"), "red");
      else if (chain >= 2) say(g, msg("combo", { n: chain }), "cyan", undefined, 0.9);

      // FEVER 게이지 (§30)
      if (!feverOn(g)) {
        g.fever.gauge += chain >= 2 ? CFG.fever.perCombo * chain : CFG.fever.single;
        if (g.fever.gauge >= 1) {
          g.fever.gauge = 1;
          g.fever.t = CFG.fever.sec;
          g.fevers++;
          g.cues |= CUE.FEVER;
          say(g, msg("fever"), "violet", msg("feverSub"), 2);
        }
      }
    },

    onLock(f: Field) {
      if (f.side === 0) g.cues |= CUE.LOCK;
    },

    onGarbage(f: Field, cells: number) {
      g.fx.push({ k: "garbage", side: f.side, cells });
      if (f.side === 0) {
        g.lastHitAt = g.t;
        g.cues |= CUE.GARBAGE;
        addPerf(g.diff, perf.received(cells));
      }
    },

    onDead(f: Field) {
      if (f.side === 0) {
        g.over = true;
        g.end = "topout";
        g.cues |= CUE.DEAD;
        g.fx.push({ k: "dead" });
        return;
      }
      // AI KO — 내가 충분히 몰아붙였으면 KO 보너스, 아니면 그냥 재부팅
      if (g.aiSentSinceReboot >= CFG.ai.koMinSent) {
        g.ko++;
        bumpKO(g.diff);
        g.cues |= CUE.KO;
        g.fx.push({ k: "ko" });
        say(g, msg("ko"), "gold", msg("koSub"), 2);
      } else {
        say(g, msg("reboot"), "violet", undefined, 1.4);
      }
      g.aiSentSinceReboot = 0;
      rebootField(f, CFG.ai.rebootSec);
    },
  };
}

/* ── 입력 ─────────────────────────────────────────────────────── */

function applyInput(g: Game, dt: number, hooks: FieldHooks): void {
  const f = g.player;
  for (const a of g.actions) {
    if (a === "left" && moveX(f, -1)) g.cues |= CUE.MOVE;
    else if (a === "right" && moveX(f, 1)) g.cues |= CUE.MOVE;
    else if (a === "rotL" && rotate(f, -1)) g.cues |= CUE.ROTATE;
    else if (a === "rotR" && rotate(f, 1)) g.cues |= CUE.ROTATE;
    else if (a === "hard") hardDrop(f, hooks);
    else if (a === "hold" && holdPiece(f)) g.cues |= CUE.HOLD;
  }
  g.actions.length = 0;

  // 좌우 누르고 있기 (DAS → ARR). 첫 칸은 누르는 순간 "left"/"right" 액션으로 이미 움직였다 —
  // 누름·뗌이 한 프레임 안에 끝나는 짧은 탭도 놓치지 않게.
  const h = g.held;
  const dir = h.left === h.right ? 0 : h.left ? -1 : 1;
  const d = g.das;
  if (dir !== d.dir) {
    d.dir = dir;
    d.t = 0;
    d.arr = 0;
  } else if (dir !== 0) {
    d.t += dt;
    if (d.t >= CFG.control.das) {
      d.arr += dt;
      while (d.arr >= CFG.control.arr) {
        d.arr -= CFG.control.arr;
        if (!moveX(f, dir as -1 | 1)) break;
      }
    }
  }
  f.soft = h.soft;
}

/* ── 한 틱 ───────────────────────────────────────────────────── */

const hooksCache = new WeakMap<Game, FieldHooks>();
const change: DiffChange = { level: false, plus: false };

/** 게임의 필드 훅 (헤드리스 봇이 플레이어 필드를 AI 로 조작할 때도 쓴다) */
export function hooksOf(g: Game): FieldHooks {
  let hooks = hooksCache.get(g);
  if (!hooks) {
    hooks = makeHooks(g);
    hooksCache.set(g, hooks);
  }
  return hooks;
}

export function update(g: Game, dt: number): void {
  if (g.over) {
    if (g.banner) g.banner.t -= dt;
    return;
  }
  const hooks = hooksOf(g);
  g.t += dt;

  // 난이도 → 파라미터 (중력은 두 필드 공통 §19)
  aiParams(g.diff.d, g.ap);
  const gravity = g.ap.gravity;

  applyInput(g, dt, hooks);
  updateField(g.player, dt, gravity, hooks);
  if (g.over) return;

  updateBrain(g.brain, g.ai, g.player, g.diff.d, dt, hooks);
  updateField(g.ai, dt, gravity, hooks);

  // 난이도 (§16~§19) — LEVEL 이 오르면 연출 (§41)
  const danger = dangerOf(g.player.board);
  tickDifficulty(g.diff, dt, danger, change);
  if (change.level || change.plus) {
    g.cues |= CUE.EVOLVE;
    const lv = levelLabel(g.diff.peak);
    if (change.plus) say(g, msg("learning"), "red", msg("levelNow", { lv }), 2.2);
    else if (lv === "5") say(g, msg("hardcore"), "red", msg("hardcoreSub"), 2.4);
    else say(g, msg("evolved"), "violet", msg("levelNow", { lv }), 1.8);
  }

  // 위험도 (§27, §28)
  const crit = danger >= CFG.danger.critical;
  if (crit && !g.critical) g.cues |= CUE.CRITICAL;
  g.critical = crit;

  // 피버 (§30)
  if (g.fever.t > 0) {
    g.fever.t = Math.max(0, g.fever.t - dt);
    g.fever.gauge = g.fever.t / CFG.fever.sec;
  }

  // 생존 보너스 이정표 (§26)
  const next = CFG.score.survival[g.survivalPaid];
  if (next && g.t >= next[0]) {
    g.survivalPaid++;
    g.cues |= CUE.SURVIVAL;
    say(g, msg("survival", { min: Math.round(next[0] / 60) }), "cyan", msg("plus", { n: next[1] }), 1.6);
  }

  // 공격 게이지 (HUD) — 지금 쌓이는 연쇄 공격력
  const live = g.player.chainPower * CFG.attack.cellsPerPower / CFG.attack.maxDropCells;
  g.attackLive = Math.min(1, Math.max(live, g.attackLive - dt * 0.8));

  if (g.banner) {
    g.banner.t -= dt;
    if (g.banner.t <= 0) g.banner = null;
  }

  // 한 판 상한 (서버 max_sec 전에 끝낸다)
  if (g.t >= CFG.run.hardCapSec) {
    g.over = true;
    g.end = "time";
    say(g, msg("timeUp"), "gold", undefined, 3);
  }
}

/** 플레이어 입력 한 번 (터치 버튼·키) */
export function act(g: Game, a: Action): void {
  if (!g.over) g.actions.push(a);
}

/** HUD 에서 쓰는 생존 보너스 합 */
export function survivalSoFar(g: Game): number {
  return survivalBonus(Math.floor(g.t));
}
