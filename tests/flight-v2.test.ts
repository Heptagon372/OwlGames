import { describe, expect, it } from "vitest";
import { CFG, FINAL_STAGE, type Color } from "@/games/flight/config";
import { findPath } from "@/games/flight/chunks/verify";
import { buildSetPiece, eventPool, introPlans, setPiecePool, type SetPieceKind } from "@/games/flight/engine/director";
import {
  createGame,
  gateColor,
  isBreaker,
  scoreMult,
  update,
  type Game,
  type Input,
} from "@/games/flight/engine/game";
import { buildBarrage, buildLasers, laserHits, laserState } from "@/games/flight/engine/hazards";
import { hitbox, stepPhysics } from "@/games/flight/engine/owl";
import type { Entity } from "@/games/flight/types";

const dt = CFG.physics.dt;
const OWL_X = CFG.physics.owlX;
const idle: Input = { flap: false, cycle: false, color: null };

/**
 * 첫 입력으로 게임을 시작하고 스포너가 깐 장애물을 치운다.
 * 기본은 초보 보호가 끝난 5단계 기준 (보호막 없음) — 초보 보호 자체를 볼 때만 `beginner`
 */
function started(seed = 7, beginner = false): Game {
  const g = createGame(seed);
  update(g, dt, { ...idle, flap: true });
  g.spawner.entities.length = 0;
  if (!beginner) {
    g.stage = g.stageMax = CFG.beginner.untilStage + 1;
    g.shields = 0;
  }
  return g;
}

/** 부엉이 바로 앞에 엔티티를 놓는다 */
function place(g: Game, e: Entity, dx: number): void {
  g.spawner.add(e, g.worldX + OWL_X + dx, CFG.scroll.v0);
}

/** 장애물 없이 n프레임 — 매 프레임 새로 깔리는 청크는 치운다 */
function run(g: Game, frames: number, input: Input = idle, keep = false): void {
  for (let i = 0; i < frames; i++) {
    if (!keep) g.spawner.entities.length = 0;
    g.y = CFG.view.h / 2;
    g.vy = 0;
    update(g, dt, input);
  }
}

describe("레이저 (2.0 §7) — 경고 없는 즉사기 금지", () => {
  it("경고 → 발사 → 끝 순서이고, 경고 중에는 닿아도 피해가 없다", () => {
    const [l] = buildLasers("single", [270], 1);
    expect(laserState(l)).toBe("warn");
    expect(laserHits(l, OWL_X, 270, 15)).toBe(false);
    l.t = l.warn + 0.01;
    expect(laserState(l)).toBe("fire");
    expect(laserHits(l, OWL_X, 270, 15)).toBe(true);
    expect(laserHits(l, OWL_X, 270 + 80, 15)).toBe(false);
    l.t = l.warn + l.fire + 0.01;
    expect(laserState(l)).toBe("done");
  });

  it("레이저는 즉사가 아니라 에너지 피해다", () => {
    const g = started();
    g.lasers.push(...buildLasers("single", [CFG.view.h / 2], 1));
    const before = g.energy.value;
    run(g, Math.ceil((CFG.laser.warn + 0.2) / dt));
    expect(g.status).not.toBe("dead");
    expect(before - g.energy.value).toBeGreaterThanOrEqual(CFG.laser.damage - 2);
  });

  it("폭격은 한 번에 한 레인만 켜진다 (항상 피할 곳이 있다)", () => {
    const lasers = buildBarrage([2, 0, 3, 1], 1);
    for (let t = 0; t < 6; t += 0.02) {
      for (const l of lasers) l.t = t;
      expect(lasers.filter((l) => laserState(l) === "fire").length).toBeLessThanOrEqual(1);
    }
  });

  it("LASER WARNING 은 170px 안전 띠를 남긴다", () => {
    const safeTop = 200;
    const lasers = buildLasers("event", [safeTop], 1);
    for (const l of lasers) l.t = l.warn + 0.1;
    const { ry } = hitbox("M");
    expect(lasers.some((l) => laserHits(l, OWL_X, safeTop + 85, ry))).toBe(false);
    expect(lasers.some((l) => laserHits(l, OWL_X, 60, ry))).toBe(true);
    expect(lasers.some((l) => laserHits(l, OWL_X, 480, ry))).toBe(true);
  });
});

