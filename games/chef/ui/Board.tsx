"use client";

// 🍳 게임 화면 조각 — 테이블(손님·주문·인내도) · 접시 · 코드 티켓 · 주방 도구 · 재료 칸 (GDD §19 · §20)
//
// 매 프레임 바뀌는 엔진 상태(g)를 그대로 읽는다. 화면은 index.tsx 가 20Hz 로 다시 그린다.
// 탭은 onClick, 드래그는 onPointerDown → index.tsx 의 드래그 도우미가 처리한다.

import { useTranslations } from "next-intl";
import { Undo2 } from "lucide-react";
import { CFG, INF_STAGE, STAGE_MAX, TOOL_IDS, planOf, type ToolId } from "../config";
import { ITEM, ITEMS, type ItemId } from "../data/items";
import { RECIPE, type RecipeId, type Step, type Token } from "../data/recipes";
import {
  TABLES,
  dishOf,
  nextStep,
  plateComplete,
  unlockedItems,
  type Bug,
  type Game,
  type Hint,
} from "../engine/game";
import { ITEM_KEYS, TOOL_KEY, keyLabel, patienceColor } from "../theme";
import { Art, Badge, BugArt, Decor, DishIcon, PropIcon, ToolIcon, UiIcon, artUrl, type BadgeName, type BugLook, type UiName } from "./art";
import { BugSprite, CustomerSprite, ItemIcon, Ring } from "./parts";

export type DragSrc = { kind: "item"; item: ItemId } | { kind: "slot"; tool: ToolId; slot: number } | { kind: "plate"; i: number };

export type Popup = {
  id: number;
  table: number;
  text: string;
  tone: "good" | "bad" | "info";
  sub?: string;
  /** 글자 앞 아이콘 (코인 · 취소 · 버그 경고) */
  icon?: UiName;
  /** 아래에 붙는 연출 배지 (빠른 서비스 · 콤보 보너스) */
  badges?: BadgeName[];
  /** 낸 요리 — 손님에게 건네지는 그림 */
  dish?: RecipeId;
};

export type BoardHandlers = {
  tapTable: (i: number) => void;
  tapPlate: (i: number) => void;
  tapTool: (tool: ToolId, slot: number) => void;
  tapItem: (item: ItemId) => void;
  undo: () => void;
  trash: () => void;
  drag: (src: DragSrc) => (e: React.PointerEvent) => void;
};

function tableBug(g: Game, i: number): Bug | undefined {
  return g.bugs.find((b) => b.target.kind === "table" && b.target.i === i);
}

function toolBug(g: Game, tool: ToolId): Bug | undefined {
  return g.bugs.find((b) => b.target.kind === "tool" && b.target.tool === tool);
}

function Stars({ n }: { n: number }) {
  return <span className="font-mono text-[9px] tracking-tighter text-neon-soft">{n >= 7 ? "★×7" : "★".repeat(n)}</span>;
}

/* ── 테이블 + 접시 한 열 ───────────────────────────────────────── */

