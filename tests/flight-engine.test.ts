import { describe, expect, it } from "vitest";
import { CFG, comboMult, nextColor, phaseFromMeters, scrollFromMeters } from "@/games/flight/config";
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

  it("원점수가 기획서 공식과 정확히 같다", () => {
    const s = Score.initScore();
    // 통과 12회 + 니어미스 3회 + 아이템 몇 개
    for (let i = 0; i < 12; i++) Score.onPass(s, null, false);
    for (let i = 0; i < 3; i++) Score.onNearMiss(s, null);
    Score.onItem(s, "feather", null);
    Score.onItem(s, "gem", null);
    s.specialCleared = 1;

    const raw = Score.rawScore({ meters: 1000, turboMeters: 0, s, energyLeft: 40 });
    const expected =
      1000 + s.passScore + s.nearScore + s.itemScore + 1 * CFG.score.specialClear + 40 * CFG.score.energyLeft;
    expect(raw).toBe(Math.round(expected));
  });

  it("특수 구간 보너스는 따로 집계되어 서버에 전달된다", () => {
    const s = Score.initScore();
    Score.onPass(s, "colorRush", true); // 게이트 점수 ×2
    expect(Score.specialBonusScore(s, 0)).toBe(CFG.score.perPass);
    const turbo = Score.specialBonusScore(s, 300);
    expect(turbo).toBe(CFG.score.perPass + 300);
  });

  it("니어미스 판정 여유는 12px", () => {
    expect(isNearMiss(0)).toBe(false); // 0은 충돌
    expect(isNearMiss(CFG.score.nearMissMarginPx)).toBe(true);
    expect(isNearMiss(CFG.score.nearMissMarginPx + 0.1)).toBe(false);
  });
});

describe("페이즈·스크롤 (§3 · §9)", () => {
  it("거리로 페이즈가 해금된다", () => {
    expect(phaseFromMeters(0)).toBe(0);
    expect(phaseFromMeters(199)).toBe(0);
    expect(phaseFromMeters(200)).toBe(1);
    expect(phaseFromMeters(900)).toBe(3);
    expect(phaseFromMeters(9999)).toBe(4);
  });

  it("속도는 단조 증가하고 상한을 넘지 않는다", () => {
    let prev = 0;
    for (let m = 0; m <= 4000; m += 50) {
      const v = scrollFromMeters(m);
      expect(v).toBeGreaterThanOrEqual(prev - 0.001);
      expect(v).toBeLessThanOrEqual(CFG.scroll.vMax);
      prev = v;
    }
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
