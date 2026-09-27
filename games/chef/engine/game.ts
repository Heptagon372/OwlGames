// 🍳 아울 레스토랑 — 게임 상태 기계 (GDD §20 조작 · §24 손님 · §25 인내도 · §26 단계 · §27 버그 · §28 제출 · §29 점수)
//
// DOM·React 를 모른다. 화면(index.tsx)과 헤드리스 봇(bot.ts)이 같은 함수만 부른다.
// 엔진은 소리를 모르고 `g.cues` 에 CUE 비트만, 화면 문구는 `g.events` 에 사건만 쌓는다.

import { mulberry32 } from "@/games/core/canvas";
import {
  CFG,
  INF_STAGE,
  STAGE_MAX,
  TOOL_IDS,
  bugPlanOf,
  gapOf,
  planOf,
  scoreMultOf,
  slackOf,
  type ToolId,
} from "../config";
import { ITEM, ITEMS, type ItemId } from "../data/items";
import { RECIPE, RECIPES, TOKENS, workSec, type RecipeId, type Token } from "../data/recipes";

export const TABLES = 3;
/** 손님 겉모습 가짓수 (ui/art.tsx 의 CUSTOMER_LOOKS 와 같다 — 손님 그림 8명) */
export const LOOKS = 8;

/* ── 상태 타입 ─────────────────────────────────────────────── */

export type Slot =
  | { kind: "item"; item: ItemId; /** 손질 경로에서 몇 번째 도구인가 */ step: number; t: number; dur: number; rang: boolean }
  | { kind: "plate"; table: number; t: number; dur: number };

export type OrderKind = "single" | "course" | "double";
export type Order = { kind: OrderKind; dishes: RecipeId[]; idx: number };

export type Customer = {
  id: number;
  order: Order;
  patience: number;
  max: number;
  /** 겉모습 (손님 그림 · 후드티 색) */
  look: number;
  /** 앉은 시각 (g.t) — 화면이 "주문!" 말풍선을 잠깐 띄운다 */
  t0: number;
  /** > 0 이면 떠나는 중 (남은 초) */
  leaving: number;
  /** 떠나는 이유 — 화면 연출용 */
  happy: boolean;
};

export type Plate = {
  tokens: Token[];
  /** 되돌리기·비우기·벌점을 한 번이라도 겪었는가 (PERFECT 판정) */
  dirty: boolean;
  /** 도구 안에서 마무리 중 */
  inTool: ToolId | null;
  /** 레시피와 처음 어긋난 자리 (-1 = 아직 맞다) */
  wrongAt: number;
  /** 레시피가 다 끝난 시각 (g.t, -1 = 아직) — 화면이 재료를 합쳐 완성 요리 그림으로 바꾼다 */
  doneAt: number;
};

export type BugTarget = { kind: "table"; i: number } | { kind: "tool"; tool: ToolId } | { kind: "system" };
export type Bug = { id: number; target: BugTarget; /** 기어 오는 중 (남은 초) */ crawl: number; life: number; dur: number };

export type BlockReason =
  | "full"
  | "bug"
  | "busy"
  | "noPlate"
  | "raw"
  | "wrong"
  | "notDone"
  | "cantUndo"
  | "locked"
  | "inTool"
  | "wrongTool"
  | "otherTable";

export type GameEvent =
  | { type: "serve"; table: number; dish: RecipeId; score: number; fast: boolean; perfect: boolean; hotfix: boolean; combo: number; next: boolean }
  | { type: "reject"; table: number; reason: "compile" | "bug" }
  | { type: "stage"; stage: number; recipes: RecipeId[]; tools: ToolId[] }
  | { type: "inf"; level: number }
  | { type: "clean"; n: number; score: number }
  | { type: "fullstack"; table: number; score: number }
  | { type: "blocked"; reason: BlockReason; target: string }
  | { type: "need"; item: ItemId }
  | { type: "bug"; target: BugTarget }
  | { type: "seat"; table: number }
  | { type: "over"; end: EndReason; table: number };

export type EndReason = "patience" | "closing";

export const CUE = {
  TAP: 1 << 0,
  CHOP: 1 << 1,
  SIZZLE: 1 << 2,
  DING: 1 << 3,
  SERVE: 1 << 4,
  REJECT: 1 << 5,
  BUG: 1 << 6,
  STAGE: 1 << 7,
  OVER: 1 << 8,
  BLOCK: 1 << 9,
  SEAT: 1 << 10,
  COMBO: 1 << 11,
  FULLSTACK: 1 << 12,
  WARN: 1 << 13,
} as const;

export type Stats = {
  /** 낸 접시 수 (코스·×2 는 접시마다) */
  served: number;
  /** 별 1~5 별 접시 수 (index 0 = ★) */
  byStar: [number, number, number, number, number];
  /** 끝낸 주문 수 (코스·×2 도 1) */
  orders: number;
  courses: number;
  doubles: number;
  rejects: number;
  bugFails: number;
  maxCombo: number;
  perfects: number;
  hotfixes: number;
  cleanBuilds: number;
  cleanOrders: number;
  undos: number;
  dishes: Partial<Record<RecipeId, number>>;
};

