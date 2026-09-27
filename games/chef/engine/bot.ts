// 🍳 헤드리스 봇 — 밸런스 확인용 (tests/chef-engine.test.ts). 화면과 같은 행동 함수만 부른다.
//
// 한 번 생각할 때 행동 하나. 급한 주문부터 보고, 다음 단계를 할 수 있으면 하고, 기다려야 하면 다른 주문의
// "다음 손질 재료"를 미리 올려 둔다. 마무리 단계 너머까지 미리 손질하지는 않는다 (도구가 막혀 교착되지 않게).

import { mulberry32 } from "@/games/core/canvas";
import { ITEM, type ItemId } from "../data/items";
import { RECIPE } from "../data/recipes";
import {
  TABLES,
  bugOn,
  dishOf,
  hintFor,
  nextAction,
  select,
  slotDone,
  tapItem,
  tapTool,
  toolUnlocked,
  undo,
  unlockedItems,
  type Game,
} from "./game";
import type { ToolId } from "../config";

export type BotSkill = {
  /** 행동 하나에 걸리는 시간 (초) */
  tap: number;
  /** 재료를 잘못 누를 확률 */
  mistake: number;
};

export const BOTS = {
  slow: { tap: 1.0, mistake: 0.08 },
  mid: { tap: 0.7, mistake: 0.03 },
  fast: { tap: 0.45, mistake: 0.01 },
} satisfies Record<string, BotSkill>;

export type Bot = { skill: BotSkill; wait: number; rng: () => number };

export function createBot(skill: BotSkill, seed: number): Bot {
  return { skill, wait: 0.3, rng: mulberry32(seed ^ 0xb07) };
}

function freeSlot(g: Game, tool: ToolId): boolean {
  return toolUnlocked(g, tool) && !bugOn(g, "tool", tool) && g.tools[tool].some((s) => s === null);
}

/** 도구 어딘가에 이 재료가 (손질 중이든 다 됐든) 있는 개수 */
function inKitchen(g: Game, item: ItemId): number {
  let n = 0;
  for (const tool of Object.keys(g.tools) as ToolId[])
    for (const s of g.tools[tool]) if (s?.kind === "item" && s.item === item) n++;
  return n;
}

/** 이 주문이 마무리 단계 전까지 앞으로 쓸 첫 손질 재료 */
function nextChainItem(g: Game, i: number): ItemId | null {
  const c = g.tables[i]!;
  const steps = RECIPE[dishOf(c)].steps;
  const p = g.plates[i];
  for (let k = p.tokens.length; k < steps.length; k++) {
    const s = steps[k];
    if (s.kind === "fin") return null;
    if (ITEM[s.item].chain.length) return s.item;
  }
  return null;
}

/** 봇 한 번 생각하기 — 행동했으면 true */
function think(g: Game, bot: Bot): boolean {
  const order: number[] = [];
  for (let i = 0; i < TABLES; i++) {
    const c = g.tables[i];
    if (c && c.leaving <= 0) order.push(i);
  }
  order.sort((a, b) => g.tables[a]!.patience - g.tables[b]!.patience);

  // 1) 급한 주문부터 — 지금 바로 할 수 있는 다음 단계
  for (const i of order) {
    const h = hintFor(g, i);
    if (!h) continue;
    if (h.kind === "undo") {
      if (g.selected !== i) return select(g, i);
      return undo(g);
    }
    if (h.kind === "plate") {
      const step = RECIPE[dishOf(g.tables[i]!)].steps[g.plates[i].tokens.length];
      if (step && step.kind === "fin") {
        if (!freeSlot(g, step.tool)) continue;
      } else if (bugOn(g, "table", i) || bugOn(g, "system")) continue; // 버그가 지나갈 때까지 기다린다
      if (g.selected !== i) return select(g, i);
      return nextAction(g, i);
    }
    if (h.kind === "item") {
      const chain = ITEM[h.item].chain;
      if (chain.length) {
        if (!freeSlot(g, chain[0])) continue;
        return tapItem(g, h.item);
      }
      if (g.selected !== i) return select(g, i);
      if (bot.rng() < bot.skill.mistake) {
        const wrong = unlockedItems(g).filter((x) => x !== h.item && !ITEM[x].chain.length);
        if (wrong.length) return tapItem(g, wrong[Math.floor(bot.rng() * wrong.length)]);
      }
      return tapItem(g, h.item);
    }
    if (h.kind === "tool") {
      const s = g.tools[h.tool][h.slot];
      if (!s || !slotDone(s) || bugOn(g, "tool", h.tool)) continue;
      const chain = ITEM[(s as { item: ItemId }).item].chain;
      const last = (s as { step: number }).step === chain.length - 1;
      if (!last) {
        if (!freeSlot(g, chain[(s as { step: number }).step + 1])) continue;
        return tapTool(g, h.tool, h.slot);
      }
      if (g.selected !== i) return select(g, i);
      return tapTool(g, h.tool, h.slot);
    }
  }

  // 2) 기다리는 동안 — 다른 주문의 다음 손질 재료를 미리 올린다
  const want = new Map<ItemId, number>();
  for (const i of order) {
    const it = nextChainItem(g, i);
    if (it) want.set(it, (want.get(it) ?? 0) + 1);
  }
  for (const [item, n] of want) {
    if (inKitchen(g, item) >= n) continue;
    if (!freeSlot(g, ITEM[item].chain[0])) continue;
    return tapItem(g, item);
  }
  return false;
}

/** 봇을 dt 만큼 돌린다 */
export function stepBot(g: Game, bot: Bot, dt: number): void {
  if (g.over) return;
  bot.wait -= dt;
  if (bot.wait > 0) return;
  const acted = think(g, bot);
  g.events.length = 0;
  bot.wait = acted ? bot.skill.tap * (0.8 + bot.rng() * 0.4) : 0.1;
}
