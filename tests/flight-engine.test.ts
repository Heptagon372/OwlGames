import { describe, expect, it } from "vitest";
import { CFG, comboMult, isOverdrive, nextColor, phaseFromMeters, scrollFromMeters, stageFromMeters } from "@/games/flight/config";
import { createGame, currentRaw, update } from "@/games/flight/engine/game";
import * as Energy from "@/games/flight/engine/energy";
import * as Score from "@/games/flight/engine/score";
import { isNearMiss } from "@/games/flight/engine/collision";
import { hitbox, stepPhysics } from "@/games/flight/engine/owl";

const noInput = { flap: false, cycle: false, color: null } as const;

describe("아울러닝 물리 (기획서 §2)", () => {
  it("중력과 날갯짓 합력이 명세대로다", () => {
    const fall = stepPhysics({ y: 100, vy: 0 }, false, 1);
    expect(fall.vy).toBe(CFG.physics.vyMaxDown); // 1초면 상한에 걸린다
    const rise = stepPhysics({ y: 100, vy: 0 }, true, 0.1);
    expect(Math.round(rise.vy)).toBe(Math.round((CFG.physics.gravity + CFG.physics.flap) * 0.1)); // 합력 -800
  });

  it("수직 속도는 상·하한을 넘지 않는다", () => {
    expect(stepPhysics({ y: 0, vy: -999 }, true, 0.2).vy).toBeGreaterThanOrEqual(CFG.physics.vyMaxUp);
    expect(stepPhysics({ y: 0, vy: 999 }, false, 0.2).vy).toBeLessThanOrEqual(CFG.physics.vyMaxDown);
  });

  it("크기가 커질수록 히트박스가 커진다", () => {
    expect(hitbox("S").ry).toBeLessThan(hitbox("M").ry);
    expect(hitbox("M").ry).toBeLessThan(hitbox("L").ry);
  });
});

describe("에너지 (§5)", () => {
  it("날갯짓에만 소비되고 활공은 0이다", () => {
    const e = Energy.initEnergy("M");
    const before = e.value;
    Energy.drainFlap(e, 1, 1);
    expect(before - e.value).toBeCloseTo(CFG.energy.flapDrain, 5);
  });

  it("⚡ 효율 버프는 소비를 절반으로 줄인다", () => {
    const e = Energy.initEnergy("M");
    e.efficiency = CFG.energy.efficiencySec;
    const before = e.value;
    Energy.drainFlap(e, 1, 1);
    expect(before - e.value).toBeCloseTo(CFG.energy.flapDrain * CFG.energy.efficiencyMult, 5);
  });

  it("크기를 바꾸면 최대치가 바뀌고 비율이 유지된다", () => {
    const e = Energy.initEnergy("M");
    Energy.setSize(e, "L");
    expect(e.max).toBe(CFG.energy.maxBySize.L);
    expect(e.value / e.max).toBeCloseTo(CFG.energy.startRatio, 5);
  });
});

describe("점수 (§11.1)", () => {
  it("콤보 배율은 10단위로 오르고 2.5에서 멈춘다", () => {
    expect(comboMult(0)).toBe(1);
    expect(comboMult(9)).toBe(1);
    expect(comboMult(10)).toBe(1.25);
    expect(comboMult(60)).toBe(2.5);
    expect(comboMult(999)).toBe(2.5);
  });

  it("원점수가 서버 재계산식과 정확히 같다 (2.0)", () => {
    const s = Score.initScore();
    // 통과 12회 + 니어미스 3회 + PERFECT 4회 + 아이템 몇 개 + 배율·보너스
    for (let i = 0; i < 12; i++) Score.onPass(s);
    for (let i = 0; i < 3; i++) Score.onNearMiss(s, 1.5);
    for (let i = 0; i < 4; i++) Score.onPerfect(s, 2);
    Score.onItem(s, "feather");
    Score.onItem(s, "gem", 3);
    Score.addBonus(s, 250);

    const raw = Score.rawScore({ meters: 1000, s, energyLeft: 40 });
    const mult = s.multSum / s.multCount;
    // 서버: 거리 + 통과×10×평균배율 + 니어미스×50×평균배율 + PERFECT×40 + 아이템 + 에너지×2 + bonus
    const server =
      1000 +
      s.passCount * CFG.score.perPass * mult +
      s.nearMiss * CFG.score.nearMiss * mult +
      s.perfect * CFG.perfect.score +
      s.itemScore +
      40 * CFG.score.energyLeft +
      s.bonusScore;
    expect(Math.abs(raw - server) / server).toBeLessThan(0.05);
    expect(s.itemScore).toBe(10 + 150); // 아이템 기본 점수는 배율 없이
  });

  it("배율로 더 번 몫은 bonus 로 따로 집계되고, 배율 곱은 상한에서 멈춘다", () => {
    const s = Score.initScore();
    Score.onPerfect(s, 3);
    expect(s.bonusScore).toBe(CFG.perfect.score * 2);
    const t = Score.initScore();
    Score.onItem(t, "star", 999);
    expect(t.bonusScore).toBe(50 * (CFG.multCap - 1));
  });

  it("니어미스 판정 여유는 12px", () => {
    expect(isNearMiss(0)).toBe(false); // 0은 충돌
    expect(isNearMiss(CFG.score.nearMissMarginPx)).toBe(true);
    expect(isNearMiss(CFG.score.nearMissMarginPx + 0.1)).toBe(false);
  });
});