export type Game = {
  seed: number;
  rng: () => number;
  /** 경과 시간 (멈춤 포함 — 서버 경과시간과 비교된다) */
  t: number;
  stage: number;
  /** 지금 단계에서 끝낸 주문 */
  stageServed: number;
  /** 지금 단계에서 앉힌 주문 */
  stageSeated: number;
  /** 이번 단계에서 한 번이라도 주문된 음식 (새 음식 먼저 내기) */
  seenThisStage: Set<RecipeId>;
  infLevel: number;
  infT: number;
  /** 단계 전환 멈춤 (남은 초) */
  pause: number;
  tables: (Customer | null)[];
  plates: Plate[];
  selected: number;
  tools: Record<ToolId, (Slot | null)[]>;
  bugs: Bug[];
  bugT: number;
  spawnT: number;
  seq: number;
  combo: number;
  /** 요리 점수 (기본 + 빠른 조리 + 콤보) × 단계 배율 — 서버는 상한만 건다 */
  dishScore: number;
  /** PERFECT · HOTFIX · CLEAN BUILD · FULL STACK — 서버는 상한만 건다 */
  bonusScore: number;
  /** 연속으로 테이블이 비지 않은 동안 끝낸 주문 (CLEAN BUILD) */
  wave: number;
  stats: Stats;
  over: boolean;
  end: EndReason | null;
  overT: number;
  culprit: number;
  events: GameEvent[];
  cues: number;
  owlEnergyFound: boolean;
  /** 구조가 바뀔 때마다 +1 (화면이 다시 그릴지 판단) */
  rev: number;
};

/* ── 해금 ─────────────────────────────────────────────────── */

const NORMAL = RECIPES.filter((r) => !r.course);

/** 단계에서 주문할 수 있는 음식 (코스 제외) */
export function recipesAt(stage: number): RecipeId[] {
  return NORMAL.filter((r) => r.unlock <= Math.min(stage, STAGE_MAX)).map((r) => r.id);
}

/** 단계에서 새로 나오는 음식 (코스 포함) */
export function newRecipesAt(stage: number): RecipeId[] {
  return RECIPES.filter((r) => r.unlock === stage).map((r) => r.id);
}

/** 재료 칸 — 해금된 음식이 쓰는 재료만 */
export function itemsAt(stage: number): ItemId[] {
  const used = new Set<ItemId>();
  for (const id of recipesAt(stage)) for (const s of RECIPE[id].steps) if (s.kind === "add") used.add(s.item);
  return ITEMS.filter((d) => used.has(d.id)).map((d) => d.id);
}

export function slotsAt(stage: number): Record<ToolId, number> {
  return planOf(stage).slots;
}

/* ── 만들기 ────────────────────────────────────────────────── */

function emptyPlate(): Plate {
  return { tokens: [], dirty: false, inTool: null, wrongAt: -1, doneAt: -1 };
}

export function createGame(seed: number): Game {
  const s = seed >>> 0;
  const slots = slotsAt(1);
  const tools = Object.fromEntries(TOOL_IDS.map((t) => [t, Array.from({ length: slots[t] }, () => null)])) as Record<
    ToolId,
    (Slot | null)[]
  >;
  return {
    seed: s,
    rng: mulberry32(s ^ 0xc0ffee),
    t: 0,
    stage: 1,
    stageServed: 0,
    stageSeated: 0,
    seenThisStage: new Set(),
    infLevel: 0,
    infT: 0,
    pause: 0,
    tables: Array.from({ length: TABLES }, () => null),
    plates: Array.from({ length: TABLES }, emptyPlate),
    selected: -1,
    tools,
    bugs: [],
    bugT: -1,
    spawnT: CFG.spawn.first,
    seq: 0,
    combo: 0,
    dishScore: 0,
    bonusScore: 0,
    wave: 0,
    stats: {
      served: 0,
      byStar: [0, 0, 0, 0, 0],
      orders: 0,
      courses: 0,
      doubles: 0,
      rejects: 0,
      bugFails: 0,
      maxCombo: 0,
      perfects: 0,
      hotfixes: 0,
      cleanBuilds: 0,
      cleanOrders: 0,
      undos: 0,
      dishes: {},
    },
    over: false,
    end: null,
    overT: 0,
    culprit: -1,
    events: [],
    cues: 0,
    owlEnergyFound: false,
    rev: 0,
  };
}

/* ── 조회 도우미 ────────────────────────────────────────────── */

export function dishOf(c: Customer): RecipeId {
  return c.order.dishes[c.order.idx];
}

/** 손님이 앉아 있고(떠나는 중 아님) 접시가 도구 밖에 있는 테이블 */
export function plateUsable(g: Game, i: number): boolean {
  const c = g.tables[i];
  return !!c && c.leaving <= 0 && !g.plates[i].inTool && !g.over;
}

export function toolUnlocked(g: Game, tool: ToolId): boolean {
  return g.tools[tool].length > 0;
}

/** 버그가 앉아 있는가 (기어 오는 중은 아직 아니다) */
export function bugOn(g: Game, kind: "table" | "tool" | "system", key?: number | ToolId): boolean {
  return g.bugs.some(
    (b) =>
      b.crawl <= 0 &&
      b.target.kind === kind &&
      (kind === "system" ||
        (b.target.kind === "table" && b.target.i === key) ||
        (b.target.kind === "tool" && b.target.tool === key)),
  );
}

