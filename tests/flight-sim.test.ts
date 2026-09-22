import { describe, expect, it } from "vitest";
import { simulate, summarize } from "@/games/flight/engine/bot";
import { CFG } from "@/games/flight/config";

// 기획서 §16-6: 자동 봇 시뮬레이션으로 밸런스를 확인한다.
// 기본 40판(CI용), SIM_RUNS=1000 으로 늘리면 튜닝용 리포트가 된다.
const RUNS = Number(process.env.SIM_RUNS ?? 40);

describe("아울러닝 봇 시뮬레이션", () => {
  const results = Array.from({ length: RUNS }, (_, i) => simulate(1000 + i));
  const s = summarize(results);

  it("리포트", () => {
    console.log("[flight-sim]", JSON.stringify(s));
    expect(s.runs).toBe(RUNS);
  });

  it("모든 판이 정상 종료된다 (무한 루프·NaN 없음)", () => {
    for (const r of results) {
      expect(Number.isFinite(r.raw)).toBe(true);
      expect(Number.isFinite(r.meters)).toBe(true);
      expect(r.durationSec).toBeGreaterThan(0);
      expect(r.durationSec).toBeLessThanOrEqual(CFG.platform.maxSessionSec);
      expect(r.meters).toBeGreaterThanOrEqual(0);
    }
  });

  it("메타가 서버 검증 규칙을 통과한다 (§11.3)", () => {
    for (const r of results) {
      const m = r.stats;
      expect(m.distance_m).toBeLessThanOrEqual(24 * m.duration_s * 1.02);
      expect(m.pass_count).toBeLessThanOrEqual(m.distance_m / 8);
      expect(m.near_miss).toBeLessThanOrEqual(m.pass_count);
      expect(m.combo_mult_avg).toBeGreaterThanOrEqual(1);
      expect(m.combo_mult_avg).toBeLessThanOrEqual(CFG.score.comboMaxMult);
    }
  });

  it("평범한 플레이 분포가 무너지지 않는다", () => {
    // 봇은 아이템을 적극적으로 줍지 않는 '보통 실력' 기준이라 기획서 목표(60~90초)보다 조금 짧다.
    // 튜닝 후 중앙값 ≈ 53초 / raw ≈ 1,300 / 95P. 여기서는 밸런스가 크게 무너지는 것만 막는다.
    expect(s.durationMedian).toBeGreaterThan(25);
    expect(s.durationMedian).toBeLessThan(CFG.platform.maxSessionSec);
    expect(s.rawMedian).toBeGreaterThan(700);
    expect(s.pointsMedian).toBeGreaterThan(CFG.platform.basePoints);
    expect(s.pointsMedian).toBeLessThanOrEqual(300);
  });

  it("죽는 이유가 한쪽으로만 쏠리지 않는다 (§5 설계 의도)", () => {
    // 에너지 관리가 핵심이므로 고갈사가 많은 건 정상이지만, 벽 충돌도 의미 있게 남아야 한다
    expect(s.byCause.wall).toBeGreaterThan(results.length * 0.1);
    expect(s.byCause.energy).toBeGreaterThan(results.length * 0.2);
  });
});
