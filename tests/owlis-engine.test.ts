import { describe, expect, it } from "vitest";
import { CFG, aiMult, comboMult, gravityCps, levelOf, plusOf, stepPower, survivalBonus } from "@/games/owlis/config";
import {
  COLS,
  DEATH_CELL,
  GARBAGE,
  ROWS,
  applyGravity,
  at,
  colHeight,
  markGroups,
  newBoard,
  newScratch,
  resolve,
  type StepResult,
} from "@/games/owlis/engine/board";
import { applyPlacement, pairAt, placements, tryRotate, type Piece, type Placement } from "@/games/owlis/engine/piece";
import { holdPiece, newField, peek, rotate, updateField, type FieldHooks } from "@/games/owlis/engine/field";
import { addPerf, aiParams, bumpKO, levelLabel, newDifficulty, tickDifficulty } from "@/games/owlis/engine/difficulty";
import { newBrain, updateBrain } from "@/games/owlis/engine/ai";
import { act, createGame, hooksOf, update } from "@/games/owlis/engine/game";
import { buildMeta, clearScoreCap, rawScore, serverRaw, serverReject } from "@/games/owlis/engine/score";

const DT = 1 / 60;
const noHooks: FieldHooks = { onStep() {}, onChainEnd() {}, onLock() {}, onGarbage() {}, onDead() {} };

/** 문자열 그림 → 보드 (맨 아래 줄부터 맞춘다). '.'=빈칸 · 1~4 색 · 'x' 방해 */
function board(rows: string[]) {
  const b = newBoard();
  const off = ROWS - rows.length;
  rows.forEach((line, r) => {
    [...line].forEach((ch, c) => {
      b[at(c, r + off)] = ch === "." ? 0 : ch === "x" ? GARBAGE : Number(ch);
    });
  });
  return b;
}

describe("아울리스 공식 (config)", () => {
  it("연쇄 공격력·점수 배율은 GDD §9 표를 따른다", () => {
    expect([1, 2, 3, 4, 5, 6].map((k) => stepPower(k, 4))).toEqual([1, 2, 4, 6, 9, 12]);
    expect(stepPower(7, 4)).toBe(16);
    expect(stepPower(1, 6)).toBe(2); // 4개 넘긴 2칸 × 0.5
    expect([1, 2, 3, 4, 5, 6, 7].map(comboMult)).toEqual([1, 1.2, 1.5, 2, 2.5, 3, 3.5]);
  });

  it("AI LEVEL 배율 (§25) 과 표시 LEVEL · '+'", () => {
    expect([1, 2.5, 3, 4.99, 5].map(aiMult)).toEqual([1, 1.2, 1.5, 2, 3]);
    expect(aiMult(7)).toBe(4);
    expect(aiMult(40)).toBe(CFG.score.aiPlusMax);
    expect([1.2, 4.9, 5.5, 6.1, 8.9, 12].map(levelLabel)).toEqual(["1", "4", "5", "5+", "5+++", "5 MAX"]);
    expect(levelOf(9)).toBe(5);
    expect(plusOf(5.9)).toBe(0);
  });

  it("생존 보너스는 지난 이정표의 합 (§26)", () => {
    expect(survivalBonus(59)).toBe(0);
    expect(survivalBonus(60)).toBe(100);
    expect(survivalBonus(300)).toBe(1600);
    expect(survivalBonus(1200)).toBe(26600);
  });

  it("중력은 난이도에 따라 오르고 상한이 있다", () => {
    expect(gravityCps(1)).toBeCloseTo(CFG.gravity.cps[0]);
    expect(gravityCps(3)).toBeGreaterThan(gravityCps(2));
    expect(gravityCps(100)).toBe(CFG.gravity.max);
  });
});