export function slotDone(s: Slot): boolean {
  return s.t >= s.dur;
}

function wrongIndex(tokens: readonly Token[], want: readonly Token[]): number {
  for (let k = 0; k < tokens.length; k++) if (k >= want.length || tokens[k] !== want[k]) return k;
  return -1;
}

/** 접시가 바뀐 뒤 — 어긋난 자리와 완성 시각을 다시 구한다 */
function refreshPlate(g: Game, i: number): void {
  const p = g.plates[i];
  const c = g.tables[i];
  if (!c) {
    p.wrongAt = -1;
    p.doneAt = -1;
    return;
  }
  const want = TOKENS[dishOf(c)];
  p.wrongAt = wrongIndex(p.tokens, want);
  const done = p.wrongAt < 0 && p.tokens.length === want.length;
  if (!done) p.doneAt = -1;
  else if (p.doneAt < 0) p.doneAt = g.t;
}

/** 이 접시에 다음으로 필요한 단계 (없으면 null = 다 됐거나 어긋남) */
export function nextStep(g: Game, i: number) {
  const c = g.tables[i];
  if (!c) return null;
  const p = g.plates[i];
  if (p.wrongAt >= 0) return null;
  const r = RECIPE[dishOf(c)];
  return r.steps[p.tokens.length] ?? null;
}

export function plateComplete(g: Game, i: number): boolean {
  const c = g.tables[i];
  if (!c) return false;
  const want = TOKENS[dishOf(c)];
  const p = g.plates[i];
  return p.wrongAt < 0 && p.tokens.length === want.length;
}

/** 인내도 최대치 (GDD §25) */
export function patienceFor(g: Game, dish: RecipeId): number {
  const p = CFG.patience;
  const cap = planOf(g.stage).customers;
  return workSec(dish) * slackOf(g.stage, g.infLevel) + p.base + (cap - 1) * p.par;
}

/* ── 이벤트 · 신호 ───────────────────────────────────────────── */

function emit(g: Game, e: GameEvent): void {
  g.events.push(e);
  if (g.events.length > 40) g.events.splice(0, g.events.length - 40);
}

function block(g: Game, reason: BlockReason, target: string): false {
  emit(g, { type: "blocked", reason, target });
  g.cues |= CUE.BLOCK;
  return false;
}

/* ── 손님 · 주문 ───────────────────────────────────────────── */

function pick<T>(g: Game, list: readonly T[], weight: (x: T) => number): T {
  let sum = 0;
  for (const x of list) sum += weight(x);
  let r = g.rng() * sum;
  for (const x of list) {
    r -= weight(x);
    if (r <= 0) return x;
  }
  return list[list.length - 1];
}

function onTables(g: Game): Set<RecipeId> {
  const s = new Set<RecipeId>();
  for (const c of g.tables) if (c) for (const d of c.order.dishes) s.add(d);
  return s;
}

function pickOrder(g: Game): Order {
  const inf = g.stage >= INF_STAGE;
  const busy = onTables(g);
  const hasCourse = g.tables.some((c) => c && c.order.kind === "course");

  if (!inf) {
    // 마지막 단계(25)의 네 번째 주문은 풀스택 코스요리 (최종 보스)
    if (g.stage === STAGE_MAX && g.stageSeated === STAGES_COURSE_AT && !hasCourse && g.stats.courses === 0) {
      return { kind: "course", dishes: [...RECIPE.fullstack.course!], idx: 0 };
    }
    // 단계의 새 음식을 먼저 한 번씩
    const fresh = newRecipesAt(g.stage).filter((id) => !RECIPE[id].course && !g.seenThisStage.has(id));
    if (fresh.length) return { kind: "single", dishes: [fresh[Math.floor(g.rng() * fresh.length)]], idx: 0 };
  } else {
    if (!hasCourse && g.rng() < CFG.infinite.courseChance) {
      return { kind: "course", dishes: [...RECIPE.fullstack.course!], idx: 0 };
    }
    if (g.infLevel >= CFG.infinite.doubleFrom && g.rng() < CFG.infinite.doubleChance) {
      const small = recipesAt(STAGE_MAX).filter((id) => RECIPE[id].stars <= CFG.infinite.doubleMaxStars);
      const d = pick(g, small, (id) => (busy.has(id) ? 0.3 : 1));
      return { kind: "double", dishes: [d, d], idx: 0 };
    }
  }

  const pool = recipesAt(g.stage);
  // 이 단계 기준 별 수 (25단계 → ★5) 이상에 가중치 ×2
  const target = inf ? 3 : Math.max(1, Math.ceil(g.stage / 5));
  const d = pick(g, pool, (id) => (RECIPE[id].stars >= target ? 2 : 1) * (busy.has(id) ? 0.3 : 1));
  return { kind: "single", dishes: [d], idx: 0 };
}

/** 마지막 단계에서 코스요리가 나오는 자리 (0부터 센 앉힌 순서) */
const STAGES_COURSE_AT = planOf(STAGE_MAX).orders - 1;