describe("미사일 (2.0 §13)", () => {
  it("LOCK ON 경고 뒤에 날아오고, 맞아도 죽지 않는다", () => {
    const g = started();
    g.stage = 5; // 주기 발사는 끄고 트리거 미사일만 본다
    update(g, dt, idle);
    g.missiles.push({ x: 0, y: 0, state: "lock", t: 0, aimY: g.y, delay: 0 });
    const before = g.energy.value;
    let flew = false;
    for (let i = 0; i < 240 && g.missiles.length; i++) {
      g.spawner.entities.length = 0;
      g.y = CFG.view.h / 2;
      g.vy = 0;
      update(g, dt, idle);
      if (g.missiles[0]?.state === "fly") flew = true;
    }
    expect(flew).toBe(true);
    expect(g.status).not.toBe("dead");
    expect(g.energy.value).toBeLessThan(before);
  });
});

describe("중력 반전 (2.0 §9)", () => {
  it("반전 중엔 가만히 있으면 위로 떨어지고, 날갯짓은 아래로 민다", () => {
    const fall = stepPhysics({ y: 300, vy: 0 }, false, 0.1, 1, -1);
    expect(fall.vy).toBeLessThan(0);
    const flap = stepPhysics({ y: 300, vy: 0 }, true, 0.1, 1, -1);
    expect(flap.vy).toBeGreaterThan(0);
  });

  it("flip 구역 안에서 게임 중력이 뒤집힌다", () => {
    const g = started();
    place(g, { t: "zone", x: 0, w: 600, kind: "flip" }, -100);
    run(g, 1, idle, true);
    expect(g.grav).toBe(-1);
  });
});

describe("FEVER · COLOR POWER · 선택형 보상", () => {
  it("게이지가 가득 차면 OWL FEVER — 점수 ×3", () => {
    const g = started();
    g.fever = 99;
    place(g, { t: "item", x: 0, y: g.y, kind: "star" }, 0);
    run(g, 1, idle, true);
    expect(g.feverT).toBeGreaterThan(0);
    expect(scoreMult(g)).toBeGreaterThanOrEqual(CFG.fever.scoreMult);
  });

  it("8단계부터 PERFECT 10연속이면 COLOR POWER, 빨강으로 쓰면 BREAKER 가 앞 장애물을 부순다", () => {
    const g = started();
    g.stage = g.stageMax = CFG.power.fromStage;
    g.color = "R";
    for (let i = 0; i < CFG.power.need; i++) {
      place(g, { t: "gate", x: 0, y: 0, h: CFG.view.h, color: "R" }, 0);
      run(g, 1, idle, true);
      g.spawner.entities.length = 0;
    }
    expect(g.powerReady).toBe(true);
    place(g, { t: "pillar", x: 0, gapY: 60, gapH: 100 }, 200);
    run(g, 1, { ...idle, skill: true }, true);
    expect(isBreaker(g)).toBe(true);
    expect(g.spawner.entities.some((s) => s.e.t === "pillar" && !s.gone)).toBe(false);
  });

  it("5단계에 들어서면 CHOOSE 1 — 고르기 전엔 세상이 멈춘다", () => {
    const g = started();
    g.worldX = (CFG.stages[4].from + 1) * CFG.physics.pxPerMeter;
    g.meters = CFG.stages[4].from + 1;
    g.stage = 4;
    run(g, 1);
    expect(g.stage).toBe(5);
    expect(g.choice).not.toBeNull();
    const x = g.worldX;
    run(g, 30);
    expect(g.worldX).toBe(x);
    const first = g.choice!.options[0];
    run(g, 1, { ...idle, pick: 0 });
    expect(g.choice).toBeNull();
    expect(first).toBeTruthy();
    // 단계 완주 보너스
    expect(g.score.bonusScore).toBeGreaterThan(0);
  });
});

describe("초보 보호 (1~4단계)", () => {
  it("보호막 1겹을 들고 시작하고, 색을 틀려도 덜 아프고 느려지지 않는다", () => {
    expect(createGame(1).shields).toBe(CFG.beginner.shield);
    expect(createGame(1).energy.value).toBe(createGame(1).energy.max);
    const g = started(7, true);
    g.color = "R";
    g.spawner.add({ t: "gate", x: 0, y: 0, h: CFG.view.h, color: "B" }, g.worldX + OWL_X, CFG.scroll.v0);
    const before = g.energy.value;
    run(g, 1, idle, true);
    expect(before - g.energy.value).toBeLessThan(CFG.energy.gateFail);
    expect(g.slow).toBe(0);
  });

  it("초반 단계는 쉬운 청크만 고른다", () => {
    const caps = CFG.stages.map((s) => (s as { cap?: number }).cap);
    expect(caps[0]).toBe(1);
    for (let i = 0; i < CFG.beginner.untilStage; i++) expect(caps[i]).toBeLessThanOrEqual(3);
  });
});

