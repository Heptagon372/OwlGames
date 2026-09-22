import { describe, expect, it } from "vitest";
import { estimatePoints } from "@/lib/games";
import { maskName } from "@/lib/format";
import {
  MAX_LEVEL,
  RANKS,
  cumPoints,
  levelFromPoints,
  levelProgress,
  pointsToNext,
  rankFromLevel,
  tierFromRank,
} from "@/lib/rank";

describe("레벨 곡선 (§5.1)", () => {
  it("Lv100 누적은 27,720P", () => {
    expect(cumPoints(100)).toBe(27720);
  });

  it("L → L+1 필요 포인트 = 30 + 5L", () => {
    expect(pointsToNext(1)).toBe(35);
    expect(pointsToNext(50)).toBe(280);
    expect(cumPoints(3) - cumPoints(2)).toBe(pointsToNext(2));
  });

  it("포인트 → 레벨 경계", () => {
    expect(levelFromPoints(0)).toBe(1);
    expect(levelFromPoints(34)).toBe(1);
    expect(levelFromPoints(35)).toBe(2);
    expect(levelFromPoints(27719)).toBe(99);
    expect(levelFromPoints(27720)).toBe(100);
    expect(levelFromPoints(999999)).toBe(MAX_LEVEL);
  });

  it("만렙 진행도는 100%", () => {
    expect(levelProgress(27720).ratio).toBe(1);
    expect(levelProgress(27720).need).toBe(0);
  });
});

describe("랭크 (§5.2)", () => {
  it("17단계이고 경계 레벨이 명세와 같다", () => {
    expect(RANKS).toHaveLength(17);
    expect(RANKS.map((r) => r.minLevel)).toEqual([1, 8, 15, 22, 28, 34, 40, 46, 52, 58, 64, 70, 76, 82, 88, 94, 100]);
  });

  it("레벨 → 랭크", () => {
    expect(rankFromLevel(1)).toBe(0);
    expect(rankFromLevel(7)).toBe(0);
    expect(rankFromLevel(8)).toBe(1);
    expect(rankFromLevel(99)).toBe(15);
    expect(rankFromLevel(100)).toBe(16);
  });

  it("티어 매핑", () => {
    expect([0, 1, 2].map(tierFromRank)).toEqual([1, 1, 1]);
    expect([3, 4, 5].map(tierFromRank)).toEqual([2, 2, 2]);
    expect([6, 7, 8].map(tierFromRank)).toEqual([3, 3, 3]);
    expect([9, 10, 11].map(tierFromRank)).toEqual([4, 4, 4]);
    expect([12, 13, 14, 15].map(tierFromRank)).toEqual([5, 5, 5, 5]);
    expect(tierFromRank(16)).toBe(6);
  });

  it("나무(0)에서 챌린저(16)까지 티켓은 최대 16장 (§5.3)", () => {
    const tickets = rankFromLevel(MAX_LEVEL) - rankFromLevel(1);
    expect(tickets).toBe(16);
  });
});

describe("포인트 환산 (§7 공통)", () => {
  it("한 판 30~300P", () => {
    expect(estimatePoints(0, 4)).toBe(30);
    expect(estimatePoints(400, 4)).toBe(130);
    expect(estimatePoints(999999, 4)).toBe(300);
    expect(estimatePoints(-50, 10)).toBe(30);
  });
});

describe("이름 마스킹 (§9)", () => {
  it("가운데 글자를 가린다", () => {
    expect(maskName("홍길동")).toBe("홍*동");
    expect(maskName("김수")).toBe("김*");
    expect(maskName("남궁민수")).toBe("남**수");
    expect(maskName("김")).toBe("김");
  });
});