function seat(g: Game, i: number): void {
  const order = pickOrder(g);
  for (const d of order.dishes) g.seenThisStage.add(d);
  const max = patienceFor(g, order.dishes[0]);
  // 겉모습 — 다른 테이블 손님과 같은 그림(LOOKS 가지 중 하나)이 되지 않게 옆으로 민다 (난수는 한 번만 쓴다)
  let look = Math.floor(g.rng() * 1e6);
  const used = new Set(g.tables.filter((c) => c && c.leaving <= 0).map((c) => c!.look % LOOKS));
  for (let k = 0; k < LOOKS && used.has(look % LOOKS); k++) look++;
  g.tables[i] = { id: ++g.seq, order, patience: max, max, look, t0: g.t, leaving: 0, happy: false };
  g.plates[i] = emptyPlate();
  g.stageSeated++;
  if (g.selected < 0 || !g.tables[g.selected] || g.tables[g.selected]!.leaving > 0) g.selected = i;
  emit(g, { type: "seat", table: i });
  g.cues |= CUE.SEAT;
  g.rev++;
}

function seatedCount(g: Game): number {
  let n = 0;
  for (const c of g.tables) if (c && c.leaving <= 0) n++;
  return n;
}

function updateSpawn(g: Game, dt: number): void {
  g.spawnT -= dt;
  if (g.spawnT > 0) return;
  if (seatedCount(g) >= planOf(g.stage).customers) return;
  const free: number[] = [];
  for (let i = 0; i < TABLES; i++) if (!g.tables[i]) free.push(i);
  if (!free.length) return;
  seat(g, free[Math.floor(g.rng() * free.length)]);
  g.spawnT = Math.max(CFG.spawn.between, 0);
}

/** 가장 급한 주문의 테이블 (없으면 -1) */
export function mostUrgent(g: Game, except = -1): number {
  let best = -1;
  let bestP = Infinity;
  for (let i = 0; i < TABLES; i++) {
    const c = g.tables[i];
    if (!c || c.leaving > 0 || i === except) continue;
    if (c.patience < bestP) {
      bestP = c.patience;
      best = i;
    }
  }
  return best;
}

/* ── 주방 ─────────────────────────────────────────────────── */

function freeSlot(g: Game, tool: ToolId): number {
  return g.tools[tool].findIndex((s) => s === null);
}

function startItem(g: Game, item: ItemId, step: number, tool: ToolId): boolean {
  if (!toolUnlocked(g, tool)) return block(g, "locked", tool);
  if (bugOn(g, "tool", tool)) return block(g, "bug", tool);
  const k = freeSlot(g, tool);
  if (k < 0) return block(g, "full", tool);
  g.tools[tool][k] = { kind: "item", item, step, t: 0, dur: CFG.tools[tool].cook, rang: false };
  g.cues |= tool === "board" ? CUE.CHOP : CUE.SIZZLE;
  g.rev++;
  return true;
}

function addToPlate(g: Game, i: number, token: Token): boolean {
  if (i < 0 || !g.tables[i] || g.tables[i]!.leaving > 0) return block(g, "noPlate", `plate:${i}`);
  const p = g.plates[i];
  if (p.inTool) return block(g, "inTool", `plate:${i}`);
  p.tokens.push(token);
  refreshPlate(g, i);
  g.cues |= CUE.TAP;
  g.rev++;
  return true;
}

function sendPlate(g: Game, i: number, tool: ToolId): boolean {
  if (!plateUsable(g, i)) return block(g, g.plates[i].inTool ? "inTool" : "noPlate", `plate:${i}`);
  if (!toolUnlocked(g, tool)) return block(g, "locked", tool);
  if (bugOn(g, "tool", tool)) return block(g, "bug", tool);
  const k = freeSlot(g, tool);
  if (k < 0) return block(g, "full", tool);
  g.tools[tool][k] = { kind: "plate", table: i, t: 0, dur: CFG.tools[tool].cook };
  g.plates[i].inTool = tool;
  g.cues |= tool === "board" ? CUE.CHOP : CUE.SIZZLE;
  g.rev++;
  return true;
}

function updateTools(g: Game, dt: number): void {
  for (const tool of TOOL_IDS) {
    const slots = g.tools[tool];
    for (let k = 0; k < slots.length; k++) {
      const s = slots[k];
      if (!s) continue;
      const was = s.t >= s.dur;
      s.t = Math.min(s.dur, s.t + dt);
      if (was || s.t < s.dur) continue;
      if (s.kind === "plate") {
        // 마무리는 끝나면 접시가 제자리로 돌아간다 (타지 않는다 — GDD §22)
        const p = g.plates[s.table];
        p.inTool = null;
        p.tokens.push(`@${tool}`);
        refreshPlate(g, s.table);
        slots[k] = null;
        g.cues |= CUE.DING;
        g.rev++;
      } else if (!s.rang) {
        s.rang = true;
        g.cues |= CUE.DING;
        g.rev++;
      }
    }
  }
}

/* ── 플레이어 행동 (GDD §20) ───────────────────────────────── */

export function unlockedItems(g: Game): ItemId[] {
  return itemsAt(g.stage);
}

