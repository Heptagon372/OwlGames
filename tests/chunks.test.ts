import { describe, expect, it } from "vitest";
import { CHUNKS } from "@/games/flight/chunks";
import { verifyAll } from "@/games/flight/chunks/verify";

describe("아울러닝 청크 (기획서 §8 · §16-2)", () => {
  // 청크마다 S·M·L 3회 BFS라 54개 기준 40초 안팎이 걸린다
  it(
    "모든 청크가 스키마와 통과 가능성 검증을 통과한다",
    () => {
      const issues = verifyAll(CHUNKS);
      expect(issues.map((i) => `${i.id} — ${i.message}`)).toEqual([]);
    },
    180_000,
  );

  it("청크 id는 유일하다", () => {
    expect(new Set(CHUNKS.map((c) => c.id)).size).toBe(CHUNKS.length);
  });
});
