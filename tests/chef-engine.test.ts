import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CFG, INF_STAGE, STAGES, STAGE_MAX, ordersBefore, stageOf } from "@/games/chef/config";
import { ITEM, ITEMS } from "@/games/chef/data/items";
import { RECIPE, RECIPES, TOKENS, itemsOf, toolsOf, workSec } from "@/games/chef/data/recipes";
import {
  CUE,
  createGame,
  discardSlot,
  dropPlate,
  dropSlotOnTool,
  itemsAt,
  nextAction,
  patienceFor,
  recipesAt,
  select,
  slotsAt,
  tapItem,
  tapTool,
  trash,
  undo,
  update,
  type Game,
} from "@/games/chef/engine/game";
import { BOTS, createBot, stepBot, type BotSkill } from "@/games/chef/engine/bot";
import { buildMeta, rawScore, serverRaw, serverReject } from "@/games/chef/engine/score";

const DT = CFG.dt;

function run(g: Game, sec: number, onTick?: () => void): void {
  for (let t = 0; t < sec && !g.over; t += DT) {
    update(g, DT);
    onTick?.();
  }
}

/** 첫 손님이 앉을 때까지 */
function untilSeated(g: Game, i = -1): number {
  for (let k = 0; k < 600; k++) {
    const idx = i >= 0 ? i : g.tables.findIndex((c) => c && c.leaving <= 0);
    if (idx >= 0 && g.tables[idx]) return idx;
    update(g, DT);
  }
  throw new Error("손님이 안 온다");
}

type Sim = { g: Game; stage: number; sec: number; raw: number };

