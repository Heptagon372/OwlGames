import { describe, expect, it } from "vitest";
import { CFG } from "@/games/flight/config";
import { createSpawner } from "@/games/flight/engine/spawner";
import { DEFAULT_CONFIG } from "@/lib/config";
import { demoAddEnergy, demoEnergyStatus, demoSpendEnergy } from "@/lib/demo";

// 아울 에너지: 10분마다 1개, 최대 10개, 게임 한 판에 1개 (서버가 최종 판정)
describe("아울 에너지 설정", () => {
  it("기본값이 규칙과 같다", () => {
    const e = DEFAULT_CONFIG.owl_energy;
    expect(e.regen_min).toBe(10);
    expect(e.cap).toBe(10);
    expect(e.cost).toBe(1);
    expect(e.hard_cap).toBeGreaterThan(e.cap); // 부스 지급은 상한을 넘을 수 있다
    expect(e.drop_min_phase).toBeGreaterThanOrEqual(3); // 높은 스테이지에서만 등장
  });
});

describe("데모 모드 에너지", () => {
  it("게임을 시작하면 1개 줄고, 0이 되면 시작할 수 없다", () => {
    const before = demoEnergyStatus().energy;
    expect(demoSpendEnergy()).toBe(true);
    expect(demoEnergyStatus().energy).toBe(before - 1);

    // 남은 만큼 모두 소모하면 더는 시작할 수 없다
    let guard = 0;
    while (demoEnergyStatus().energy > 0 && guard++ < 50) demoSpendEnergy();
    expect(demoEnergyStatus().energy).toBe(0);
    expect(demoSpendEnergy()).toBe(false);
  });

  it("부스 지급은 자동충전 상한을 넘어 hard_cap까지 채운다", () => {
    const { cap, hard_cap } = demoEnergyStatus();
    demoAddEnergy(cap); // 상한까지
    const granted = demoAddEnergy(hard_cap); // 넘치게 지급
    expect(demoEnergyStatus().energy).toBe(hard_cap);
    expect(granted).toBeLessThanOrEqual(hard_cap);
    expect(demoAddEnergy(1)).toBe(0); // 이미 가득
  });

  it("가득 차 있으면 다음 충전 카운트다운이 없다", () => {
    const s = demoEnergyStatus();
    expect(s.energy).toBeGreaterThanOrEqual(s.cap);
    expect(s.next_refill_sec).toBe(0);
  });
});

describe("아울러닝 에너지 드롭 (§높은 스테이지에서 가끔)", () => {
  const always = () => 0; // 확률 판정을 항상 통과시키는 난수

  function countDrops(phase: number): number {
    const sp = createSpawner(always, 0);
    for (let i = 0; i < 6; i++) sp.ensure(i * 2000, phase, null, CFG.scroll.v0);
    return sp.entities.filter((s) => s.e.t === "item" && s.e.kind === "owlEnergy").length;
  }

  it("낮은 페이즈에서는 등장하지 않는다", () => {
    for (let phase = 0; phase < CFG.owlEnergy.minPhase; phase++) {
      expect(countDrops(phase), `phase ${phase}`).toBe(0);
    }
  });

  it("높은 페이즈에서도 한 판에 한 개만 등장한다", () => {
    expect(countDrops(CFG.owlEnergy.minPhase)).toBe(1);
    expect(countDrops(4)).toBe(1);
  });

  it("확률을 통과하지 못하면 등장하지 않는다", () => {
    const never = () => 0.99;
    const sp = createSpawner(never, 0);
    for (let i = 0; i < 6; i++) sp.ensure(i * 2000, 4, null, CFG.scroll.v0);
    expect(sp.entities.filter((s) => s.e.t === "item" && s.e.kind === "owlEnergy")).toHaveLength(0);
  });
});
