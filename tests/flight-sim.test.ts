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

  it("메타가 서버 검증 규칙을 통과한다 (20261002 마이그레이션)", () => {
    for (const r of results) {
      const m = r.stats;
      expect(m.distance_m).toBeLessThanOrEqual(CFG.server.maxAvgMps * m.duration_s * 1.02);
      expect(m.pass_count).toBeLessThanOrEqual(m.distance_m / 8);
      expect(m.near_miss).toBeLessThanOrEqual(m.pass_count);
      expect(m.perfect_count).toBeLessThanOrEqual(m.pass_count + 1);
      expect(m.combo_mult_avg).toBeGreaterThanOrEqual(1);
      expect(m.combo_mult_avg).toBeLessThanOrEqual(CFG.score.comboMaxMult);
      expect(m.item_score).toBeLessThanOrEqual(600 * m.items + 600);
      // bonus 상한 = 기본점수 × (multCap - 1) + 단계 × 400 + 2000 (서버와 같은 식)
      const base =
        m.distance_m +
        m.pass_count * CFG.score.perPass * m.combo_mult_avg +
        m.near_miss * CFG.score.nearMiss * m.combo_mult_avg +
        m.perfect_count * CFG.perfect.score +
        m.item_score;
      expect(m.bonus_score).toBeLessThanOrEqual(base * (CFG.multCap - 1) + 400 * m.stage_max + 2000);
      // 서버 재계산과 5% 안
      const server = base + m.energy_left * CFG.score.energyLeft + m.bonus_score;
      expect(Math.abs(r.raw - server)).toBeLessThanOrEqual(0.05 * Math.max(server, 1));
    }
  });

  it("평범한 플레이 분포가 무너지지 않는다", () => {
    // 봇은 아이템을 적극적으로 줍지 않고 스치지도 않는 '보통 실력' 기준.
    // 밸런스 v4(체력 S150 · M190 · L240, DECISIONS §5-39) 후 중앙값 ≈ 118초 · 14단계 · raw ≈ 27,000 (2.0 은 ≈ 73초 · 9단계).
    // 보통 실력은 ∞ 앞에서 끝나고, 한 판이 부스 회전을 막을 만큼 길어지지는 않는다.
    expect(s.durationMedian).toBeGreaterThan(35);
    expect(s.durationMedian).toBeLessThan(240);
    expect(s.stageMedian).toBeGreaterThanOrEqual(5); // 보통 실력도 레이저(5단계)까지는 본다
    expect(s.stageMedian).toBeLessThanOrEqual(CFG.stages.length);
    expect(s.rawMedian).toBeGreaterThan(1500);
    expect(s.pointsMedian).toBeGreaterThan(CFG.platform.basePoints + 20);
  });

  it("죽는 이유가 한쪽으로만 쏠리지 않는다 (§5 설계 의도)", () => {
    // 에너지 관리가 핵심이라 고갈사가 대부분이지만, 벽 충돌도 남아 있어야 한다
    expect(s.byCause.wall).toBeGreaterThan(0);
    expect(s.byCause.energy).toBeGreaterThan(results.length * 0.2);
  });
});