/** 재료 칸 탭 — 손질이 없으면 선택된 접시로, 있으면 첫 도구로 */
export function tapItem(g: Game, item: ItemId): boolean {
  if (g.over || g.pause > 0) return false;
  if (!unlockedItems(g).includes(item)) return block(g, "locked", item);
  const chain = ITEM[item].chain;
  if (!chain.length) return addToPlate(g, g.selected, item);
  return startItem(g, item, 0, chain[0]);
}

/** 도구 칸 탭 — 다 된 재료를 다음 도구나 선택된 접시로 */
export function tapTool(g: Game, tool: ToolId, slot = -1): boolean {
  if (g.over || g.pause > 0) return false;
  if (!toolUnlocked(g, tool)) return block(g, "locked", tool);
  if (bugOn(g, "tool", tool)) return block(g, "bug", tool);
  const slots = g.tools[tool];
  let k = slot;
  if (k < 0) k = slots.findIndex((s) => s?.kind === "item" && slotDone(s));
  const s = k >= 0 ? slots[k] : null;
  // 빈 칸 · 마무리 중인 접시 칸은 조용히 (GDD §20 "조리 중 → 아무 일 없음"), 재료가 아직 익는 중이면 알려 준다
  if (!s || s.kind !== "item") return false;
  if (!slotDone(s)) return block(g, "busy", tool);
  return takeItem(g, tool, k, g.selected);
}

/** 도구의 다 된 재료를 꺼낸다 — 다음 손질이 있으면 그 도구로, 없으면 접시 i 로 */
function takeItem(g: Game, tool: ToolId, k: number, plate: number): boolean {
  const s = g.tools[tool][k];
  if (!s || s.kind !== "item" || !slotDone(s)) return block(g, "busy", tool);
  const chain = ITEM[s.item].chain;
  if (s.step + 1 < chain.length) {
    const next = chain[s.step + 1];
    if (!startItem(g, s.item, s.step + 1, next)) return false;
    g.tools[tool][k] = null;
    g.rev++;
    return true;
  }
  if (!addToPlate(g, plate, s.item)) return false;
  g.tools[tool][k] = null;
  g.rev++;
  return true;
}

export function select(g: Game, i: number): boolean {
  if (g.over) return false;
  if (!g.tables[i] || g.tables[i]!.leaving > 0) return false;
  if (g.selected !== i) {
    g.selected = i;
    g.cues |= CUE.TAP;
    g.rev++;
  }
  return true;
}

/** 접시 탭 — 선택 안 된 접시면 선택, 선택된 접시면 "다음 행동" */
export function tapPlate(g: Game, i: number): boolean {
  if (g.over || g.pause > 0) return false;
  if (g.selected !== i) return select(g, i);
  return nextAction(g, i);
}

export function nextAction(g: Game, i: number): boolean {
  if (g.over || g.pause > 0) return false;
  const c = g.tables[i];
  if (!c || c.leaving > 0) return block(g, "noPlate", `plate:${i}`);
  const p = g.plates[i];
  if (p.inTool) return block(g, "inTool", `plate:${i}`);
  if (p.wrongAt >= 0) return block(g, "wrong", `plate:${i}`);
  if (plateComplete(g, i)) return serve(g, i);
  const step = nextStep(g, i);
  if (!step) return false;
  if (step.kind === "fin") return sendPlate(g, i, step.tool);
  emit(g, { type: "need", item: step.item });
  return false;
}

/** 드래그 — 재료 칸이나 도구 칸의 것을 접시 i 에 */
export function dropOnPlate(g: Game, src: { item: ItemId } | { tool: ToolId; slot: number }, i: number): boolean {
  if (g.over || g.pause > 0) return false;
  if ("item" in src) {
    if (!unlockedItems(g).includes(src.item)) return block(g, "locked", src.item);
    if (ITEM[src.item].chain.length) return block(g, "raw", src.item);
    if (!addToPlate(g, i, src.item)) return false;
    select(g, i);
    return true;
  }
  if (bugOn(g, "tool", src.tool)) return block(g, "bug", src.tool);
  const s = g.tools[src.tool][src.slot];
  if (!s || s.kind !== "item" || !slotDone(s)) return block(g, "busy", src.tool);
  if (s.step + 1 < ITEM[s.item].chain.length) return block(g, "raw", s.item);
  if (!takeItem(g, src.tool, src.slot, i)) return false;
  select(g, i);
  return true;
}

/** 드래그 — 재료를 도구에 (손질 경로의 그 도구일 때만) */
export function dropOnTool(g: Game, item: ItemId, tool: ToolId): boolean {
  if (g.over || g.pause > 0) return false;
  const chain = ITEM[item].chain;
  if (chain[0] !== tool) return block(g, "wrongTool", tool);
  return tapItem(g, item);
}

/** 드래그 — 도구의 다 된 재료를 다른 도구에 (고기: 도마 → 팬). 손질 경로의 다음 도구일 때만 */
export function dropSlotOnTool(g: Game, from: ToolId, slot: number, to: ToolId): boolean {
  if (g.over || g.pause > 0) return false;
  if (from === to) return false;
  if (bugOn(g, "tool", from)) return block(g, "bug", from);
  const s = g.tools[from][slot];
  if (!s || s.kind !== "item") return false;
  if (!slotDone(s)) return block(g, "busy", from);
  if (ITEM[s.item].chain[s.step + 1] !== to) return block(g, "wrongTool", to);
  return takeItem(g, from, slot, g.selected);
}