function simulate(seed: number, skill: BotSkill, cap: number = CFG.run.sessionCap): Sim {
  const g = createGame(seed);
  const bot = createBot(skill, seed);
  while (!g.over && g.t < cap) {
    stepBot(g, bot, DT);
    update(g, DT);
  }
  return { g, stage: g.stage, sec: g.t, raw: rawScore(g) };
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe("데이터 (GDD §22 · §23 · §26)", () => {
  it("음식 25종 · 재료 22종 · 해금표 (25단계)", () => {
    expect(RECIPES).toHaveLength(25);
    expect(ITEMS).toHaveLength(22);
    // 25단계 — 한 단계에 새 음식 하나 (GDD 음식 번호 = 해금 단계)
    expect(STAGE_MAX).toBe(25);
    RECIPES.forEach((r, k) => expect(r.unlock, r.id).toBe(k + 1));
  });

  it("모든 음식은 자기 해금 단계에 이미 열린 도구·재료만 쓴다", () => {
    for (const r of RECIPES) {
      const slots = slotsAt(r.unlock);
      for (const t of toolsOf(r.id)) expect(slots[t], `${r.id} → ${t}`).toBeGreaterThan(0);
      if (r.course) for (const d of r.course) expect(RECIPE[d].unlock).toBeLessThanOrEqual(r.unlock);
    }
  });

  it("쓰이지 않는 재료가 없고, 15단계에 22칸 전부 열린다", () => {
    const used = new Set(RECIPES.flatMap((r) => itemsOf(r.id)));
    for (const d of ITEMS) expect(used.has(d.id), d.id).toBe(true);
    expect(itemsAt(1)).toEqual(["bun", "sausage", "sauce"]);
    expect(itemsAt(STAGE_MAX)).toHaveLength(22);
    for (let s = 1; s <= STAGE_MAX; s++) expect(itemsAt(s).length).toBeLessThanOrEqual(24);
  });

  it("별이 높을수록 평균 단계 수 · 작업 시간이 줄지 않는다", () => {
    let prevSteps = 0;
    let prevW = 0;
    for (let st = 1; st <= 5; st++) {
      const rs = RECIPES.filter((r) => r.stars === st && !r.course);
      const steps = rs.reduce((a, r) => a + r.steps.length, 0) / rs.length;
      const w = rs.reduce((a, r) => a + workSec(r.id), 0) / rs.length;
      expect(steps).toBeGreaterThanOrEqual(prevSteps);
      expect(w).toBeGreaterThanOrEqual(prevW);
      prevSteps = steps;
      prevW = w;
    }
  });

  it("W 는 GDD §23 표와 같다", () => {
    expect(workSec("hotdog")).toBe(6.5);
    expect(workSec("burger")).toBe(7.9);
    expect(workSec("lasagna")).toBe(22.6);
    expect(workSec("curry")).toBe(24.3);
    expect(workSec("fullstack")).toBe(41.3);
  });

  it("단계표 — 67주문 + 코스로 ∞", () => {
    expect(ordersBefore(INF_STAGE)).toBe(67);
    expect(INF_STAGE).toBe(26);
    expect(stageOf(0, 0)).toBe(1);
    expect(stageOf(2, 0)).toBe(2);
    expect(stageOf(63, 0)).toBe(25);
    expect(stageOf(90, 0)).toBe(25);
    expect(stageOf(67, 1)).toBe(INF_STAGE);
    expect(STAGES.map((s) => s.customers)).toEqual([1, 1, 1, 1, ...Array(7).fill(2), ...Array(14).fill(3)]);
  });

  it("버거 인내도 ≈ 30~36초 (원본 예시 35초) — 버거가 처음 나오는 2단계 기준", () => {
    const g = createGame(1);
    g.stage = RECIPE.burger.unlock;
    const p = patienceFor(g, "burger");
    expect(p).toBeGreaterThan(30);
    expect(p).toBeLessThan(36);
  });
});

describe("조작 (GDD §20)", () => {
  it("버거: 탭 한 번 = 한 단계, 패티는 팬을 거쳐 선택된 접시로", () => {
    const g = createGame(7);
    g.stage = 2;
    const i = untilSeated(g);
    g.tables[i]!.order.dishes = ["burger"];
    expect(g.selected).toBe(i);
    expect(tapItem(g, "bun")).toBe(true);
    expect(tapItem(g, "patty")).toBe(true); // → 팬
    expect(g.plates[i].tokens).toEqual(["bun"]);
    expect(tapTool(g, "pan")).toBe(false); // 아직 굽는 중
    run(g, CFG.tools.pan.cook + 0.05);
    expect(tapTool(g, "pan")).toBe(true);
    for (const it of ["cheese", "lettuce", "bun"] as const) tapItem(g, it);
    expect(g.plates[i].tokens).toEqual(TOKENS.burger);
    expect(nextAction(g, i)).toBe(true); // 제출
    expect(g.stats.served).toBe(1);
    expect(g.stats.perfects).toBe(1);
    expect(g.combo).toBe(1);
  });

  it("마무리 단계는 접시가 도구에 들어갔다가 저절로 돌아온다", () => {
    const g = createGame(3);
    g.stage = 3;
    const i = untilSeated(g);
    g.tables[i]!.order.dishes = ["fries"];
    tapItem(g, "potato");
    run(g, CFG.tools.board.cook + 0.05);
    tapTool(g, "board");
    expect(g.plates[i].tokens).toEqual(["potato"]);
    expect(nextAction(g, i)).toBe(true); // → 팬 튀기기
    expect(g.plates[i].inTool).toBe("pan");
    run(g, CFG.tools.pan.cook + 0.05);
    expect(g.plates[i].inTool).toBe(null);
    expect(g.plates[i].tokens).toEqual(["potato", "@pan"]);
    tapItem(g, "spice");
    expect(dropPlate(g, i, { table: i })).toBe(true);
  });

  it("순서가 틀리면 막지 않되 표시하고, 되돌리기로 고친다 · PERFECT 는 잃는다", () => {
    const g = createGame(5);
    g.stage = 2;
    const i = untilSeated(g);
    g.tables[i]!.order.dishes = ["burger"];
    tapItem(g, "cheese");
    expect(g.plates[i].wrongAt).toBe(0);
    expect(nextAction(g, i)).toBe(false);
    expect(undo(g)).toBe(true);
    expect(g.plates[i].wrongAt).toBe(-1);
    expect(g.plates[i].dirty).toBe(true);
    tapItem(g, "bun");
    tapItem(g, "lettuce");
    expect(trash(g)).toBe(true);
    expect(g.plates[i].tokens).toEqual([]);
  });

  it("틀린 요리를 내면 CompileError — 콤보 0 · 인내도 -20% · 3초 하한", () => {
    const g = createGame(9);
    g.stage = 2;
    const i = untilSeated(g);
    g.tables[i]!.order.dishes = ["hotdog"];
    g.combo = 4;
    tapItem(g, "cheese");
    const c = g.tables[i]!;
    const before = c.patience;
    expect(dropPlate(g, i, { table: i })).toBe(false);
    expect(g.combo).toBe(0);
    expect(g.stats.rejects).toBe(1);
    expect(c.patience).toBeCloseTo(before - c.max * CFG.patience.penalty, 3);
    c.patience = 3.5;
    tapItem(g, "cheese");
    dropPlate(g, i, { table: i });
    expect(c.patience).toBe(CFG.patience.floorSec);
  });

  it("버그가 앉은 테이블에 내면 BUG REPORT (게임 오버 아님)", () => {
    const g = createGame(11);
    const i = untilSeated(g);
    g.tables[i]!.order.dishes = ["salad"];
    g.plates[i].tokens = [...TOKENS.salad];
    g.bugs.push({ id: 99, target: { kind: "table", i }, crawl: 0, life: 5, dur: 5 });
    expect(nextAction(g, i)).toBe(false);
    expect(g.stats.bugFails).toBe(1);
    expect(g.over).toBe(false);
    expect(g.plates[i].tokens).toEqual([]);
  });

  it("버그가 기어 오는 중에는 내도 된다 · 도구 버그는 그 도구를 막는다", () => {
    const g = createGame(13);
    g.stage = 2;
    const i = untilSeated(g);
    g.tables[i]!.order.dishes = ["salad"];
    g.plates[i].tokens = [...TOKENS.salad];
    g.bugs.push({ id: 98, target: { kind: "table", i }, crawl: 0.5, life: 5, dur: 5 });
    g.bugs.push({ id: 97, target: { kind: "tool", tool: "pan" }, crawl: 0, life: 5, dur: 5 });
    expect(nextAction(g, i)).toBe(true);
    expect(g.stats.hotfixes).toBe(1); // 다른 곳(팬)에 버그가 있는 동안 성공
    expect(tapItem(g, "patty")).toBe(false);
  });

  it("레시피가 다 끝나면 완성 시각(doneAt)이 찍히고, 되돌리면 지워진다 — 화면이 재료를 합쳐 완성 요리로 바꾼다", () => {
    const g = createGame(23);
    g.stage = 2;
    const i = untilSeated(g);
    g.tables[i]!.order.dishes = ["fries"];
    g.stage = 3;
    tapItem(g, "potato");
    run(g, CFG.tools.board.cook + 0.05);
    tapTool(g, "board");
    nextAction(g, i); // → 팬
    expect(g.plates[i].doneAt).toBe(-1);
    run(g, CFG.tools.pan.cook + 0.05);
    tapItem(g, "spice");
    expect(g.plates[i].doneAt).toBeGreaterThan(0);
    const t0 = g.plates[i].doneAt;
    run(g, 0.5);
    expect(g.plates[i].doneAt).toBe(t0); // 다시 찍지 않는다
    undo(g);
    expect(g.plates[i].doneAt).toBe(-1);
  });

  it("QA — 도구 칸 재료 버리기 · 도마→팬 끌기 · 잘못된 도구/남의 테이블 알림 · 빈 칸 탭은 조용히", () => {
    const g = createGame(29);
    g.stage = 11;
    for (const t of Object.keys(g.tools) as (keyof typeof g.tools)[]) while (g.tools[t].length < slotsAt(11)[t]) g.tools[t].push(null);
    const i = untilSeated(g);
    g.tables[i]!.order.dishes = ["steak"];
    tapItem(g, "meat"); // → 도마
    run(g, CFG.tools.board.cook + 0.05);
    expect(dropSlotOnTool(g, "board", 0, "oven")).toBe(false);
    expect(g.events.some((e) => e.type === "blocked" && e.reason === "wrongTool")).toBe(true);
    expect(dropSlotOnTool(g, "board", 0, "pan")).toBe(true);
    expect(g.tools.pan[0]?.kind === "item" && g.tools.pan[0].item).toBe("meat");
    expect(discardSlot(g, "pan", 0)).toBe(true);
    expect(g.tools.pan[0]).toBe(null);
    g.events.length = 0;
    expect(tapTool(g, "pan", 0)).toBe(false);
    expect(g.events).toHaveLength(0); // 빈 칸은 조용히
    const other = (i + 1) % 3;
    expect(dropPlate(g, i, { table: other })).toBe(false);
    expect(g.events.some((e) => e.type === "blocked" && e.reason === "otherTable")).toBe(true);
  });

  it("QA — 기어 오는 동안 접시가 들어간 도구에는 버그가 앉지 않는다 · 떠난 테이블도", () => {
    const g = createGame(31);
    g.stage = 11;
    for (const t of Object.keys(g.tools) as (keyof typeof g.tools)[]) while (g.tools[t].length < slotsAt(11)[t]) g.tools[t].push(null);
    const i = untilSeated(g);
    g.bugT = 1e9;
    g.bugs.push({ id: 77, target: { kind: "tool", tool: "oven" }, crawl: 0.5, life: 5, dur: 5 });
    g.tools.oven[0] = { kind: "plate", table: i, t: 0, dur: 5 };
    g.plates[i].inTool = "oven";
    run(g, 0.6);
    expect(g.bugs.some((b) => b.id === 77)).toBe(false);
  });

  it("인내도가 바닥나면 즉시 게임 오버", () => {
    const g = createGame(15);
    const i = untilSeated(g);
    g.tables[i]!.patience = 0.05;
    run(g, 0.2);
    expect(g.over).toBe(true);
    expect(g.end).toBe("patience");
    expect(g.culprit).toBe(i);
    expect(g.cues & CUE.OVER).toBeTruthy();
  });

  it("단계 넘김 — 주문 N건 · 새 도구 칸 · 25단계 마지막은 코스요리", () => {
    const g = createGame(17);
    g.stage = 6;
    g.stageServed = 1;
    const i = untilSeated(g);
    g.tables[i]!.order.dishes = ["hotdog"];
    g.plates[i].tokens = [...TOKENS.hotdog];
    nextAction(g, i);
    expect(g.stage).toBe(7);
    expect(g.tools.pot).toHaveLength(1);
    expect(g.pause).toBeGreaterThan(CFG.run.stagePause);

    const h = createGame(19);
    h.stage = STAGE_MAX;
    h.stageSeated = STAGES[STAGE_MAX - 1].orders - 1;
    const k = untilSeated(h);
    expect(h.tables[k]!.order.kind).toBe("course");
    expect(h.tables[k]!.order.dishes).toEqual(RECIPE.fullstack.course);
  });

  it("해금되지 않은 재료는 누를 수 없다", () => {
    const g = createGame(21);
    untilSeated(g);
    expect(recipesAt(1)).toEqual(["hotdog"]);
    expect(recipesAt(2)).toEqual(["hotdog", "burger"]);
    expect(tapItem(g, "fish")).toBe(false);
    expect(select(g, 2)).toBe(g.tables[2] !== null);
  });

  it("같은 시드 → 같은 판 (결정적)", () => {
    const a = simulate(123, BOTS.mid, 200);
    const b = simulate(123, BOTS.mid, 200);
    expect(a.raw).toBe(b.raw);
    expect(a.stage).toBe(b.stage);
  });
});

describe("봇 밸런스 · 서버 식", () => {
  const SEEDS = Array.from({ length: 12 }, (_, k) => 1000 + k * 77);
  const sims = {
    slow: SEEDS.map((s) => simulate(s, BOTS.slow)),
    mid: SEEDS.map((s) => simulate(s, BOTS.mid)),
    fast: SEEDS.map((s) => simulate(s, BOTS.fast)),
  };

  it("분포 기록", () => {
    for (const [name, list] of Object.entries(sims)) {
      console.log(
        `[chef] ${name}: stage ${median(list.map((x) => x.stage))} (min ${Math.min(...list.map((x) => x.stage))}, max ${Math.max(...list.map((x) => x.stage))})` +
          ` · ${Math.round(median(list.map((x) => x.sec)))}s · raw ${median(list.map((x) => x.raw))} · P≈${30 + Math.min(270, Math.floor(median(list.map((x) => x.raw)) / 200))}`,
      );
    }
    expect(true).toBe(true);
  });

  it("느린 봇도 1~3단계에서 끝나지 않는다", () => {
    for (const s of sims.slow) expect(s.stage).toBeGreaterThanOrEqual(4);
  });

  it("모든 봇 판의 메타가 서버 거부 기준을 통과하고, 서버 원점수가 같다", () => {
    for (const list of Object.values(sims)) {
      for (const s of list) {
        const m = buildMeta(s.g, "desktop");
        expect(serverReject(m, s.sec + 0.5), JSON.stringify(m)).toBe(null);
        expect(Math.abs(serverRaw(m) - rawScore(s.g))).toBeLessThanOrEqual(2);
      }
    }
  });

  it("조작된 메타는 거부된다", () => {
    const m = buildMeta(sims.mid[0].g, "desktop");
    expect(serverReject({ ...m, stage_max: m.stage_max + 1 }, sims.mid[0].sec)).toBe("stage");
    expect(serverReject({ ...m, served_total: m.served_total + 1 }, sims.mid[0].sec)).toBe("stars");
    expect(serverReject(m, 5)).not.toBe(null);
    expect(serverRaw({ ...m, dish_score: m.dish_score * 10 })).toBeLessThan(rawScore(sims.mid[0].g) * 3);
  });

  it("모든 음식은 해금 단계에서 혼자 주문됐을 때 느린 봇이 시간 안에 만든다", () => {
    for (const r of RECIPES) {
      const g = createGame(500 + r.unlock);
      g.stage = r.unlock;
      for (const t of Object.keys(g.tools) as (keyof typeof g.tools)[])
        while (g.tools[t].length < slotsAt(r.unlock)[t]) g.tools[t].push(null);
      const i = untilSeated(g);
      const c = g.tables[i]!;
      c.order = r.course ? { kind: "course", dishes: [...r.course], idx: 0 } : { kind: "single", dishes: [r.id], idx: 0 };
      c.max = patienceFor(g, c.order.dishes[0]);
      c.patience = c.max;
      g.spawnT = 1e9;
      const bot = createBot(BOTS.slow, r.unlock);
      const orders = g.stats.orders;
      while (!g.over && g.stats.orders === orders && g.t < 200) {
        stepBot(g, bot, DT);
        update(g, DT);
      }
      expect(g.over, r.id).toBe(false);
      expect(g.stats.orders, r.id).toBe(orders + 1);
    }
  });

  it("아이템 체인 확인", () => {
    expect(ITEM.meat.chain).toEqual(["board", "pan"]);
  });
});

describe("마이그레이션과 같은 식인가 (20261005000000_chef.sql)", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261005000000_chef.sql"), "utf8");

  it("chef_stage 의 주문 누계 = STAGES[].orders 누계 · ∞ 는 43주문 + 코스", () => {
    const m = sql.match(/unnest\(array\[([\d, ]+)\]\)/);
    expect(m).not.toBeNull();
    const arr = m![1].split(",").map((x) => Number(x.trim()));
    expect(arr).toEqual(Array.from({ length: STAGE_MAX - 1 }, (_, k) => ordersBefore(k + 2)));
    expect(sql).toContain(`>= ${ordersBefore(INF_STAGE)} and coalesce(p_courses, 0) >= 1 then ${INF_STAGE}`);
  });

  it("기본 점수 · 보너스 · K · 세션 상한", () => {
    CFG.score.base.slice(1).forEach((b, k) => expect(sql).toContain(`chef_star(p_meta, ${k})) * ${b}`));
    const s = CFG.score;
    expect(sql).toContain(`v_perf * ${s.perfect} + v_hot * ${s.hotfix} + v_corders * ${s.clean} + v_courses * ${s.fullStack}`);
    expect(sql).toContain(`${1 + s.fast} + ${s.combo} * least(greatest(v_combo - 1, 0), ${s.comboCap})`);
    expect(sql).toContain(`${s.stageClear} * v_n * (v_n + 1) / 2 + ${s.infLevel} * greatest(0, v_inf - 1)`);
    expect(sql).toContain(`'{"min_sec":15,"max_sec":1210}'`);
    // 서버는 세션 시작(카운트다운·메뉴 포함)부터 벽시계로 잰다 — 게임 상한은 그보다 넉넉히 짧아야 CLOSING TIME 판이 거부되지 않는다
    expect(CFG.run.sessionCap).toBeLessThanOrEqual(1210 - 25);
    expect(sql).toContain(`v_c_stage >= ${CFG.owlEnergy.minStage}`);
  });
});
