// 🍳 재료 22종 (GDD §22) — 손질 경로는 재료마다 하나로 고정. 이름은 messages 의 hud.chef.items.*
import type { ToolId } from "../config";

export type ItemId =
  | "bun"
  | "sausage"
  | "patty"
  | "cheese"
  | "lettuce"
  | "sauce"
  | "potato"
  | "spice"
  | "tomato"
  | "onion"
  | "ham"
  | "noodle"
  | "egg"
  | "chicken"
  | "batter"
  | "cream"
  | "berry"
  | "syrup"
  | "meat"
  | "rice"
  | "seaweed"
  | "fish";

export type ItemDef = {
  id: ItemId;
  /** 그림 (이모지). 김은 이모지가 없어서 ui/icons 가 도형으로 그린다 */
  emoji: string;
  /** 손질 경로 — 비어 있으면 바로 접시에 올라간다 */
  chain: readonly ToolId[];
  /** 칸 바탕 색 (옅게 깔린다) */
  tint: string;
};

const D = (id: ItemId, emoji: string, chain: readonly ToolId[], tint: string): ItemDef => ({ id, emoji, chain, tint });

/** 재료 칸 순서 = 이 배열 순서 (첫 등장 순) */
export const ITEMS: readonly ItemDef[] = [
  D("bun", "🍞", [], "#e0a458"),
  D("sausage", "🌭", ["pan"], "#e2574c"),
  D("patty", "🥩", ["pan"], "#c0392b"),
  D("cheese", "🧀", [], "#f5c542"),
  D("lettuce", "🥬", [], "#52c46b"),
  D("sauce", "🥫", [], "#e8453c"),
  D("potato", "🥔", ["board"], "#c89f63"),
  D("spice", "🧂", [], "#b8c4d6"),
  D("tomato", "🍅", ["board"], "#ff5a4e"),
  D("onion", "🧅", ["board"], "#d6a2e8"),
  D("ham", "🥓", [], "#f08a8a"),
  D("noodle", "🍜", [], "#f2d38a"),
  D("egg", "🥚", ["pan"], "#fff3c4"),
  D("chicken", "🍗", ["board"], "#d9894a"),
  D("batter", "🥣", [], "#f2e0b0"),
  D("cream", "🥛", [], "#f4f6ff"),
  D("berry", "🍓", [], "#ff4f79"),
  D("syrup", "🍯", [], "#f0a320"),
  D("meat", "🍖", ["board", "pan"], "#b5523b"),
  D("rice", "🍚", [], "#eef2f7"),
  D("seaweed", "", [], "#2f6b3d"),
  D("fish", "🐟", ["board"], "#5ab0e8"),
];

export const ITEM: Record<ItemId, ItemDef> = Object.fromEntries(ITEMS.map((d) => [d.id, d])) as Record<ItemId, ItemDef>;
