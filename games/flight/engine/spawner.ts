// 청크 스포너 (기획서 §8) — 랜덤 좌표 생성 금지, 프리팹을 이어 붙인다
import { CFG } from "../config";
import { CHUNKS } from "../chunks";
import type { Chunk, Entity } from "../types";
import { entityWidth } from "./collision";
import { difficultyCap, type SpecialKind } from "./phases";

export type SpawnedEntity = {
  e: Entity;
  /** 엔티티 월드 x (좌측) */
  x: number;
  /** 소속 청크의 월드 원점 (bug 위상 계산용) */
  chunkX: number;
  /** 청크의 기준 스크롤 속도 (검증 스크립트와 동일한 bug 위상을 쓰기 위함) */
  chunkScroll: number;
  w: number;
  passed?: boolean;
  judged?: boolean;
  gone?: boolean;
  /** 지나가는 동안 관측한 최소 거리 (니어미스 판정용) */
  minDist?: number;
  touched?: boolean;
};

export type Spawner = ReturnType<typeof createSpawner>;

export function createSpawner(rand: () => number, startX: number) {
  let cursorX = startX;
  let lastExitY = CFG.view.h / 2;
  const lastIds: string[] = [];
  let hardStreak = 0;
  const entities: SpawnedEntity[] = [];

  function candidates(phase: number, special: SpecialKind | null, needBreather: boolean): Chunk[] {
    const cap = difficultyCap(phase);
    let pool = CHUNKS.filter((c) => c.phase <= phase && c.difficulty <= cap && !lastIds.includes(c.id));
    if (needBreather) {
      const b = pool.filter((c) => c.tags.includes("breather"));
      if (b.length) pool = b;
    } else if (special) {
      const want =
        special === "colorRush"
          ? pool.filter((c) => c.tags.includes("gate"))
          : special === "featherStorm"
            ? pool.filter((c) => c.tags.includes("item"))
            : special === "turbo"
              ? pool.filter((c) => c.difficulty <= 3)
              : pool;
      if (want.length) pool = want;
    }
    // 이음새: 이전 청크 exitY와 ±120px 이내 (§8 규칙 4)
    const joined = pool.filter((c) => Math.abs(c.entryY - lastExitY) <= 120);
    if (joined.length) return joined;
    const relaxed = pool.filter((c) => Math.abs(c.entryY - lastExitY) <= 200);
    return relaxed.length ? relaxed : pool;
  }

  function pick(phase: number, special: SpecialKind | null): Chunk {
    const needBreather = hardStreak >= 2; // 난이도 3 이상 2연속 뒤에는 숨 돌리기 (§8 규칙 3)
    const pool = candidates(phase, special, needBreather);
    const chunk = pool[Math.floor(rand() * pool.length)] ?? CHUNKS[0];
    hardStreak = chunk.difficulty >= 3 ? hardStreak + 1 : 0;
    lastIds.push(chunk.id);
    if (lastIds.length > 2) lastIds.shift();
    lastExitY = chunk.exitY;
    return chunk;
  }

  function spawn(chunk: Chunk, originX: number, scroll: number) {
    for (const e of chunk.entities) {
      entities.push({ e, x: originX + e.x, chunkX: originX, chunkScroll: scroll, w: entityWidth(e) });
    }
  }

  return {
    entities,
    /** 화면 오른쪽 바깥까지 청크를 채운다 */
    ensure(worldX: number, phase: number, special: SpecialKind | null, scroll: number) {
      const ahead = worldX + CFG.view.w * 2;
      let guard = 0;
      while (cursorX < ahead && guard++ < 8) {
        const chunk = pick(phase, special);
        spawn(chunk, cursorX, scroll);
        cursorX += chunk.width;
      }
    },
    /** 화면 왼쪽으로 사라진 엔티티 반환 (§14 오브젝트 풀링 규칙) */
    cull(worldX: number) {
      for (let i = entities.length - 1; i >= 0; i--) {
        const s = entities[i];
        if (s.x + s.w - worldX < -200) entities.splice(i, 1);
      }
    },
    get lastExitY() {
      return lastExitY;
    },
  };
}