describe("15단계 · 페이즈 · 스크롤 (2.0 §2)", () => {
  it("거리로 단계가 오르고, 15단계 뒤에는 ∞ 레벨이 쌓인다", () => {
    expect(stageFromMeters(0)).toBe(1);
    expect(stageFromMeters(CFG.stages[1].from)).toBe(2);
    expect(stageFromMeters(CFG.stages[14].from)).toBe(15);
    expect(stageFromMeters(CFG.infinite.from - 1)).toBe(15);
    expect(stageFromMeters(CFG.infinite.from)).toBe(16);
    expect(stageFromMeters(CFG.infinite.from + CFG.infinite.every)).toBe(17);
    for (let i = 1; i < CFG.stages.length; i++) expect(CFG.stages[i].from).toBeGreaterThan(CFG.stages[i - 1].from);
  });

  it("단계 → 내부 페이즈 P0~P4 는 줄지 않는다", () => {
    expect(phaseFromMeters(0)).toBe(0);
    let prev = 0;
    for (let m = 0; m <= 4000; m += 25) {
      const p = phaseFromMeters(m);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    expect(phaseFromMeters(9999)).toBe(4);
  });

  it("속도는 단조 증가하고 ∞ 상한을 넘지 않는다", () => {
    let prev = 0;
    for (let m = 0; m <= 8000; m += 50) {
      const v = scrollFromMeters(m);
      expect(v).toBeGreaterThanOrEqual(prev - 0.001);
      expect(v).toBeLessThanOrEqual(CFG.scroll.vMax * CFG.infinite.scrollMaxMult + 0.001);
      prev = v;
    }
  });

  it("OVERDRIVE 는 15단계 마지막 300m 에만 걸린다", () => {
    expect(isOverdrive(CFG.infinite.from - CFG.overdrive.lastMeters - 1)).toBe(false);
    expect(isOverdrive(CFG.infinite.from - 10)).toBe(true);
    expect(isOverdrive(CFG.infinite.from)).toBe(false);
    expect(CFG.infinite.from - CFG.overdrive.lastMeters).toBeGreaterThan(CFG.stages[14].from);
  });

  it("색은 R → B → P 순으로 순환한다", () => {
    expect(nextColor("R")).toBe("B");
    expect(nextColor("B")).toBe("P");
    expect(nextColor("P")).toBe("R");
  });
});

describe("게임 규칙", () => {
  it("첫 입력 전에는 시간이 흐르지 않는다", () => {
    const g = createGame(1);
    for (let i = 0; i < 60; i++) update(g, CFG.physics.dt, noInput);
    expect(g.status).toBe("ready");
    expect(g.meters).toBe(0);
  });

  it("천장·바닥은 죽지 않고 에너지만 깎인다 (§2)", () => {
    const g = createGame(2);
    update(g, CFG.physics.dt, { flap: true, cycle: false, color: null });
    g.spawner.entities.length = 0;
    const before = g.energy.value;
    for (let i = 0; i < 120; i++) {
      g.spawner.entities.length = 0; // 장애물 영향 없이 바닥까지 떨어뜨린다
      update(g, CFG.physics.dt, noInput);
    }
    expect(g.status).not.toBe("dead");
    expect(g.y).toBeLessThanOrEqual(CFG.view.h);
    expect(g.energy.value).toBeLessThan(before); // 바닥 접촉 -10
  });

  it("색이 틀려도 죽지 않고 에너지·콤보만 잃는다 (§4)", () => {
    const g = createGame(3);
    update(g, CFG.physics.dt, { flap: true, cycle: false, color: null });
    g.spawner.entities.length = 0;
    g.stage = CFG.beginner.untilStage + 1; // 초보 보호(색 틀림 -10)가 끝난 뒤 기준
    g.color = "R";
    g.score.combo = 5;
    const before = g.energy.value;
    g.spawner.entities.push({
      e: { t: "gate", x: 0, y: 0, h: CFG.view.h, color: "B" },
      x: g.worldX + CFG.physics.owlX,
      chunkX: g.worldX,
      chunkScroll: CFG.scroll.v0,
      w: CFG.entity.gateW,
    });
    update(g, CFG.physics.dt, noInput);
    expect(g.status).not.toBe("dead");
    expect(before - g.energy.value).toBeGreaterThanOrEqual(CFG.energy.gateFail);
    expect(g.score.combo).toBe(0);
  });

  it("스칠 듯이 지나가면 니어미스로 에너지를 돌려받는다 (§5)", () => {
    const g = createGame(4);
    update(g, CFG.physics.dt, { flap: true, cycle: false, color: null });
    const { ry } = hitbox("M");
    const gapTop = 200;
    const y = gapTop + ry + 6; // 위쪽 기둥 끝에서 6px 아래 = 니어미스 범위
    g.spawner.entities.length = 0;
    g.spawner.entities.push({
      e: { t: "pillar", x: 0, gapY: gapTop + 200, gapH: 400 },
      x: g.worldX + CFG.physics.owlX + 120,
      chunkX: g.worldX,
      chunkScroll: CFG.scroll.v0,
      w: CFG.entity.pillarW,
    });
    for (let i = 0; i < 90; i++) {
      g.y = y;
      g.vy = 0;
      update(g, CFG.physics.dt, noInput);
      if (g.score.nearMiss > 0) break;
    }
    expect(g.status).not.toBe("dead");
    expect(g.score.nearMiss).toBe(1);
    expect(g.score.passCount).toBe(1);
    expect(currentRaw(g, false)).toBeGreaterThan(0);
  });
});