describe("보드 규칙 (§7 · §8 · §12)", () => {
  const s = newScratch();
  const step: StepResult = { cells: 0, garbage: 0, groups: 0 };

  it("같은 색 4개가 상하좌우로 붙으면 터진다 — 3개·대각선은 안 터진다", () => {
    expect(markGroups(board(["1111"]), s, step)).toBe(true);
    expect(step.cells).toBe(4);
    expect(markGroups(board(["111."]), s, step)).toBe(false);
    expect(markGroups(board(["1...", ".1..", "..1.", "...1"]), s, step)).toBe(false);
    expect(markGroups(board(["1.", "11", "1."]), s, step)).toBe(true);
  });

  it("터지는 그룹에 붙은 방해 블록도 같이 부서진다", () => {
    const b = board(["x....", "1111x", "xx..."]);
    markGroups(b, s, step);
    expect(step.garbage).toBe(4);
  });

  it("중력은 열마다 블록을 바닥으로 내린다", () => {
    const b = board(["1.", "..", "2."]);
    applyGravity(b);
    expect(colHeight(b, 0)).toBe(2);
    expect(b[at(0, ROWS - 1)]).toBe(2);
    expect(b[at(0, ROWS - 2)]).toBe(1);
  });

  it("떨어진 블록이 다시 붙으면 연쇄가 된다 (2연쇄)", () => {
    // 2 네 개가 터지면 위의 1 이 떨어져 1 네 개가 된다
    const b = board(["1...", "2...", "2...", "2111", "2..."]);
    const r = resolve(b, s, { chain: 0, power: 0, cells: 0, garbage: 0 });
    expect(r.chain).toBe(2);
    expect(r.cells).toBe(8);
    expect(r.power).toBe(stepPower(1, 4) + stepPower(2, 4));
  });
});

describe("아울 블록 (§6)", () => {
  it("벽에 붙어 돌리면 한 칸 밀려난다", () => {
    const b = newBoard();
    const p: Piece = { c: COLS - 1, r: 5, rot: 0, a: 1, b: 2 };
    expect(tryRotate(b, p, 1)).toBe(true);
    expect(p.rot).toBe(1);
    expect(p.c).toBe(COLS - 2);
  });

  it("좁은 골짜기에서는 가로 대신 반 바퀴 돈다", () => {
    const b = board(["2.2", "2.2", "2.2", "2.2", "2.2"].map((x) => x.padEnd(COLS, ".")));
    const p: Piece = { c: 1, r: ROWS - 3, rot: 0, a: 1, b: 3 };
    expect(tryRotate(b, p, 1)).toBe(true);
    expect(p.rot).toBe(2);
  });

  it("빈 보드에서 서로 다른 자리 22개 (같은 색 두 칸이면 11개)", () => {
    const out: Placement[] = [];
    expect(placements(newBoard(), { a: 1, b: 2 }, CFG.field.spawnCol, out).length).toBe(22);
    expect(placements(newBoard(), { a: 3, b: 3 }, CFG.field.spawnCol, out).length).toBe(11);
  });

  it("가로 자리는 두 칸이 각자 떨어진다", () => {
    const b = board(["1....."]);
    expect(applyPlacement(b, { a: 2, b: 3 }, { col: 0, rot: 1 })).toBe(true);
    expect(colHeight(b, 0)).toBe(2);
    expect(colHeight(b, 1)).toBe(1);
  });
});

