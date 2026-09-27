import { describe, expect, it } from "vitest";
import { CFG } from "@/games/flight/config";
import { createSpawner } from "@/games/flight/engine/spawner";
import { DEFAULT_CONFIG } from "@/lib/config";

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

describe("아울러닝 에너지 드롭 (§높은 스테이지에서 가끔)", () => {
  const always = () => 0; // 확률 판정을 항상 통과시키는 난수
  const PPM = CFG.physics.pxPerMeter;

  /** startM 부터 steps × 2000px 만큼 청크를 깔고 아울 에너지 개수를 센다 */
  function countDrops(startM: number, steps: number, rand = always): number {
    const sp = createSpawner(rand, startM * PPM);
    for (let i = 0; i < steps; i++) sp.ensure(startM * PPM + i * 2000);
    return sp.entities.filter((s) => s.e.t === "item" && s.e.kind === "owlEnergy").length;
  }

  it("서버 조건(P3 이상 · 900m 이상) 전에는 등장하지 않는다", () => {
    // 0m → 약 750m 까지만 깐다 (앞으로 2화면 + 청크 폭 여유)
    expect(countDrops(0, 8)).toBe(0);
    expect(CFG.owlEnergy.minMeters).toBe(900);
  });

  it("높은 단계에서도 한 판에 한 개만 등장한다", () => {
    expect(countDrops(1000, 6)).toBe(1);
    expect(countDrops(2000, 6)).toBe(1);
  });

  it("확률을 통과하지 못하면 등장하지 않는다", () => {
    expect(countDrops(1000, 6, () => 0.99)).toBe(0);
  });
});
