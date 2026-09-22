import type { Chunk } from "../types";
import p0 from "./p0.json";
import p1 from "./p1.json";
import p2 from "./p2.json";
import p3 from "./p3.json";
import p4 from "./p4.json";

/** 페이즈별 청크 프리팹 (기획서 §8). 검증은 tests/chunks.test.ts */
export const CHUNKS: Chunk[] = [
  ...(p0 as unknown as Chunk[]),
  ...(p1 as unknown as Chunk[]),
  ...(p2 as unknown as Chunk[]),
  ...(p3 as unknown as Chunk[]),
  ...(p4 as unknown as Chunk[]),
];

export const CHUNKS_BY_PHASE: Chunk[][] = [0, 1, 2, 3, 4].map((p) => CHUNKS.filter((c) => c.phase === p));