/** 도구 칸의 재료를 버린다 (쓰레기통에 끌어 놓기) — 잘못 올린 재료로 도구가 막혔을 때의 탈출구. 벌점 없음 */
export function discardSlot(g: Game, tool: ToolId, slot: number): boolean {
  if (g.over || g.pause > 0) return false;
  if (bugOn(g, "tool", tool)) return block(g, "bug", tool);
  const s = g.tools[tool][slot];
  if (!s || s.kind !== "item") return false;
  g.tools[tool][slot] = null;
  g.stats.undos++;
  g.cues |= CUE.TAP;
  g.rev++;
  return true;
}

/** 드래그 — 접시를 도구(마무리)나 자기 테이블(제출)에 */
export function dropPlate(g: Game, i: number, target: { tool: ToolId } | { table: number }): boolean {
  if (g.over || g.pause > 0) return false;
  if ("tool" in target) return sendPlate(g, i, target.tool);
  if (target.table !== i) return block(g, "otherTable", `table:${target.table}`);
  if (!plateUsable(g, i)) return block(g, "noPlate", `plate:${i}`);
  const p = g.plates[i];
  if (p.wrongAt < 0 && !plateComplete(g, i)) return block(g, "notDone", `plate:${i}`);
  return serve(g, i);
}

export function undo(g: Game): boolean {
  if (g.over || g.pause > 0) return false;
  const i = g.selected;
  if (!plateUsable(g, i)) return block(g, i >= 0 && g.plates[i].inTool ? "inTool" : "noPlate", `plate:${i}`);
  const p = g.plates[i];
  const last = p.tokens[p.tokens.length - 1];
  if (!last) return false;
  if (last.startsWith("@")) return block(g, "cantUndo", `plate:${i}`);
  p.tokens.pop();
  p.dirty = true;
  refreshPlate(g, i);
  g.stats.undos++;
  g.cues |= CUE.TAP;
  g.rev++;
  return true;
}

export function trash(g: Game): boolean {
  if (g.over || g.pause > 0) return false;
  const i = g.selected;
  if (!plateUsable(g, i)) return block(g, i >= 0 && g.plates[i].inTool ? "inTool" : "noPlate", `plate:${i}`);
  const p = g.plates[i];
  if (!p.tokens.length) return false;
  p.tokens = [];
  p.dirty = true;
  p.wrongAt = -1;
  p.doneAt = -1;
  g.stats.undos++;
  g.cues |= CUE.TAP;
  g.rev++;
  return true;
}

/* ── 제출 (GDD §28 · §29) ──────────────────────────────────── */

function penalize(c: Customer): void {
  const p = CFG.patience;
  if (c.patience > p.floorSec) c.patience = Math.max(p.floorSec, c.patience - c.max * p.penalty);
}

function serve(g: Game, i: number): boolean {
  const c = g.tables[i]!;
  const p = g.plates[i];
  const bugged = bugOn(g, "table", i) || bugOn(g, "system");
  if (bugged || p.wrongAt >= 0 || !plateComplete(g, i)) {
    // BUG REPORT · CompileError — 요리 폐기, 콤보 0, 인내도 -20% (3초 하한)
    const reason = bugged ? "bug" : "compile";
    if (bugged) g.stats.bugFails++;
    else g.stats.rejects++;
    g.plates[i] = { ...emptyPlate(), dirty: true };
    g.combo = 0;
    penalize(c);
    emit(g, { type: "reject", table: i, reason });
    g.cues |= reason === "bug" ? CUE.BUG | CUE.REJECT : CUE.REJECT;
    g.rev++;
    return false;
  }

  const dish = dishOf(c);
  const r = RECIPE[dish];
  const sc = CFG.score;
  const m = scoreMultOf(g.stage);
  const base = sc.base[r.stars];
  const ratio = Math.max(0, Math.min(1, c.patience / c.max));
  const dishPts = (base + base * sc.fast * ratio + base * sc.combo * Math.min(g.combo, sc.comboCap)) * m;
  const perfect = !p.dirty && ratio >= sc.perfectRatio;
  const hotfix = g.bugs.some((b) => b.crawl <= 0 && !(b.target.kind === "table" && b.target.i === i));
  const bonus = ((perfect ? sc.perfect : 0) + (hotfix ? sc.hotfix : 0)) * m;
  g.dishScore += dishPts;
  g.bonusScore += bonus;
  g.combo++;
  g.stats.maxCombo = Math.max(g.stats.maxCombo, g.combo);
  g.stats.served++;
  g.stats.byStar[r.stars - 1]++;
  g.stats.dishes[dish] = (g.stats.dishes[dish] ?? 0) + 1;
  if (perfect) g.stats.perfects++;
  if (hotfix) g.stats.hotfixes++;
  g.plates[i] = emptyPlate();

  const more = c.order.idx < c.order.dishes.length - 1;
  emit(g, {
    type: "serve",
    table: i,
    dish,
    score: Math.round(dishPts + bonus),
    fast: ratio >= sc.fastShow,
    perfect,
    hotfix,
    combo: g.combo,
    next: more,
  });
  g.cues |= CUE.SERVE | (g.combo >= 5 ? CUE.COMBO : 0);

  if (more) {
    // 코스·×2 — 다음 접시로, 인내도는 그 접시 기준으로 다시 채운다
    c.order.idx++;
    c.max = patienceFor(g, dishOf(c)) * CFG.patience.refill;
    c.patience = c.max;
    g.rev++;
    return true;
  }

  // 주문 끝 — 손님 퇴장
  c.leaving = CFG.spawn.leave;
  c.happy = true;
  g.stats.orders++;
  g.stageServed++;
  g.wave++;
  if (c.order.kind === "course") {
    g.stats.courses++;
    const fs = sc.fullStack * m;
    g.bonusScore += fs;
    emit(g, { type: "fullstack", table: i, score: Math.round(fs) });
    g.cues |= CUE.FULLSTACK;
  } else if (c.order.kind === "double") {
    g.stats.doubles++;
  }

  // CLEAN BUILD — 이 제출로 대기 주문이 0 이 됐고, 직전에 비었던 뒤로 2건 이상
  if (seatedCount(g) === 0) {
    if (g.wave >= 2) {
      const cb = sc.clean * g.wave * m;
      g.bonusScore += cb;
      g.stats.cleanBuilds++;
      g.stats.cleanOrders += g.wave;
      emit(g, { type: "clean", n: g.wave, score: Math.round(cb) });
    }
    g.wave = 0;
  }

  if (g.selected === i) g.selected = mostUrgent(g, i);
  g.spawnT = Math.max(g.spawnT, gapOf(g.stage, g.infLevel));
  checkStage(g);
  g.rev++;
  return true;
}

