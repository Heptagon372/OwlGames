// 청크 스포너 (기획서 §8) — 랜덤 좌표 생성 금지, 프리팹을 이어 붙인다.
// 2.0: 청크를 놓는 **자리의 단계**를 보고 디렉터(director.ts)가 세트피스·이벤트를 끼워 넣는다.
import { CFG, COLOR_ORDER, isOverdrive, stageFromMeters, scrollFromMeters, phaseFromMeters, type Color } from "../config";
import { CHUNKS } from "../chunks";
import type { Chunk, Entity, ItemKind } from "../types";
import { entityWidth } from "./collision";
import {
  buildSetPiece,
  eventPool,
  introPlans,
  overlayEvent,
  setPiecePool,
  type Plan,
} from "./director";
import { difficultyCap, setPieceChance } from "./phases";

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
  /** 트리거를 이미 발동했는지 */
  fired?: boolean;
  /** 떨어지는 아이템 (깃털 비) — y 대신 쓰는 현재 y와 낙하 속도 */
  fy?: number;
  fvy?: number;
  /** 자석에 끌려오는 중 */
  pulled?: boolean;
  /** 전설 아이템 등장 알림을 이미 띄웠는지 */
  announced?: boolean;
};

export type Spawner = ReturnType<typeof createSpawner>;

const PPM = CFG.physics.pxPerMeter;

