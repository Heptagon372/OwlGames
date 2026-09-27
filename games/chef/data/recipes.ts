// 🍳 게임용 레시피 25종 (GDD §23). 이름·설명은 messages 의 hud.chef.recipes.*
//
// 단계 문자열:
//   "bun"          재료를 선택된 접시에 올린다 (손질이 필요한 재료는 손질을 다 거친 것)
//   "sauce:ketchup" 같은 재료, 티켓에는 hud.chef.labels.ketchup 이름으로 보인다
//   "@pan:fry"     접시를 통째로 도구에 넣는 마무리 — 동사는 hud.chef.verbs.fry
import { CFG, type ToolId } from "../config";
import { ITEM, type ItemId } from "./items";

export type Step = { kind: "add"; item: ItemId; label?: string } | { kind: "fin"; tool: ToolId; verb: string };

export type RecipeId =
  | "hotdog"
  | "burger"
  | "fries"
  | "salad"
  | "toast"
  | "sandwich"
  | "ramen"
  | "wings"
  | "pancake"
  | "cake"
  | "steak"
  | "pizza"
  | "spaghetti"
  | "icecream"
  | "taco"
  | "donburi"
  | "gitpasta"
  | "omelet"
  | "gimbap"
  | "chicken"
  | "sushi"
  | "curry"
  | "hotpot"
  | "lasagna"
  | "fullstack";

export type Recipe = {
  id: RecipeId;
  emoji: string;
  /** 난이도 별 (코스는 7) */
  stars: number;
  /** 해금 단계 */
  unlock: number;
  steps: readonly Step[];
  /** 코스요리 — 이 음식들을 한 테이블에 차례로 */
  course?: readonly RecipeId[];
  /** 코드 이름 (티켓 머리줄) */
  code: string;
};

function parse(s: string): Step {
  if (s.startsWith("@")) {
    const [tool, verb] = s.slice(1).split(":");
    return { kind: "fin", tool: tool as ToolId, verb };
  }
  const [item, label] = s.split(":");
  return label ? { kind: "add", item: item as ItemId, label } : { kind: "add", item: item as ItemId };
}

const R = (id: RecipeId, emoji: string, stars: number, unlock: number, code: string, steps: string[]): Recipe => ({
  id,
  emoji,
  stars,
  unlock,
  code,
  steps: steps.map(parse),
});