export function TableColumn({
  g,
  i,
  h,
  popups,
  keys,
  hint,
  big,
}: {
  g: Game;
  i: number;
  h: BoardHandlers;
  popups: Popup[];
  keys: boolean;
  hint: Hint;
  /** 화면이 넉넉하면 손님을 크게 */
  big: boolean;
}) {
  const t = useTranslations("hud.chef");
  const c = g.tables[i];
  const bug = tableBug(g, i);
  const landed = !!bug && bug.crawl <= 0;
  const ratio = c ? c.patience / c.max : 0;
  const culprit = g.over && g.culprit === i;
  const mood = !c ? 0 : c.leaving > 0 && c.happy ? 4 : culprit ? 3 : ratio < 0.1 ? 3 : ratio < 0.3 ? 2 : ratio < 0.55 ? 1 : 0;
  const dish = c ? RECIPE[dishOf(c)] : null;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <button
        type="button"
        data-drop={`table:${i}`}
        onClick={() => h.tapTable(i)}
        aria-label={c && dish ? t("tableAria", { n: i + 1, dish: t(`recipes.${dish.id}`) }) : t("tableEmpty")}
        style={{ height: "clamp(116px, 19vh, 176px)" }}
        className={`glass relative flex flex-col items-center justify-end overflow-hidden rounded-tile px-1 pb-3 pt-1 transition-shadow ${
          landed ? "ring-2 ring-alert" : culprit ? "ring-2 ring-alert" : ""
        } ${c && c.leaving > 0 ? "opacity-60" : ""}`}
      >
        <span className="absolute left-1.5 top-1 font-mono text-[10px] text-dim">T{i + 1}</span>
        {c && dish ? (
          <>
            {/* 주문 말풍선 */}
            <div className="absolute right-1 top-1 flex max-w-[70%] flex-col items-end">
              <span className="grid place-items-center rounded-full border border-line-strong bg-panel/80 p-0.5 shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
                <DishIcon id={dish.id} size={big ? 40 : 32} />
              </span>
              {c.order.dishes.length > 1 && (
                <span className="mt-0.5 flex gap-0.5">
                  {c.order.dishes.map((_, k) => (
                    <span key={k} className={`size-1.5 rounded-full ${k < c.order.idx ? "bg-ok" : k === c.order.idx ? "bg-aqua" : "bg-line-strong"}`} />
                  ))}
                </span>
              )}
            </div>
            {/* 테이블 위 조명 */}
            <Decor name="lamps" h={big ? 20 : 16} className="absolute left-1/2 top-0.5 -translate-x-1/2 opacity-80" />
            {/* 손님 + 테이블 (테이블이 다리를 가린다) */}
            <div className={`relative flex flex-col items-center ${c.leaving > 0 ? "-translate-y-2 transition-transform duration-500" : ""}`}>
              <CustomerSprite look={c.look} mood={mood} size={big ? 72 : 56} />
              <Decor name="table" w="92%" h={big ? 34 : 26} className={big ? "-mt-5" : "-mt-4"} />
            </div>
            <p className="mt-0.5 w-full truncate text-center text-[11px] font-bold leading-tight">
              {t(`recipes.${dish.id}`)} <Stars n={dish.stars} />
            </p>
            {c.order.kind !== "single" && (
              <p className="font-mono text-[9px] text-aqua">
                {c.order.kind === "course" ? "FULL STACK" : "×2"} {c.order.idx + 1}/{c.order.dishes.length}
              </p>
            )}
            {/* 인내도 (체력) */}
            <div className="absolute inset-x-1.5 bottom-1 flex items-center gap-0.5">
              <UiIcon name="heart" size={11} className="shrink-0" />
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(0, ratio) * 100}%`, background: patienceColor(ratio), transition: "width 90ms linear" }}
                />
              </div>
            </div>
            {/* 앉자마자 "주문!" */}
            {c.leaving <= 0 && g.t - c.t0 < 1.4 && (
              <Badge name="bubble-order" h={big ? 38 : 30} className="animate-pop absolute left-1/2 top-5 z-10 -translate-x-1/2" />
            )}
            {/* 시간 부족 */}
            {c.leaving <= 0 && !g.over && ratio < 0.3 && (
              <Badge
                name={ratio < 0.12 ? "time-out" : "time-low"}
                h={ratio < 0.12 ? 26 : 22}
                className={`absolute left-1 top-4 ${ratio < 0.12 ? "animate-blink" : ""}`}
                fallback={<span className="absolute left-1/2 top-3 -translate-x-1/2 animate-blink text-xl font-black text-alert">!</span>}
              />
            )}
          </>
        ) : (
          <>
            <Decor name="table" w="80%" h={26} className="mb-4 opacity-40" />
            <p className="mb-1 text-[11px] text-dim">{t("tableEmpty")}</p>
          </>
        )}

        {bug && <BugOverlay bug={bug} look={g.stage >= INF_STAGE ? "gold" : "green"} />}

        {popups.map((p) => (
          <span
            key={p.id}
            className={`pointer-events-none absolute inset-x-0 top-6 z-10 text-center font-mono text-sm font-black animate-[chef-float_1.3s_ease-out_both] ${
              p.tone === "good" ? "text-aqua text-glow-aqua" : p.tone === "bad" ? "text-alert" : "text-neon-soft"
            }`}
          >
            {p.dish && (
              <span className="flex justify-center">
                <DishIcon id={p.dish} size={34} />
              </span>
            )}
            <span className="inline-flex items-center gap-0.5">
              {p.icon && <UiIcon name={p.icon} size={16} />}
              {p.text}
            </span>
            {p.sub && <span className="block text-[10px] font-bold">{p.sub}</span>}
            {p.badges && p.badges.length > 0 && (
              <span className="mt-0.5 flex justify-center gap-0.5">
                {p.badges.map((n) => (
                  <Badge key={n} name={n} h={22} />
                ))}
              </span>
            )}
          </span>
        ))}
      </button>

      <PlateButton g={g} i={i} h={h} keys={keys} hint={hint} />
    </div>
  );
}

function BugOverlay({ bug, look }: { bug: Bug; look: BugLook }) {
  const t = useTranslations("hud.chef");
  if (bug.crawl > 0) {
    // 1초 동안 가장자리에서 기어 들어온다 (경고)
    const k = Math.max(0, Math.min(1, bug.crawl / CFG.bugs.crawl));
    return (
      <span className="pointer-events-none absolute inset-0 z-10">
        <span className="absolute animate-jitter" style={{ left: `${5 + 70 * (1 - k)}%`, bottom: 6, opacity: 0.95 }}>
          <BugArt look={look} size={26} fallback={<BugSprite size={20} />} />
        </span>
        <Badge
          name="bug-alert"
          h={22}
          className="absolute right-1 top-9 animate-blink"
          fallback={<span className="absolute right-1 top-8 animate-blink font-mono text-[10px] font-black text-alert">!</span>}
        />
      </span>
    );
  }
  return (
    <span className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-alert/15">
      <span className="flex flex-col items-center">
        <BugArt look={look} size={46} className="animate-jitter" fallback={<BugSprite size={34} className="animate-jitter" />} />
        <span className="mt-0.5 rounded bg-alert px-1 font-mono text-[10px] font-black text-white">{t("bugTag")}</span>
        <span className="mt-0.5 h-1 w-10 overflow-hidden rounded-full bg-black/30">
          <span className="block h-full bg-alert" style={{ width: `${(bug.life / bug.dur) * 100}%` }} />
        </span>
      </span>
    </span>
  );
}

function TokenIcon({ token, size = 18 }: { token: Token; size?: number }) {
  if (token.startsWith("@")) {
    const tool = token.slice(1) as ToolId;
    return (
      <span className="grid place-items-center rounded-full border border-aqua/50 bg-aqua/10" style={{ width: size, height: size }}>
        <ToolIcon tool={tool} size={size * 0.78} />
      </span>
    );
  }
  return <ItemIcon item={token as ItemId} size={size} />;
}

function PlateButton({ g, i, h, keys, hint }: { g: Game; i: number; h: BoardHandlers; keys: boolean; hint: Hint }) {
  const t = useTranslations("hud.chef");
  const c = g.tables[i];
  const p = g.plates[i];
  const sel = g.selected === i;
  const active = !!c && c.leaving <= 0;
  const done = active && plateComplete(g, i);
  const step = active ? nextStep(g, i) : null;
  const wrong = p.wrongAt >= 0;
  const inTool = p.inTool;
  const toolSlot = inTool ? g.tools[inTool].find((s) => s?.kind === "plate" && s.table === i) : null;
  const glow = hint?.kind === "plate" && hint.i === i;

  let chip: React.ReactNode = null;
  if (!active) chip = null;
  else if (inTool) chip = <span className="text-aqua">{t("plateInTool", { tool: t(`tools.${inTool}`) })}</span>;
  else if (wrong) chip = <span className="text-alert">{t("plateWrong")}</span>;
  else if (done)
    chip = (
      <span className="inline-flex items-center gap-0.5 font-black text-aqua">
        <UiIcon name="ok" size={15} /> ▶ {t("serve")}
      </span>
    );
  else if (step?.kind === "fin")
    chip = (
      <span className="inline-flex items-center gap-0.5 font-bold text-neon-soft">
        ▶ <ToolIcon tool={step.tool} size={14} /> {t(`verbs.${step.verb}`)}
      </span>
    );
  else if (!p.tokens.length) chip = <span className="text-dim">{sel ? t("plateEmpty") : t("plateSelect")}</span>;

  return (
    <button
      type="button"
      data-drop={`plate:${i}`}
      onClick={() => h.tapPlate(i)}
      onPointerDown={active && !inTool ? h.drag({ kind: "plate", i }) : undefined}
      disabled={!active}
      aria-label={t("plateAria", { n: i + 1 })}
      aria-pressed={sel}
      style={{ minHeight: "clamp(68px, 11vh, 110px)" }}
      className={`relative flex touch-none flex-col items-center justify-between rounded-tile border px-1 py-1 transition-all ${
        sel ? "border-neon bg-neon/10 shadow-[0_0_14px_var(--color-neon)]" : "border-line bg-panel/40"
      } ${wrong ? "border-alert!" : done ? "border-aqua!" : ""} ${glow ? "animate-pulse-glow" : ""} disabled:opacity-40`}
    >
      {keys && <span className="absolute left-1 top-0.5 font-mono text-[9px] text-dim">{i + 1}</span>}
      {done && <Badge name="done" h={24} className="animate-pop absolute -right-1 -top-2 z-10" />}
      {/* 접시 그림 위에 재료가 쌓인다 — 만드는 동안 완성 요리가 옅게 비치고, 다 되면 재료가 합쳐져 완성 요리 그림이 된다 */}
      <span className="relative grid w-full flex-1 place-items-center">
        {active && <PropIcon prop="plate" size={60} className="absolute opacity-75" />}
        {active && c && !done && !wrong && (
          <DishIcon id={dishOf(c)} size={50} className="absolute opacity-[0.16] grayscale" />
        )}
        <span
          key={done ? `merge-${p.doneAt}` : "stack"}
          className={`relative flex min-h-[24px] flex-wrap-reverse items-end justify-center gap-px ${
            done ? "animate-[chef-merge_0.42s_ease-in_forwards]" : ""
          }`}
        >
          {p.tokens.map((tok, k) => (
            <span key={k} className={wrong && k >= p.wrongAt ? "rounded ring-1 ring-alert" : ""}>
              <TokenIcon token={tok} size={p.tokens.length > 6 ? 16 : 21} />
            </span>
          ))}
          {inTool && toolSlot && (
            <span className="relative grid size-8 place-items-center">
              <Ring p={toolSlot.t / toolSlot.dur} size={32} width={2.5} />
              <ToolIcon tool={inTool} size={20} />
            </span>
          )}
        </span>
        {done && c && (
          <span key={`dish-${p.doneAt}`} className="absolute grid place-items-center animate-[chef-dish_0.6s_0.25s_ease-out_both]">
            <DishIcon id={dishOf(c)} size={58} className="drop-shadow-[0_0_10px_var(--color-aqua)]" />
            <span className="pointer-events-none absolute -right-2 -top-1 text-sm animate-[chef-float_1.1s_0.3s_ease-out_both]">✨</span>
          </span>
        )}
      </span>
      <span className="w-full truncate text-center text-[10px] leading-tight">{chip}</span>
    </button>
  );
}

/* ── 코드 티켓 ──────────────────────────────────────────────── */

export function stepLabel(t: ReturnType<typeof useTranslations>, s: Step): string {
  if (s.kind === "fin") return t("finStep", { tool: t(`tools.${s.tool}`), verb: t(`verbs.${s.verb}`) });
  return s.label ? t(`labels.${s.label}`) : t(`items.${s.item}`);
}

export function Ticket({ g, i, compact }: { g: Game; i: number; compact: boolean }) {
  const t = useTranslations("hud.chef");
  const c = g.tables[i];
  if (!c) {
    return compact ? (
      <p className="px-2 font-mono text-[11px] text-dim">{t("ticketNone")}</p>
    ) : (
      <div className="glass rounded-tile p-2.5 font-mono text-[11px] text-dim">
        T{i + 1} · {t("ticketNone")}
      </div>
    );
  }
  const r = RECIPE[dishOf(c)];
  const p = g.plates[i];
  const cur = p.tokens.length;
  const sel = g.selected === i;

  const lines = r.steps.map((s, k) => {
    const state = p.wrongAt >= 0 && k === p.wrongAt ? "wrong" : k < cur && (p.wrongAt < 0 || k < p.wrongAt) ? "done" : k === cur && p.wrongAt < 0 ? "now" : "todo";
    const chain = s.kind === "add" ? ITEM[s.item].chain : [];
    return (
      <li
        key={k}
        className={`flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 ${
          state === "now" ? "bg-neon/15 text-ink ring-1 ring-neon" : state === "done" ? "text-dim line-through decoration-1" : state === "wrong" ? "bg-alert/15 text-alert" : "text-mute"
        }`}
      >
        <span className="font-mono text-[9px] text-dim">{String(k + 1).padStart(2, "0")}</span>
        {s.kind === "add" ? <ItemIcon item={s.item} size={18} /> : <ToolIcon tool={s.tool} size={18} />}
        <span className="whitespace-nowrap text-[11px] font-bold">{stepLabel(t, s)}</span>
        {chain.length > 0 && state !== "done" && (
          <span className="inline-flex items-center opacity-85">
            {chain.map((x, n) => (
              <ToolIcon key={n} tool={x} size={13} />
            ))}
          </span>
        )}
        {state === "done" && <span className="text-[10px] text-ok">✓</span>}
      </li>
    );
  });

  const head = (
    <div className="flex items-center gap-1.5">
      <Art src={artUrl.face(c.look)} size={20} className="shrink-0 rounded-full" fallback={<span className="font-mono text-[10px] text-dim">T{i + 1}</span>} />
      <span className="font-mono text-[10px] text-dim">T{i + 1}</span>
      <DishIcon id={r.id} size={24} />
      <span className="truncate text-xs font-black">{t(`recipes.${r.id}`)}</span>
      <Stars n={r.stars} />
      <span className="ml-auto truncate font-mono text-[10px] text-aqua">{r.code}</span>
    </div>
  );

  if (compact) {
    return (
      <div className="min-w-0 flex-1">
        {head}
        <ol className="no-scrollbar mt-1 flex gap-1 overflow-x-auto">{lines}</ol>
        {p.wrongAt >= 0 && <p className="mt-0.5 font-mono text-[10px] text-alert">{t("wrongLine", { n: p.wrongAt + 1 })}</p>}
      </div>
    );
  }
  return (
    <div className={`glass rounded-tile p-2.5 ${sel ? "ring-1 ring-neon" : ""}`}>
      {head}
      <ol className="mt-1.5 flex flex-wrap gap-1">{lines}</ol>
      {p.wrongAt >= 0 && <p className="mt-1 font-mono text-[10px] text-alert">{t("wrongLine", { n: p.wrongAt + 1 })}</p>}
    </div>
  );
}

/* ── 주방 도구 ──────────────────────────────────────────────── */

export function Kitchen({ g, h, keys, hint }: { g: Game; h: BoardHandlers; keys: boolean; hint: Hint }) {
  const t = useTranslations("hud.chef");
  const tools = TOOL_IDS.filter((tool) => g.tools[tool].length > 0);
  return (
    // 칸이 많은 도구가 넓게 — 5도구 × 2칸이 폰 한 줄에 들어가게 (칸 = 둥근 사각, 폭은 나눠 갖는다)
    <div className="grid gap-1" style={{ gridTemplateColumns: tools.map((tool) => `${g.tools[tool].length}fr`).join(" ") }}>
      {tools.map((tool) => {
        const bug = toolBug(g, tool);
        const landed = !!bug && bug.crawl <= 0;
        return (
          <div
            key={tool}
            data-drop={`tool:${tool}`}
            className={`glass relative flex min-w-0 flex-col items-center rounded-tile px-0.5 pb-0.5 pt-0.5 ${landed ? "ring-2 ring-alert" : ""}`}
          >
            {/* 머리줄도 누를 수 있다 — 먼저 다 된 칸을 꺼낸다 (칸이 좁은 폰에서 누를 곳을 넓힌다) */}
            <button
              type="button"
              onClick={() => h.tapTool(tool, -1)}
              className="flex min-h-6 w-full min-w-0 items-center justify-center gap-0.5 text-[10px] font-bold text-mute"
            >
              <ToolIcon tool={tool} size={16} className="shrink-0" />
              <span className="truncate">{t(`tools.${tool}`)}</span>
              {keys && <span className="font-mono text-[9px] text-dim">[{TOOL_KEY[tool]}]</span>}
            </button>
            <div className="mt-0.5 flex w-full gap-0.5">
              {g.tools[tool].map((s, k) => {
                const done = !!s && s.t >= s.dur;
                const takeable = done && s!.kind === "item";
                const glow = hint?.kind === "tool" && hint.tool === tool && hint.slot === k && done;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => h.tapTool(tool, k)}
                    onPointerDown={takeable ? h.drag({ kind: "slot", tool, slot: k }) : undefined}
                    aria-label={t("slotAria", { tool: t(`tools.${tool}`), n: k + 1 })}
                    style={{ height: "clamp(46px, 6.4vh, 58px)" }}
                    className={`relative grid min-w-0 flex-1 touch-none place-items-center rounded-[12px] border ${
                      takeable ? "border-aqua bg-aqua/15 shadow-[0_0_12px_var(--color-aqua)]" : "border-line bg-panel/50"
                    } ${glow ? "animate-pulse-glow" : ""}`}
                  >
                    {/* 칸 바탕 = 그 도구 그림 (비어 있으면 진하게, 무언가 올라가 있으면 옅게) */}
                    <ToolIcon tool={tool} size={36} className={`absolute ${s ? "opacity-30" : "opacity-60"}`} />
                    {s && s.kind === "item" && <ItemIcon item={s.item} size={26} className="relative" />}
                    {s && s.kind === "plate" && (
                      <span className="relative grid place-items-center">
                        {g.tables[s.table] ? <DishIcon id={dishOf(g.tables[s.table]!)} size={26} /> : <PropIcon prop="plate" size={26} />}
                        <span className="absolute -bottom-1 -right-1 rounded bg-panel px-0.5 font-mono text-[9px] font-black">T{s.table + 1}</span>
                      </span>
                    )}
                    {s && !done && <Ring p={s.t / s.dur} size={38} />}
                    {takeable && <span className="absolute -right-0.5 -top-0.5 text-[10px] text-ok">✓</span>}
                  </button>
                );
              })}
            </div>
            {bug &&
              (landed ? (
                <span className="pointer-events-none absolute inset-0 grid place-items-center rounded-tile bg-alert/20">
                  <BugArt look="red" size={36} className="animate-jitter" fallback={<BugSprite size={28} className="animate-jitter" />} />
                </span>
              ) : (
                <span className="pointer-events-none absolute -top-2 right-0 flex items-center">
                  <Badge name="bug-alert" h={16} className="animate-blink" />
                  <BugArt look="red" size={18} className="animate-jitter" fallback={<BugSprite size={16} />} />
                </span>
              ))}
          </div>
        );
      })}
    </div>
  );
}

/* ── 재료 칸 ────────────────────────────────────────────────── */

export function Pantry({
  g,
  h,
  keys,
  hint,
  flash,
  cols,
}: {
  g: Game;
  h: BoardHandlers;
  keys: boolean;
  hint: Hint;
  flash: ItemId | null;
  cols: number;
}) {
  const t = useTranslations("hud.chef");
  const open = new Set(unlockedItems(g));
  const list = ITEMS.map((d, k) => ({ d, key: ITEM_KEYS[k] })).filter((x) => open.has(x.d.id));
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {list.map(({ d, key }) => {
        const glow = (hint?.kind === "item" && hint.item === d.id) || flash === d.id;
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => h.tapItem(d.id)}
            onPointerDown={h.drag({ kind: "item", item: d.id })}
            aria-label={t(`items.${d.id}`)}
            className={`relative flex touch-none flex-col items-center justify-center rounded-tile border border-line px-0.5 py-0.5 transition-transform active:scale-95 ${
              glow ? "border-aqua shadow-[0_0_14px_var(--color-aqua)] animate-pulse-glow" : ""
            }`}
            style={{ minHeight: "clamp(48px, 7.4vh, 70px)", background: `linear-gradient(180deg, ${d.tint}26, ${d.tint}0d)` }}
          >
            <ItemIcon item={d.id} size={28} />
            <span className="w-full truncate text-center text-[9px] font-bold leading-tight text-mute">{t(`items.${d.id}`)}</span>
            {d.chain.length > 0 && (
              <span className="absolute right-0.5 top-0.5 flex">
                {d.chain.map((x) => (
                  <ToolIcon key={x} tool={x} size={12} />
                ))}
              </span>
            )}
            {keys && <span className="absolute left-1 top-0 font-mono text-[8px] text-dim">{keyLabel(key)}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function EditButtons({ h, keys, vertical }: { h: BoardHandlers; keys: boolean; vertical?: boolean }) {
  const t = useTranslations("hud.chef");
  const cls =
    "inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-tile border border-line bg-panel/50 px-2 text-xs font-bold text-mute active:scale-95";
  return (
    <div className={`flex shrink-0 gap-1 ${vertical ? "flex-col" : ""}`}>
      <button type="button" onClick={h.undo} className={cls} aria-label={t("undo")}>
        <Undo2 className="size-4" />
        {(vertical || keys) && <span>{t("undo")}</span>}
        {keys && <span className="font-mono text-[9px] text-dim">⌫</span>}
      </button>
      <button type="button" data-drop="trash" onClick={h.trash} className={cls} aria-label={t("trash")} title={t("trashHint")}>
        <PropIcon prop="trash" size={20} />
        {(vertical || keys) && <span>{t("trash")}</span>}
        {keys && <span className="font-mono text-[9px] text-dim">Del</span>}
      </button>
    </div>
  );
}

/* ── HUD ────────────────────────────────────────────────────── */

export function Hud({ g, score }: { g: Game; score: number }) {
  const t = useTranslations("hud.chef");
  const inf = g.stage >= INF_STAGE;
  const plan = planOf(g.stage);
  const prog = inf ? g.infT / CFG.infinite.levelSec : g.stageServed / plan.orders;
  const sec = Math.floor(g.t);
  return (
    <div className="glass flex items-center gap-2 rounded-tile px-3 py-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <UiIcon name="star" size={26} className="shrink-0" />
        <div className="min-w-0">
          <p className="font-mono text-[9px] tracking-widest text-dim">{t("score")}</p>
          <p className="num text-base font-black leading-tight">{score.toLocaleString()}</p>
        </div>
      </div>
      <div className="mx-auto min-w-0 text-center">
        <p className="font-mono text-xs font-black tracking-wider text-neon-soft">
          {inf ? t("infLevel", { n: g.infLevel }) : t("stage", { n: g.stage, max: STAGE_MAX })}
        </p>
        <div className="mx-auto mt-0.5 h-1 w-24 overflow-hidden rounded-full bg-line">
          <div className="grad-fill h-full" style={{ width: `${Math.min(1, prog) * 100}%` }} />
        </div>
        {!inf && (
          <p className="font-mono text-[9px] text-dim">
            {g.stage === STAGE_MAX && g.stageServed >= plan.orders && g.stats.courses === 0
              ? t("waitCourse")
              : t("ordersLeft", { n: Math.min(g.stageServed, plan.orders), max: plan.orders })}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end">
        {g.combo > 0 ? (
          <p className={`flex items-center gap-0.5 ${g.combo >= 5 ? "animate-pulse-glow" : ""}`}>
            <UiIcon name="combo" size={30} fallback={<span className="num text-sm font-black">{t("combo", { n: g.combo })}</span>} />
            <span className={`num text-sm font-black ${g.combo >= 5 ? "text-aqua text-glow-aqua" : ""}`}>×{g.combo}</span>
          </p>
        ) : (
          <p className="num text-sm font-black leading-tight">—</p>
        )}
        <p className="num flex items-center gap-0.5 text-[10px] text-dim">
          <UiIcon name="timer" size={12} />
          {String(Math.floor(sec / 60)).padStart(2, "0")}:{String(sec % 60).padStart(2, "0")}
        </p>
      </div>
    </div>
  );
}

export { TABLES };
