import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDprGovernor } from "@/games/core/quality";

// 60fps = 16.7ms, 30fps = 33.3ms 간격으로 frame() 을 부른다
function run(gov: ReturnType<typeof createDprGovernor>, from: number, ms: number, step: number): { t: number; changed: number } {
  let changed = 0;
  let t = from;
  for (; t < from + ms; t += step) if (gov.frame(t)) changed++;
  return { t, changed };
}

describe("createDprGovernor", () => {
  const g = globalThis as { window?: unknown };
  beforeEach(() => {
    g.window = { devicePixelRatio: 3 };
  });
  afterEach(() => {
    delete g.window;
  });

  it("DPR 은 2 에서 시작하고 부드러우면 그대로다", () => {
    const gov = createDprGovernor();
    expect(gov.dpr).toBe(2);
    expect(run(gov, 0, 10_000, 1000 / 60).changed).toBe(0);
    expect(gov.dpr).toBe(2);
  });

  it("계속 느리면 2 → 1.5 → 1 로 한 단계씩 내리고 거기서 멈춘다", () => {
    const gov = createDprGovernor();
    let r = run(gov, 0, 4_500, 1000 / 30);
    expect(gov.dpr).toBe(1.5);
    r = run(gov, r.t, 2_500, 1000 / 30);
    expect(gov.dpr).toBe(1);
    run(gov, r.t, 10_000, 1000 / 30);
    expect(gov.dpr).toBe(1);
  });

  it("시작 직후와 탭 전환 틈은 재지 않는다", () => {
    const gov = createDprGovernor();
    // 워밍업 동안 느려도 무시
    let r = run(gov, 0, 1_900, 1000 / 20);
    expect(gov.dpr).toBe(2);
    // 긴 틈(일시정지) 뒤 부드러우면 그대로
    gov.frame(r.t + 5_000);
    r = run(gov, r.t + 5_000, 5_000, 1000 / 60);
    expect(gov.dpr).toBe(2);
  });

  it("DPR 1 기기는 더 내리지 않는다", () => {
    g.window = { devicePixelRatio: 1 };
    const gov = createDprGovernor();
    expect(run(gov, 0, 10_000, 1000 / 20).changed).toBe(0);
    expect(gov.dpr).toBe(1);
  });
});