/* ── 단계 (GDD §26) ─────────────────────────────────────────── */

function checkStage(g: Game): void {
  if (g.stage > STAGE_MAX) return;
  const plan = planOf(g.stage);
  if (g.stageServed < plan.orders) return;
  if (g.stage === STAGE_MAX && g.stats.courses < 1) return;

  g.stage++;
  g.stageServed = 0;
  g.stageSeated = 0;
  g.seenThisStage.clear();

  const before = slotsAt(g.stage - 1);
  const after = slotsAt(g.stage);
  const newTools: ToolId[] = [];
  for (const t of TOOL_IDS) {
    if (before[t] === 0 && after[t] > 0) newTools.push(t);
    while (g.tools[t].length < after[t]) g.tools[t].push(null);
  }
  const recipes = g.stage <= STAGE_MAX ? newRecipesAt(g.stage) : [];
  if (g.stage === INF_STAGE) {
    g.infLevel = 1;
    g.infT = 0;
  }
  g.pause = CFG.run.stagePause + (recipes.length || newTools.length ? CFG.run.newCard : 0);
  emit(g, { type: "stage", stage: g.stage, recipes, tools: newTools });
  g.cues |= CUE.STAGE;
  if (g.stage === CFG.owlEnergy.minStage && !g.owlEnergyFound && g.rng() < CFG.owlEnergy.chance) g.owlEnergyFound = true;
}

/* ── 버그 (GDD §27) ─────────────────────────────────────────── */

function bugInterval(g: Game, every: number): number {
  return every * (0.6 + g.rng() * 0.8);
}

function trySpawnBug(g: Game): boolean {
  const plan = bugPlanOf(g.stage, g.infLevel);
  if (!plan) return false;
  const b = CFG.bugs;
  const inf = g.stage >= INF_STAGE;
  const live = g.bugs.filter((x) => x.target.kind !== "system").length;

  if (inf && g.infLevel >= b.systemFromInf && g.rng() < b.systemShare && !g.bugs.some((x) => x.target.kind === "system")) {
    g.bugs.push({ id: ++g.seq, target: { kind: "system" }, crawl: b.systemWarn, life: b.systemDur, dur: b.systemDur });
    emit(g, { type: "bug", target: { kind: "system" } });
    g.cues |= CUE.WARN;
    return true;
  }
  if (live >= plan.max) return false;

  const tables: number[] = [];
  for (let i = 0; i < TABLES; i++) {
    const c = g.tables[i];
    if (!c || c.leaving > 0) continue;
    if (c.patience <= plan.dur + b.crawl + b.fairPad) continue;
    if (g.bugs.some((x) => x.target.kind === "table" && x.target.i === i)) continue;
    tables.push(i);
  }
  const tools: ToolId[] = plan.tools
    ? TOOL_IDS.filter(
        (t) =>
          toolUnlocked(g, t) &&
          !g.tools[t].some((s) => s?.kind === "plate") &&
          !g.bugs.some((x) => x.target.kind === "tool" && x.target.tool === t),
      )
    : [];

  let target: BugTarget | null = null;
  const wantTool = tools.length > 0 && (tables.length === 0 || g.rng() < b.toolShare);
  if (wantTool) target = { kind: "tool", tool: tools[Math.floor(g.rng() * tools.length)] };
  else if (tables.length) target = { kind: "table", i: tables[Math.floor(g.rng() * tables.length)] };
  if (!target) return false;

  g.bugs.push({ id: ++g.seq, target, crawl: b.crawl, life: plan.dur, dur: plan.dur });
  emit(g, { type: "bug", target });
  g.cues |= CUE.BUG;
  g.rev++;
  return true;
}