export function createSpawner(rand: () => number, startX: number) {
  let cursorX = startX;
  let lastExitY = CFG.view.h / 2;
  const lastIds: string[] = [];
  let hardStreak = 0;
  let energyDropped = false;
  let lastStage = 0;
  let lastWasSet = false;
  let chainId = 0;
  let nextEventAt = 0;
  /** 터보가 걸린 구간의 끝 (월드 x) */
  let fastUntilX = 0;
  const queue: Plan[] = [];
  const entities: SpawnedEntity[] = [];

  function candidates(phase: number, needBreather: boolean, tag?: string, fast = false, stageCap = 5): Chunk[] {
    // 터보·오버드라이브처럼 검증 속도보다 빠른 구간은 난이도 3 이하만 (기획서 §10 "장애물 단순화")
    // 초반 단계는 단계표의 cap 으로 더 낮춘다 (초보 보호)
    const cap = Math.min(stageCap, fast ? Math.min(3, difficultyCap(phase)) : difficultyCap(phase));
    let pool = CHUNKS.filter((c) => c.phase <= phase && c.difficulty <= cap && !lastIds.includes(c.id));
    if (tag) {
      const t = pool.filter((c) => (c.tags as string[]).includes(tag) && c.phase === phase);
      if (t.length) pool = t;
    } else if (needBreather) {
      const b = pool.filter((c) => c.tags.includes("breather"));
      if (b.length) pool = b;
    }
    // 이음새: 이전 청크 exitY와 ±120px 이내 (§8 규칙 4)
    const joined = pool.filter((c) => Math.abs(c.entryY - lastExitY) <= 120);
    if (joined.length) return joined;
    const relaxed = pool.filter((c) => Math.abs(c.entryY - lastExitY) <= 200);
    return relaxed.length ? relaxed : pool;
  }

  function pickJson(phase: number, tag?: string, fast = false, stageCap = 5): Chunk {
    const needBreather = hardStreak >= 2; // 난이도 3 이상 2연속 뒤에는 숨 돌리기 (§8 규칙 3)
    const pool = candidates(phase, needBreather, tag, fast, stageCap);
    const chunk = pool[Math.floor(rand() * pool.length)] ?? CHUNKS[0];
    hardStreak = chunk.difficulty >= 3 ? hardStreak + 1 : 0;
    lastIds.push(chunk.id);
    if (lastIds.length > 2) lastIds.shift();
    lastExitY = chunk.exitY;
    return chunk;
  }

  /** 다음 칸에 무엇을 놓을지 — 소개 → 이벤트 → (확률) 세트피스 → JSON */
  function plan(stage: number): Plan {
    if (stage !== lastStage) {
      lastStage = stage;
      queue.length = 0;
      queue.push(...introPlans(stage));
    }
    const m = cursorX / PPM;
    if (stage >= CFG.events.fromStage && m >= nextEventAt) {
      const every = stage > 15 ? CFG.events.infiniteEveryMeters : CFG.events.everyMeters;
      const first = nextEventAt === 0;
      nextEventAt = m + every * (first ? 0.6 : 1);
      const pool = eventPool(stage);
      if (!first && pool.length && rand() < CFG.events.chance) queue.push(pool[Math.floor(rand() * pool.length)]);
    }
    const queued = queue.shift();
    if (queued) return queued;
    const pool = setPiecePool(stage);
    if (!lastWasSet && hardStreak < 2 && pool.length && rand() < setPieceChance(stage)) {
      return { k: "set", kind: pool[Math.floor(rand() * pool.length)] };
    }
    return { k: "json" };
  }

  /** 아이템 등급 올리기 — ⭐·🪶 일부가 희귀·전설로 (2.0 §23) */
  function upgradeItem(kind: ItemKind, stage: number): ItemKind {
    if (stage < CFG.upgrade.fromStage) return kind;
    if (kind === "bigFeather" && stage >= CFG.upgrade.legendaryFromStage && rand() < CFG.upgrade.legendary) {
      return (["rage", "phantom", "crown"] as const)[Math.floor(rand() * 3)];
    }
    if ((kind === "star" || kind === "feather") && rand() < CFG.upgrade.rare) {
      return kind === "star" ? (rand() < 0.5 ? "magnet" : "double") : "bigFeather";
    }
    return kind;
  }

  function spawn(chunk: Chunk, originX: number, scroll: number, stage: number, isSet: boolean) {
    for (const e0 of chunk.entities) {
      let e = e0;
      // JSON 엔티티는 공유 객체라 절대 고치지 않는다 — 바꿀 땐 복사본
      if (!isSet && e.t === "gate" && stage >= CFG.glitch.fromStage && rand() < CFG.glitch.chance) {
        const fake: Color = COLOR_ORDER.filter((c) => c !== (e0 as { color: Color }).color)[Math.floor(rand() * 2)];
        e = { ...e, fake };
      } else if (!isSet && e.t === "item") {
        const kind = upgradeItem(e.kind, stage);
        if (kind !== e.kind) e = { ...e, kind };
      }
      entities.push({ e, x: originX + e.x, chunkX: originX, chunkScroll: scroll, w: entityWidth(e) });
    }
  }

  /** 🦉 아울 에너지 — 높은 스테이지에서 한 판에 한 번만, 낮은 확률로 등장 */
  function maybeDropEnergy(chunk: Chunk, originX: number, phase: number, scroll: number) {
    if (energyDropped || phase < CFG.owlEnergy.minPhase || originX / PPM < CFG.owlEnergy.minMeters) return;
    if (rand() >= CFG.owlEnergy.chance) return;
    energyDropped = true;
    const y = Math.max(80, Math.min(CFG.view.h - 80, (chunk.entryY + chunk.exitY) / 2));
    const item: Entity = { t: "item", x: 0, y, kind: "owlEnergy" };
    entities.push({
      e: item,
      x: originX + chunk.width / 2,
      chunkX: originX,
      chunkScroll: scroll,
      w: entityWidth(item),
    });
  }

  return {
    entities,
    /** 화면 오른쪽 바깥까지 청크를 채운다 */
    ensure(worldX: number) {
      const ahead = worldX + CFG.view.w * 2;
      let guard = 0;
      while (cursorX < ahead && guard++ < 8) {
        const m = cursorX / PPM;
        const stage = stageFromMeters(m);
        const phase = phaseFromMeters(m);
        const scroll = scrollFromMeters(m);
        const p = plan(stage);
        if (p.k === "set") {
          const chunk = buildSetPiece(p.kind, { stage, sc: scroll, rand, chainId: ++chainId }, p.opts);
          spawn(chunk, cursorX, scroll, stage, true);
          lastExitY = chunk.exitY;
          lastWasSet = true;
          hardStreak = 0;
          cursorX += chunk.width;
          continue;
        }
        if (p.k === "overlay") {
          // 이벤트 트리거를 다음 JSON 청크 입구에 얹는다
          const trig: Entity = { t: "trigger", x: 0, ev: overlayEvent(p.ev) };
          entities.push({ e: trig, x: cursorX, chunkX: cursorX, chunkScroll: scroll, w: 1 });
          if (p.ev === "turbo") fastUntilX = cursorX + CFG.events.turboSec * scroll * CFG.events.turboMult[1];
        }
        const fast = cursorX < fastUntilX || isOverdrive(m) || stage > 15;
        const def = CFG.stages[Math.min(CFG.stages.length, stage) - 1] as { cap?: number };
        const chunk = pickJson(phase, p.k === "json" ? p.tag : undefined, fast, def.cap ?? 5);
        spawn(chunk, cursorX, scroll, stage, false);
        maybeDropEnergy(chunk, cursorX, phase, scroll);
        lastWasSet = false;
        cursorX += chunk.width;
      }
    },
    /** 떨어지는 아이템 등 런타임 엔티티를 직접 넣는다 */
    add(e: Entity, worldX: number, scroll: number, extra: Partial<SpawnedEntity> = {}) {
      entities.push({ e, x: worldX, chunkX: worldX, chunkScroll: scroll, w: entityWidth(e), ...extra });
    },
    /** 화면 왼쪽으로 사라진 엔티티 반환 (§14 오브젝트 풀링 규칙) */
    cull(worldX: number) {
      for (let i = entities.length - 1; i >= 0; i--) {
        const s = entities[i];
        if (s.x + s.w - worldX < -200 || (s.fy !== undefined && s.fy > CFG.view.h + 60)) entities.splice(i, 1);
      }
    },
    get lastExitY() {
      return lastExitY;
    },
  };
}