describe("필드 (조작 · 굳음 · 방해 블록)", () => {
  it("플레이어와 AI 는 같은 블록 순서를 받는다 · NEXT 개수보다 멀리는 못 본다", () => {
    const a = newField(0, 42, () => 0.5);
    const b = newField(1, 42, () => 0.5);
    for (let i = 0; i < 20; i++) expect(pairAt(a.seed, i)).toEqual(pairAt(b.seed, i));
    expect(peek(a, 10)).toEqual(peek(a, CFG.preview - 1));
  });

  it("바닥에서 계속 돌려도 결국 굳는다 (무한 회전 방지)", () => {
    const f = newField(0, 7, () => 0.5);
    // 가운데 열만 거의 꽉 차 있는 골짜기 — 돌리면 위로 튕기는 반 바퀴가 난다
    for (let r = 3; r < ROWS; r++) {
      f.board[at(1, r)] = 4;
      f.board[at(3, r)] = 4;
    }
    let locked = 0;
    const hooks: FieldHooks = { ...noHooks, onLock: () => locked++ };
    for (let i = 0; i < 60 * 20 && locked === 0; i++) {
      updateField(f, DT, 1, hooks);
      if (f.phase === "active") rotate(f, 1);
    }
    expect(locked).toBe(1);
  });

  it("HOLD 는 블록마다 한 번", () => {
    const f = newField(0, 9, () => 0.5);
    updateField(f, DT, 1, noHooks);
    expect(f.phase).toBe("active");
    expect(holdPiece(f)).toBe(true);
    expect(holdPiece(f)).toBe(false);
    expect(f.hold).not.toBeNull();
  });

  it("받을 방해 블록은 연쇄가 끝난 뒤 한 번에 최대 5줄까지 떨어진다", () => {
    const f = newField(0, 3, () => 0.37);
    f.incoming = 40;
    let got = 0;
    const hooks: FieldHooks = { ...noHooks, onGarbage: (_f, n) => (got += n) };
    for (let i = 0; i < 60 * 30 && got === 0; i++) updateField(f, DT, 20, hooks);
    expect(got).toBe(CFG.attack.maxDropCells);
    expect(f.incoming).toBe(40 - CFG.attack.maxDropCells);
    let garbage = 0;
    for (let i = 0; i < f.board.length; i++) if (f.board[i] === GARBAGE) garbage++;
    expect(garbage).toBe(CFG.attack.maxDropCells);
  });

  it("생성 칸이 막히면 패배", () => {
    const f = newField(0, 3, () => 0.5);
    f.board[DEATH_CELL] = GARBAGE;
    let dead = false;
    updateField(f, DT, 1, { ...noHooks, onDead: () => (dead = true) });
    expect(dead).toBe(true);
    expect(f.phase).toBe("dead");
  });
});

describe("DifficultyManager (§16 · §47 · §48)", () => {
  const out = { level: false, plus: false };

  it("아무리 잘해도 초당 maxUp + timeRamp 보다 빨리 오르지 않는다", () => {
    const x = newDifficulty();
    for (let i = 0; i < 60 * 100; i++) {
      addPerf(x, 5);
      tickDifficulty(x, DT, 0, out);
    }
    expect(x.peak).toBeLessThanOrEqual(1 + 100 * (CFG.difficulty.maxUp + CFG.difficulty.timeRamp) + 1e-6);
    expect(x.peak).toBeGreaterThan(3);
  });

  it("못해도 시간이 지나면 오른다 · 최고치 - 1 아래로는 안 내려간다", () => {
    const x = newDifficulty();
    for (let i = 0; i < 60 * 300; i++) {
      addPerf(x, -1);
      tickDifficulty(x, DT, 0.95, out);
    }
    expect(x.peak).toBeGreaterThan(1 + 300 * CFG.difficulty.timeRamp - 0.01);
    expect(x.d).toBeGreaterThanOrEqual(x.peak - CFG.difficulty.floorBelowPeak - 1e-9);
  });

  it("KO 는 난이도를 바로 올린다", () => {
    const x = newDifficulty();
    bumpKO(x);
    expect(x.peak).toBeCloseTo(1 + CFG.difficulty.koBump);
  });

  it("AI 파라미터: LEVEL 이 오를수록 빠르고 · 많이 보고 · 실수가 줄고 · 5+ 에서도 계속 강해진다", () => {
    const l1 = aiParams(1);
    const l3 = aiParams(3);
    const l5 = aiParams(5);
    const l8 = aiParams(8);
    expect(l1.candidates).toBe(2);
    expect(l5.candidates).toBe(22);
    expect(l3.thinkSec).toBeLessThan(l1.thinkSec);
    expect(l8.thinkSec).toBeLessThan(l5.thinkSec);
    expect(l8.mistake).toBeLessThan(l5.mistake);
    expect(l1.lookahead).toBe(false);
    expect(l5.lookahead).toBe(true);
    expect(l8.fireChain).toBeGreaterThanOrEqual(l5.fireChain);
    expect(l5.dropCps).toBe(Infinity);
  });
});