function landingFair(g: Game, b: Bug): boolean {
  const t = b.target;
  if (t.kind === "tool") return !g.tools[t.tool].some((s) => s?.kind === "plate");
  if (t.kind === "table") {
    const c = g.tables[t.i];
    return !!c && c.leaving <= 0 && c.patience > b.dur + CFG.bugs.fairPad;
  }
  return true;
}

function updateBugs(g: Game, dt: number): void {
  for (const x of g.bugs) {
    if (x.crawl > 0) {
      x.crawl -= dt;
      if (x.crawl <= 0) {
        // 기어 오는 동안 사정이 바뀌었으면 앉지 않는다 (공정성 §27): 그 사이 접시가 들어간 도구 · 떠난 손님 · 인내도가 바닥난 테이블
        if (!landingFair(g, x)) x.life = 0;
        g.rev++;
      }
    } else x.life -= dt;
  }
  const n = g.bugs.length;
  g.bugs = g.bugs.filter((x) => x.life > 0);
  if (g.bugs.length !== n) g.rev++;

  const plan = bugPlanOf(g.stage, g.infLevel);
  if (!plan) return;
  if (g.bugT < 0) g.bugT = bugInterval(g, plan.every);
  g.bugT -= dt;
  if (g.bugT > 0) return;
  g.bugT = trySpawnBug(g) ? bugInterval(g, plan.every) : CFG.bugs.retry;
}

/* ── 한 틱 ────────────────────────────────────────────────── */

/**
 * 영업 종료 (CLOSING TIME) — 화면이 **벽시계**로 세션 상한을 넘겼을 때 부른다.
 * 서버는 세션 시작부터 벽시계로 재므로 게임 시간(g.t — 창을 가리면 멈춘다)만으로는 모자란다.
 */
export function closeShop(g: Game): void {
  finish(g, "closing", -1);
}

function finish(g: Game, end: EndReason, table: number): void {
  if (g.over) return;
  g.over = true;
  g.end = end;
  g.culprit = table;
  emit(g, { type: "over", end, table });
  g.cues |= CUE.OVER;
  g.rev++;
}

export function update(g: Game, dt: number): void {
  g.t += dt;
  if (g.over) {
    g.overT += dt;
    return;
  }
  if (g.t >= CFG.run.sessionCap) {
    finish(g, "closing", -1);
    return;
  }
  if (g.pause > 0) {
    g.pause -= dt;
    return;
  }

  updateTools(g, dt);

  for (let i = 0; i < TABLES; i++) {
    const c = g.tables[i];
    if (!c) continue;
    if (c.leaving > 0) {
      c.leaving -= dt;
      if (c.leaving <= 0) {
        g.tables[i] = null;
        g.plates[i] = emptyPlate();
        g.rev++;
      }
      continue;
    }
    c.patience -= dt;
    if (c.patience <= 0) {
      c.patience = 0;
      finish(g, "patience", i);
      return;
    }
  }

  updateSpawn(g, dt);
  updateBugs(g, dt);

  if (g.stage >= INF_STAGE) {
    g.infT += dt;
    if (g.infT >= CFG.infinite.levelSec) {
      g.infT -= CFG.infinite.levelSec;
      g.infLevel++;
      emit(g, { type: "inf", level: g.infLevel });
      g.cues |= CUE.STAGE;
    }
  }
}

/* ── 안내 (튜토리얼 반짝임 · 봇) ────────────────────────────── */

export type Hint =
  | { kind: "item"; item: ItemId }
  | { kind: "tool"; tool: ToolId; slot: number }
  | { kind: "plate"; i: number }
  | { kind: "undo" }
  | null;

/** 접시 i 를 완성하려면 지금 무엇을 누르면 되는가 */
export function hintFor(g: Game, i: number): Hint {
  const c = g.tables[i];
  if (!c || c.leaving > 0) return null;
  const p = g.plates[i];
  if (p.inTool) return null;
  if (p.wrongAt >= 0) return { kind: "undo" };
  if (plateComplete(g, i)) return { kind: "plate", i };
  const step = nextStep(g, i);
  if (!step) return null;
  if (step.kind === "fin") return { kind: "plate", i };
  const chain = ITEM[step.item].chain;
  if (!chain.length) return { kind: "item", item: step.item };
  // 이 재료가 이미 도구에서 손질 중이거나 다 됐으면 그 도구를 가리킨다 (가장 앞선 것)
  for (let st = chain.length - 1; st >= 0; st--) {
    const tool = chain[st];
    const slots = g.tools[tool];
    for (let k = 0; k < slots.length; k++) {
      const s = slots[k];
      if (s?.kind === "item" && s.item === step.item && s.step === st) return { kind: "tool", tool, slot: k };
    }
  }
  return { kind: "item", item: step.item };
}