export const RECIPES: readonly Recipe[] = [
  R("hotdog", "🌭", 1, 1, "let hotdog", ["bun", "sausage", "sauce:ketchup"]),
  R("burger", "🍔", 1, 2, "debug(burger)", ["bun", "patty", "cheese", "lettuce", "bun"]),
  R("fries", "🍟", 1, 3, "code.fry()", ["potato", "@pan:fry", "spice:salt"]),
  R("salad", "🥗", 1, 4, "salad[]", ["lettuce", "tomato", "onion", "sauce:dressing"]),
  R("toast", "🍞", 1, 5, "compile(toast)", ["bun:bread", "cheese", "bun:bread", "@pan:grill"]),
  R("sandwich", "🥪", 2, 6, "class Sandwich", ["bun", "ham", "cheese", "lettuce", "tomato", "bun"]),
  R("ramen", "🍜", 2, 7, "while(ramen)", ["noodle", "sauce:soup", "@pot:boil", "egg"]),
  R("wings", "🍗", 2, 8, "GET /wings", ["chicken", "spice:seasoning", "@pan:fry", "sauce:hot"]),
  R("pancake", "🥞", 2, 9, "stack.push()", ["batter", "@pan:grill", "batter", "@pan:grill", "syrup"]),
  R("cake", "🍰", 2, 10, "queue.cake", ["batter", "@oven:bake", "cream", "berry:decor"]),
  R("steak", "🥩", 3, 11, "*steak", ["meat", "spice:seasoning", "potato", "sauce"]),
  R("pizza", "🍕", 3, 12, "data.pizza", ["batter:dough", "sauce:tomatoSauce", "cheese", "tomato", "ham:topping", "@oven:bake"]),
  R("spaghetti", "🍝", 3, 13, "server.pasta", ["noodle", "@pot:noodle", "sauce:tomatoSauce", "@pan:stir", "cheese"]),
  R("icecream", "🍨", 3, 14, "cloud.ice", ["cream", "berry", "@mixer:freeze", "syrup", "cream:cloud"]),
  R("taco", "🌮", 3, 15, "import taco", ["batter:tortilla", "@pan:grill", "patty:beef", "onion", "tomato", "sauce:salsa"]),
  R("donburi", "🍚", 4, 16, "SELECT don", ["rice", "meat", "sauce", "egg", "onion"]),
  R("gitpasta", "🥘", 4, 17, "git merge", ["noodle", "@pot:noodle", "sauce:tomatoSauce", "cream", "ham:bacon", "@pan:stir", "cheese"]),
  R("omelet", "🍳", 4, 18, "new Thread()", ["onion", "tomato", "egg", "cheese", "@pan:fold"]),
  R("gimbap", "🍙", 4, 19, "{json:gimbap}", ["seaweed", "rice", "ham", "egg", "lettuce:veggie", "@board:roll"]),
  R("chicken", "🐔", 4, 20, "Computer.chk", ["chicken", "batter:coat", "@pan:fry", "sauce:hot", "@mixer:toss"]),
  R("sushi", "🍣", 5, 21, "sort(sushi)", ["rice", "spice:vinegar", "@mixer:mix", "fish", "seaweed", "sauce:soy"]),
  R("curry", "🍛", 5, 22, "sudo curry", ["potato", "onion", "@pan:stir", "meat", "sauce:curry", "@pot:boil", "rice"]),
  R("hotpot", "🍲", 5, 23, "net.hotpot", ["sauce:broth", "@pot:boil", "meat", "lettuce:veggie", "onion", "spice"]),
  R("lasagna", "🫕", 5, 24, "backend.lsgn", [
    "noodle",
    "@pot:noodle",
    "meat:meatSauce",
    "cream:cheeseSauce",
    "noodle",
    "sauce",
    "cheese",
    "@oven:bake",
  ]),
  {
    id: "fullstack",
    emoji: "🍽️",
    stars: 7,
    unlock: 25,
    code: "fullstack()",
    steps: [],
    course: ["salad", "steak", "spaghetti", "cake"],
  },
];

export const RECIPE: Record<RecipeId, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.id, r])) as Record<RecipeId, Recipe>;

/** 접시 하나에 올라가는 토큰 — 재료 id 또는 "@도구" */
export type Token = ItemId | `@${ToolId}`;

export function tokenOf(step: Step): Token {
  return step.kind === "add" ? step.item : `@${step.tool}`;
}

export const TOKENS: Record<RecipeId, readonly Token[]> = Object.fromEntries(
  RECIPES.map((r) => [r.id, r.steps.map(tokenOf)]),
) as unknown as Record<RecipeId, readonly Token[]>;

/**
 * W — 한 사람이 순서대로만 할 때 걸리는 작업 시간 (탭 + 조리, 제출 포함). 인내도 계산(GDD §25)에 쓴다.
 * 코스는 네 접시의 합.
 */
export function workSec(id: RecipeId): number {
  const r = RECIPE[id];
  if (r.course) return r.course.reduce((a, c) => a + workSec(c), 0);
  const tap = CFG.patience.tapSec;
  let w = tap; // 제출
  for (const s of r.steps) {
    if (s.kind === "add") {
      w += tap;
      for (const t of ITEM[s.item].chain) w += CFG.tools[t].cook + tap;
    } else {
      w += tap + CFG.tools[s.tool].cook + tap;
    }
  }
  return Math.round(w * 10) / 10;
}

/** 이 음식에 쓰이는 도구 (손질 + 마무리) */
export function toolsOf(id: RecipeId): ToolId[] {
  const r = RECIPE[id];
  if (r.course) return [...new Set(r.course.flatMap(toolsOf))];
  const set = new Set<ToolId>();
  for (const s of r.steps) {
    if (s.kind === "fin") set.add(s.tool);
    else for (const t of ITEM[s.item].chain) set.add(t);
  }
  return [...set];
}

/** 이 음식에 쓰이는 재료 */
export function itemsOf(id: RecipeId): ItemId[] {
  const r = RECIPE[id];
  if (r.course) return [...new Set(r.course.flatMap(itemsOf))];
  return [...new Set(r.steps.flatMap((s) => (s.kind === "add" ? [s.item] : [])))];
}