describe("거짓말하는 색 (2.0 §15)", () => {
  it("멀리서는 가짜 색, 도착 직전엔 진짜 색이 보이고 판정은 진짜 색으로 한다", () => {
    const e: Entity = { t: "gate", x: 0, y: 0, h: CFG.view.h, color: "B", fake: "R" };
    const s = { e, x: 0, chunkX: 0, chunkScroll: 400, w: CFG.entity.gateW };
    expect(gateColor(s, OWL_X + 400 * 2, 400)).toBe("R");
    expect(gateColor(s, OWL_X + 400 * (CFG.glitch.revealSec - 0.1), 400)).toBe("B");

    const g = started();
    g.color = "R";
    g.spawner.add(e, g.worldX + OWL_X, 400);
    const before = g.energy.value;
    run(g, 1, idle, true);
    expect(before - g.energy.value).toBeGreaterThanOrEqual(CFG.energy.gateFail);
  });
});

describe("디렉터 · 세트피스 (2.0 §3~§18)", () => {
  it("2단계부터 새 요소는 단계 첫 칸에서 반드시 소개된다", () => {
    for (let stage = 2; stage <= FINAL_STAGE; stage++) {
      if (stage === 3) continue; // 에너지는 별도 세트피스 없이 배너로만 소개
      expect(introPlans(stage).length, `stage ${stage}`).toBeGreaterThan(0);
    }
    expect(introPlans(1)).toEqual([]);
  });

  it("랜덤 이벤트는 5단계부터", () => {
    expect(eventPool(4)).toEqual([]);
    expect(eventPool(5).length).toBeGreaterThan(0);
    expect(eventPool(14).length).toBeGreaterThan(eventPool(5).length);
  });

  // 레이저·미사일은 화면 좌표라 BFS 가 모른다 → 장애물이 있는 세트피스만 S·M·L 통과 가능성을 검증한다
  // (색 체인·깃털 비·중력 혼돈은 막는 게 없다). 가장 느린/빠른 검증 속도 두 가지로 본다.
  const KINDS: SetPieceKind[] = ["beams", "movers", "wave", "flip", "storm", "golden", "missileRun"];
  const PHASES = [0, 4] as const;
  it(
    "코드로 만든 세트피스도 S·M·L 모두 통과할 길이 있다",
    () => {
      const problems: string[] = [];
      for (const kind of KINDS) {
        for (const phase of PHASES) {
          for (let seed = 1; seed <= 2; seed++) {
            let a = seed * 9973;
            const rand = () => ((a = (a * 16807) % 2147483647) / 2147483647);
            const stage = kind === "gravityChaos" ? 14 : 10;
            const sc = CFG.phaseRef[phase].scroll;
            const chunk = { ...buildSetPiece(kind, { stage, sc, rand, chainId: 1 }), phase };
            for (const size of ["S", "M", "L"] as const) {
              const r = findPath(chunk, size);
              if (!r.ok) problems.push(`${kind} P${phase} seed${seed} ${size}`);
            }
          }
        }
      }
      expect(problems).toEqual([]);
    },
    240_000,
  );

  it("세트피스 풀은 단계가 오를수록 넓어진다", () => {
    expect(setPiecePool(4)).toEqual([]);
    expect(setPiecePool(5)).toContain("laser");
    expect(setPiecePool(14)).toContain("gravityChaos");
  });

  it("색 체인은 게이트 간격이 서버 규칙(8m)보다 넓다", () => {
    let a = 1;
    const rand = () => ((a = (a * 16807) % 2147483647) / 2147483647);
    const c = buildSetPiece("chain", { stage: 8, sc: 288, rand, chainId: 1 }, { n: 10 });
    const xs = c.entities.filter((e) => e.t === "gate").map((e) => e.x);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(8 * CFG.physics.pxPerMeter);
    const colors = c.entities.filter((e): e is Extract<Entity, { t: "gate" }> => e.t === "gate").map((e) => e.color);
    expect(new Set<Color>(colors).size).toBe(3);
  });
});