describe("AI (§21 · §46)", () => {
  it("AI 혼자 두면 블록을 계속 놓고, 높은 LEVEL 일수록 오래 버틴다", () => {
    const survive = (d: number) => {
      const f = newField(1, 1234, () => 0.5);
      const opp = newField(0, 1234, () => 0.5);
      const br = newBrain(5);
      let dead = false;
      const hooks: FieldHooks = { ...noHooks, onDead: () => (dead = true) };
      let t = 0;
      while (!dead && t < 240) {
        updateBrain(br, f, opp, d, DT, hooks);
        updateField(f, DT, gravityCps(d), hooks);
        t += DT;
      }
      return { t, pieces: f.stats.pieces, chains: f.stats.maxCombo };
    };
    const weak = survive(1);
    const strong = survive(5);
    expect(weak.pieces).toBeGreaterThan(10);
    expect(strong.t).toBeGreaterThanOrEqual(weak.t);
    expect(strong.chains).toBeGreaterThanOrEqual(2);
  }, 60_000);

  it("AI 는 플레이어 필드를 조작하지 않는다 (자기 필드만)", () => {
    const g = createGame(99);
    const before = g.player.board.slice();
    for (let i = 0; i < 60 * 5; i++) update(g, DT);
    // 플레이어 입력이 없으면 플레이어 블록은 중력으로만 떨어진다
    expect(g.player.stats.pieces).toBeLessThanOrEqual(1);
    expect(g.ai.stats.pieces).toBeGreaterThan(0);
    expect(g.player.board.filter((v) => v !== 0).length).toBeGreaterThanOrEqual(before.filter((v) => v !== 0).length);
  });
});

describe("한 판 (봇 대 AI) — 서버 식과 같은 결과", () => {
  const play = (seed: number, skill: number, capSec = 1200) => {
    const g = createGame(seed);
    const bot = newBrain(seed ^ 77);
    while (!g.over && g.t < capSec) {
      updateBrain(bot, g.player, g.ai, skill, DT, hooksOf(g));
      update(g, DT);
      g.fx.length = 0;
    }
    return g;
  };

  it("판이 끝나고, 메타는 서버 거부 기준을 통과하고, 서버 재계산 점수가 클라이언트와 같다", () => {
    for (const [seed, skill] of [
      [11, 2],
      [23, 3.5],
      [37, 5],
      [41, 6],
    ] as const) {
      const g = play(seed, skill);
      const m = buildMeta(g, "desktop");
      const elapsed = g.t + 3; // 서버 경과시간은 메뉴·READY 만큼 더 길다
      expect(serverReject(m, elapsed), `seed ${seed}`).toBeNull();
      expect(Math.abs(serverRaw(m, elapsed) - rawScore(g)), `seed ${seed}`).toBeLessThanOrEqual(1);
      expect(m.clear_score).toBeLessThanOrEqual(clearScoreCap(m));
      expect(m.cleared).toBeLessThanOrEqual(m.pieces * 2);
    }
  }, 120_000);

  it("잘하는 봇은 AI LEVEL 을 끌어올리고, 결국 진다 (끝이 있는 무한)", () => {
    const g = play(5, 6, 1780);
    expect(g.over).toBe(true);
    expect(g.end).toBe("topout");
    expect(g.diff.peak).toBeGreaterThan(5);
  }, 120_000);

  it("입력 액션은 게임이 끝나면 무시된다", () => {
    const g = createGame(1);
    g.over = true;
    act(g, "hard");
    expect(g.actions.length).toBe(0);
  });
});
