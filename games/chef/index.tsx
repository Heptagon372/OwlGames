"use client";

// 🍳 아울 레스토랑 (OWL RESTAURANT) — 메뉴 → OPEN! → 영업 → GAME OVER / CLOSING TIME (OWLRESTAURANT_GDD.md Part B)
//
// 화면은 DOM + SVG (GDD §21). 엔진(engine/game.ts)은 고정 타임스텝으로 돌고, 화면은 20Hz 로 다시 그린다.
// 조작 (GDD §20)
//   · 탭: 재료 → 선택된 접시(손질이 필요하면 도구로) · 도구 → 다 된 재료를 다음 도구/접시로 · 접시 → 선택 / 다음 행동
//   · 드래그: 재료·다 된 재료 → 원하는 접시 · 재료 → 도구 · 접시 → 도구(마무리) / 자기 테이블(제출)
//   · 키보드: 접시·다음 행동·도구·되돌리기·비우기·일시정지는 `lib/keybinds.ts` 의 chef 키맵(설정에서 바꾼다,
//     기본 1·2·3 · Space/Enter · Q W E R T · Backspace · Delete · Esc) → 그다음 재료 칸의 고정 글자 키(`ITEM_KEYS`)
//
// 배치 (DECISIONS — 넘기기 금지): 음식·레시피를 슬라이드·가로 스크롤로 보여 주지 않는다. 폰 세로는 테이블 아래에
// 그 주문의 레시피 전체를 아이콘 줄로 펼쳐 두고, PC 가로는 오른쪽에 티켓 세 장을 이름과 함께 펼친다.

import { GameLogo } from "@/components/GameLogo";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BarChart3, BookOpen, Home, Play, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { CFG, STAGE_MAX, TOOL_IDS, type ToolId } from "./config";
import { actionOf, primaryLabel, useKeymap, useKeymapState, type Keymap } from "@/lib/keybinds";
import { ITEMS, type ItemId } from "./data/items";
import {
  CUE,
  TABLES,
  closeShop,
  createGame,
  discardSlot,
  dropOnPlate,
  dropOnTool,
  dropPlate,
  dropSlotOnTool,
  hintFor,
  nextAction,
  select,
  tapItem,
  tapPlate,
  tapTool,
  trash,
  undo,
  unlockedItems,
  update,
  type Game,
  type GameEvent,
} from "./engine/game";
import { buildMeta, rawScore } from "./engine/score";
import { COACH_TARGET, EditButtons, Hud, Kitchen, Pantry, TableColumn, Ticket, type BoardHandlers, type DragSrc, type KeyHints, type Popup } from "./ui/Board";
import { BannerView, Glitch, Toast, type Banner } from "./ui/Overlays";
import { ItemIcon } from "./ui/parts";
import { ITEM_KEYS } from "./theme";
import { BugArt, Decor, PropIcon, ToolIcon, UiIcon, preloadArt, type BadgeName, type DecorName, type UiName } from "./ui/art";
import { startFixedLoop } from "@/games/flight/engine/loop";
import { fetchChefRecord, type ChefRecord } from "@/lib/client-queries";
import { playMusic, playSfx, stopMusic } from "@/lib/sound";

/** 영업 중 배경음악 (사용자 제공 "Diner Arcade Groove" — public/assets/CREDITS.md). 메뉴에서는 조용히 */
const CHEF_BGM = "/assets/chef-bgm/diner-arcade-groove.mp3";
import { PauseButton, PauseMenu, usePause } from "../core/pause";
import { CoachHand, useTargetPoint } from "../core/coach";
import type { GameComponentProps } from "../core/types";

function isTouch(): boolean {
  if (typeof window === "undefined") return false;
  return navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;
}

export function ChefGame({ onEnd }: GameComponentProps) {
  const [started, setStarted] = useState(false);
  // 서버 세션은 이미 시작됐다 — 메뉴에 머문 시간도 세션 시간이다 (벽시계 상한의 기준점)
  const [t0] = useState(() => (typeof performance !== "undefined" ? performance.now() : 0));
  if (!started) return <Menu onStart={() => setStarted(true)} />;
  return <ChefRun onEnd={onEnd} t0={t0} />;
}

/* ── 메뉴 ───────────────────────────────────────────────────── */

function Menu({ onStart }: { onStart: () => void }) {
  const t = useTranslations("hud.chef.menu");
  const [panel, setPanel] = useState<"none" | "record" | "how">("none");
  const [rec, setRec] = useState<ChefRecord | null>(null);
  const km = useKeymapState("chef");
  const L = (a: keyof Keymap<"chef">) => primaryLabel(km, a) || "—";

  useEffect(() => {
    preloadArt();
    fetchChefRecord()
      .then(setRec)
      .catch(() => setRec(null));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("button")) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onStart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStart]);

  const tab = (id: "record" | "how") => setPanel((p) => (p === id ? "none" : id));
  const sub =
    "glass inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-bold transition-transform active:scale-95";
  const stageText = (r: ChefRecord) => (r.stage > STAGE_MAX ? `∞ LV ${Math.max(1, r.inf)}` : r.stage > 0 ? `STAGE ${r.stage}` : "-");

  return (
    <div className="relative grid h-full place-items-center overflow-y-auto overflow-x-hidden p-5">
      <MenuScene />
      <div className="card glow-iris relative w-full max-w-sm rounded-card p-6 text-center">
        {/* 로비 · 설정 */}
        <div className="absolute right-3 top-3 flex gap-1.5">
          <Link href="/lobby" aria-label={t("home")} className="glass grid size-11 place-items-center rounded-full active:scale-95">
            <UiIcon name="home" size={26} fallback={<Home className="size-5" />} />
          </Link>
          <Link href="/settings" aria-label={t("settings")} className="glass grid size-11 place-items-center rounded-full active:scale-95">
            <UiIcon name="gear" size={26} fallback={<Settings className="size-5" />} />
          </Link>
        </div>
        <GameLogo game="chef" alt="OWL RESTAURANT" className="mx-auto mt-6 h-44 w-full" />
        <p className="mt-3 text-sm text-mute">{t("tagline")}</p>

        <button
          type="button"
          onClick={onStart}
          className="grad-fill glow-iris mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full text-lg font-black text-white transition-transform active:scale-95"
        >
          <UiIcon name="play" size={30} fallback={<Play className="size-5" />} />
          {t("play")}
        </button>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => tab("record")} aria-pressed={panel === "record"} className={sub}>
            <UiIcon name="coin" size={22} fallback={<BarChart3 className="size-4 text-aqua" />} />
            {t("record")}
          </button>
          <button type="button" onClick={() => tab("how")} aria-pressed={panel === "how"} className={sub}>
            <UiIcon name="order" size={22} fallback={<BookOpen className="size-4 text-magenta" />} />
            {t("how")}
          </button>
        </div>

        {panel === "record" && (
          <dl className="glass mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-tile p-4 text-left text-sm">
            {(
              [
                [t("best"), rec ? rec.best.toLocaleString() : "-"],
                [t("bestStage"), rec ? stageText(rec) : "-"],
                [t("maxCombo"), rec ? String(rec.combo) : "-"],
                [t("games"), rec ? String(rec.games) : "-"],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-2">
                <dt className="text-mute">{k}</dt>
                <dd className="num font-bold">{v}</dd>
              </div>
            ))}
          </dl>
        )}

        {panel === "how" && (
          <div className="glass mt-3 grid gap-2 rounded-tile p-4 text-left text-[13px] leading-relaxed">
            {(t.raw("rules") as string[]).map((r) => (
              <p key={r} className="flex gap-2 text-mute">
                <span className="text-aqua">▸</span>
                <span>{r}</span>
              </p>
            ))}
            <p className="mt-1 font-bold">{t("controlsTitle")}</p>
            <p className="text-mute">{t("controlsTouch")}</p>
            <p className="hidden text-mute pc:block">
              {t("controlsKeysMap", {
                plates: [L("plate1"), L("plate2"), L("plate3")].join("·"),
                next: L("next"),
                tools: TOOL_IDS.map((tool) => L(tool)).join(" "),
                undo: L("undo"),
                trash: L("trash"),
                pause: L("pause"),
              })}
            </p>
          </div>
        )}
        <p className="mt-4 text-[11px] text-dim">{t("hint")}</p>
      </div>
    </div>
  );
}

/** 메뉴 뒤 식당 풍경 — 시트의 장식 요소를 가장자리에 깐다 (가운데 카드를 가리지 않게 옅게) */
function MenuScene() {
  const top: [DecorName, number][] = [
    ["flags", 58],
    ["window", 78],
    ["lamps", 64],
    ["neon", 66],
    ["menu-board", 78],
    ["hello", 58],
  ];
  const bottom: [DecorName, number][] = [
    ["plant", 74],
    ["sofa", 82],
    ["counter", 80],
    ["computer", 70],
    ["chair", 78],
    ["server", 86],
    ["rug", 44],
    ["rack", 84],
    ["cabinet", 88],
    ["code-board", 64],
    ["plant-shelf", 70],
    ["trash", 54],
    ["plant", 74],
  ];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 px-2 opacity-55">
        {top.map(([n, h], k) => (
          <Decor key={k} name={n} h={h} className="shrink-0" />
        ))}
      </div>
      <Decor name="banner" h={170} className="absolute left-3 top-1/3 hidden opacity-60 sm:block" />
      <Decor name="banner" h={170} className="absolute right-3 top-1/3 hidden opacity-60 sm:block" />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 px-2 opacity-55">
        {bottom.map(([n, h], k) => (
          <Decor key={k} name={n} h={h} className="shrink-0" />
        ))}
      </div>
    </div>
  );
}

/* ── 영업 ───────────────────────────────────────────────────── */

type Drag = { src: DragSrc; id: number; x0: number; y0: number; active: boolean };

function ChefRun({ onEnd, t0 }: { onEnd: GameComponentProps["onEnd"]; t0: number }) {
  const t = useTranslations("hud.chef");
  const gameRef = useRef<Game | null>(null);
  if (!gameRef.current) gameRef.current = createGame(Date.now());
  const g = gameRef.current;

  const [, setFrame] = useState(0);
  const [touch] = useState(isTouch);
  const [size, setSize] = useState({ w: 400, h: 700 });
  const [popups, setPopups] = useState<(Popup & { until: number })[]>([]);
  const [banner, setBanner] = useState<(Banner & { until: number }) | null>(null);
  // 배너는 줄을 선다 — FULL STACK · CLEAN BUILD 뒤에 STAGE 카드가 같은 틱에 와도 덮어쓰지 않게
  const bannerQ = useRef<{ b: Banner; dur: number }[]>([]);
  const bannerNow = useRef<(Banner & { until: number }) | null>(null);
  const loopRef = useRef<{ setPaused: (p: boolean) => void } | null>(null);
  // 일시정지 — 공통 메뉴(games/core/pause.tsx), 한 판에 1분까지. 탭이 가려진 동안은 따로 멈춘다(시간 안 깎임)
  const pause = usePause((frozen) => loopRef.current?.setPaused(frozen || document.hidden));
  const pausedRef = pause.openRef;
  const togglePause = pause.toggle;
  const [toast, setToast] = useState<{ text: string; until: number; icon?: UiName } | null>(null);
  const [flash, setFlash] = useState<{ item: ItemId; until: number } | null>(null);
  const [opening, setOpening] = useState(true);
  const [ghost, setGhost] = useState<{ src: DragSrc; x: number; y: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const suppress = useRef(false);
  const seq = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  // 키 입력은 ref(바로 반영), 화면의 키 안내는 상태(다시 그린다)
  const keymap = useKeymap("chef");
  const km = useKeymapState("chef");

  /* 사건 → 화면 문구 */
  const onEvents = useCallback(
    (events: GameEvent[]) => {
      const now = performance.now();
      const pops: (Popup & { until: number })[] = [];
      for (const e of events) {
        const id = ++seq.current;
        if (e.type === "serve") {
          const tags = [e.perfect && "PERFECT", e.hotfix && "HOTFIX", e.combo >= 2 && t("combo", { n: e.combo })].filter(Boolean);
          const badges: BadgeName[] = [];
          if (e.fast) badges.push("fast");
          if (e.combo >= 5) badges.push("combo-bonus");
          pops.push({
            id,
            table: e.table,
            text: `+${e.score.toLocaleString()}`,
            sub: e.next ? `${tags.join(" · ")} ▶ NEXT` : tags.join(" · "),
            icon: "coin",
            badges,
            dish: e.dish,
            tone: "good",
            until: now + 1300,
          });
        } else if (e.type === "reject") {
          pops.push({
            id,
            table: e.table,
            text: e.reason === "bug" ? "BUG REPORT" : "CompileError",
            sub: t(e.reason === "bug" ? "rejectBug" : "rejectCompile"),
            icon: e.reason === "bug" ? "bugwarn" : "cancel",
            tone: "bad",
            until: now + 1500,
          });
        } else if (e.type === "stage") {
          bannerQ.current.push({ b: { id, kind: "stage", stage: e.stage, recipes: e.recipes, tools: e.tools }, dur: e.recipes.length || e.tools.length ? 3200 : 1500 });
        } else if (e.type === "inf") {
          bannerQ.current.push({ b: { id, kind: "inf", level: e.level }, dur: 1500 });
        } else if (e.type === "clean") {
          bannerQ.current.push({ b: { id, kind: "big", text: `CLEAN BUILD ×${e.n}`, sub: `+${e.score.toLocaleString()}`, tone: "good", badge: "multi" }, dur: 1100 });
        } else if (e.type === "fullstack") {
          bannerQ.current.push({ b: { id, kind: "big", text: "FULL STACK!", sub: `+${e.score.toLocaleString()}`, tone: "good" }, dur: 1300 });
        } else if (e.type === "blocked") {
          setToast({ text: t(`blocked.${e.reason}`), icon: e.reason === "bug" ? "bugwarn" : "warn", until: now + 1300 });
        } else if (e.type === "need") {
          setFlash({ item: e.item, until: now + 900 });
          setToast({ text: t("need", { item: t(`items.${e.item}`) }), icon: "order", until: now + 1100 });
        } else if (e.type === "bug") {
          if (e.target.kind === "system")
            bannerQ.current.push({ b: { id, kind: "big", text: "⚠ SYSTEM UNSTABLE", sub: t("systemSub"), tone: "warn", badge: "bug-alert" }, dur: 1500 });
          else setToast({ text: t(e.target.kind === "table" ? "bugTable" : "bugTool", { n: e.target.kind === "table" ? e.target.i + 1 : 0, tool: e.target.kind === "tool" ? t(`tools.${e.target.tool}`) : "" }), icon: "bugwarn", until: now + 1400 });
        }
      }
      if (pops.length) setPopups((ps) => [...ps.filter((p) => p.until > now), ...pops]);
    },
    [t],
  );

  /* 배경음악 — 영업 시작에 켜고, 화면을 떠나면 끈다 (영업 종료는 루프에서) */
  useEffect(() => {
    playMusic(CHEF_BGM, 1.0);
    return () => stopMusic(0.8);
  }, []);

  /* 루프 */
  useEffect(() => {
    const device: "mobile" | "desktop" = touch ? "mobile" : "desktop";
    let ended = false;
    let musicOff = false;
    let lastPaint = 0;
    const loop = startFixedLoop(
      (dt) => {
        update(g, dt);
        if (g.over && !musicOff) {
          musicOff = true;
          stopMusic(1.2);
        }
        if (g.over && !ended && g.overT >= CFG.run.endDelay) {
          ended = true;
          loop.stop();
          onEnd(rawScore(g), buildMeta(g, device));
        }
      },
      () => {
        const now = performance.now();
        // 서버 세션 상한은 벽시계다 — 창을 가려 게임 시간이 멈춰 있었어도 넘기면 영업 종료
        if (!g.over && (now - t0) / 1000 >= CFG.run.sessionCap) closeShop(g);
        playCues(g);
        if (g.events.length) {
          const ev = g.events.splice(0, g.events.length);
          onEvents(ev);
        }
        const cur = bannerNow.current;
        if (bannerQ.current.length && (!cur || cur.until <= now)) {
          const next = bannerQ.current.shift()!;
          bannerNow.current = { ...next.b, until: now + next.dur };
          setBanner(bannerNow.current);
        }
        if (now - lastPaint >= 50) {
          lastPaint = now;
          setFrame((f) => (f + 1) & 0xffff);
        }
      },
    );
    loopRef.current = loop;
    const onVis = () => loop.setPaused(document.hidden || pause.frozenRef.current);
    document.addEventListener("visibilitychange", onVis);
    const open = setTimeout(() => setOpening(false), 1100);
    return () => {
      ended = true;
      loop.stop();
      loopRef.current = null;
      clearTimeout(open);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onEnd]);

  /* 화면 크기 → 배치 (게임 영역 크기를 직접 본다 — 창 크기 이벤트가 없는 변화도 잡는다) */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* 드래그 & 드롭 */
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      if (!d.active && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 10) d.active = true;
      if (d.active) setGhost({ src: d.src, x: e.clientX, y: e.clientY });
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      drag.current = null;
      if (!d.active) return;
      setGhost(null);
      suppress.current = true;
      setTimeout(() => (suppress.current = false), 0);
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-drop]");
      const target = el?.getAttribute("data-drop");
      if (target) handleDrop(g, d.src, target);
    };
    const cancel = () => {
      drag.current = null;
      setGhost(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [g]);

  /* 키보드 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const act = actionOf(keymap.current, e.code);
      if (act === "pause") {
        e.preventDefault();
        if (!e.repeat && !g.over) togglePause();
        return;
      }
      // 누르고 있으면 브라우저가 keydown 을 되풀이한다 — 재료가 여러 개 올라가거나 제출이 반복되지 않게
      if (e.repeat || pausedRef.current) return;
      if (e.ctrlKey || e.metaKey || e.altKey) {
        if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") {
          e.preventDefault();
          undo(g);
        }
        return;
      }
      if (act === "plate1" || act === "plate2" || act === "plate3") tapPlate(g, Number(act.slice(5)) - 1);
      else if (act === "next" || (!act && e.code === "NumpadEnter")) {
        if (g.selected >= 0) nextAction(g, g.selected);
      } else if (act === "undo") undo(g);
      else if (act === "trash") trash(g);
      else if (act && (TOOL_IDS as readonly string[]).includes(act)) tapTool(g, act as ToolId);
      else {
        // 동작 키가 아니면 재료 칸의 고정 글자 키
        const k = (ITEM_KEYS as readonly string[]).indexOf(e.code);
        if (k < 0 || k >= ITEMS.length) return;
        const item = ITEMS[k].id;
        if (!unlockedItems(g).includes(item)) return;
        tapItem(g, item);
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [g, keymap, pausedRef, togglePause]);

  const guard = (fn: () => void) => () => {
    if (suppress.current || pausedRef.current) return;
    fn();
  };
  const h: BoardHandlers = {
    // 테이블 탭 = 그 접시 탭 (선택 → 다음 행동)
    tapTable: (i) => guard(() => tapPlate(g, i))(),
    tapPlate: (i) => guard(() => tapPlate(g, i))(),
    tapTool: (tool, slot) => guard(() => tapTool(g, tool, slot))(),
    tapItem: (item) => guard(() => tapItem(g, item))(),
    undo: () => guard(() => undo(g))(),
    trash: () => guard(() => trash(g))(),
    drag: (src) => (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      drag.current = { src, id: e.pointerId, x0: e.clientX, y0: e.clientY, active: false };
    },
  };

  // 만료된 문구 걷어 내기
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  const livePops = popups.filter((p) => p.until > now);
  const liveBanner = banner && banner.until > now ? banner : null;
  const liveToast = toast && toast.until > now ? toast : null;
  const liveFlash = flash && flash.until > now ? flash.item : null;

  const wide = size.w >= 900 && size.w > size.h;
  // 키 안내 — 설정에서 바꾼 키가 그대로 보인다. PC(마우스·키보드)에서만 보이는 건 CSS `pc:` 변형이 맡는다
  const keys: KeyHints = {
    plate: [primaryLabel(km, "plate1"), primaryLabel(km, "plate2"), primaryLabel(km, "plate3")],
    tool: { board: primaryLabel(km, "board"), pan: primaryLabel(km, "pan"), pot: primaryLabel(km, "pot"), oven: primaryLabel(km, "oven"), mixer: primaryLabel(km, "mixer") },
    next: primaryLabel(km, "next"),
    undo: primaryLabel(km, "undo"),
    trash: primaryLabel(km, "trash"),
  };
  // 선택된 접시의 "다음에 누를 곳" — 늘 표시한다 (튜토리얼 단계에서는 반짝임까지, ui/Board.tsx 의 guideCls)
  const hint = g.selected >= 0 && !g.over ? hintFor(g, g.selected) : null;
  const score = rawScore(g);
  // 첫 조작 안내 손가락 — 튜토리얼 단계(CFG.run.tutorialUntil)까지 반짝이는 "다음에 누를 곳"을 탭해 보인다
  const coachLive = !!hint && g.stage <= CFG.run.tutorialUntil && !opening && !pause.open && !ghost;
  const coachAt = useTargetPoint(wrapRef, `.${COACH_TARGET}`, coachLive);
  // 재료 칸 — 폰도 7칸(360px 폭에서도 한 칸 ≥ 44px)으로 줄 수를 줄인다
  const cols = wide ? 8 : size.w >= 356 ? 7 : 6;

  const tables = (
    <div className="flex gap-1.5">
      {Array.from({ length: TABLES }, (_, i) => (
        <TableColumn
          key={i}
          g={g}
          i={i}
          h={h}
          popups={livePops.filter((p) => p.table === i)}
          keys={keys}
          hint={hint}
          big={size.h > 640}
          ticket={!wide}
        />
      ))}
    </div>
  );

  const over = g.over ? (
    <Glitch
      closing={g.end === "closing"}
      lines={[
        `FATAL ERROR: Customer#${String(g.tables[g.culprit]?.id ?? 0).padStart(2, "0")}.patience underflow`,
        `    at Table${g.culprit + 1}.serve (restaurant.ts:${40 + g.stats.served})`,
        `    at Kitchen.rush (owl.ts:${g.stage})`,
        "Segmentation fault (core dumped)",
      ]}
    />
  ) : null;

  return (
    <div
      ref={wrapRef}
      className={`relative h-full w-full select-none overflow-y-auto overflow-x-hidden ${g.over && g.end === "patience" ? "animate-[chef-glitch_0.14s_steps(2)_6]" : ""}`}
      style={{ touchAction: "manipulation" }}
    >
      {wide ? (
        <div className="mx-auto grid h-full max-w-[1200px] grid-cols-[minmax(0,1fr)_320px] gap-3 p-3">
          <div className="flex min-h-0 flex-col gap-2.5">
            <Hud g={g} score={score} action={!g.over && <PauseButton ctl={pause} className="-mr-1.5 shrink-0" />} />
            {tables}
            <Kitchen g={g} h={h} keys={keys} hint={hint} />
            <Pantry g={g} h={h} keys={keys} hint={hint} flash={liveFlash} cols={cols} />
          </div>
          <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
            <p className="flex items-center gap-1.5 font-mono text-[11px] tracking-widest text-dim">
              <UiIcon name="order" size={18} />
              {t("tickets")}
            </p>
            {Array.from({ length: TABLES }, (_, i) => (
              <button key={i} type="button" className="text-left" onClick={() => h.tapTable(i)}>
                <Ticket g={g} i={i} />
              </button>
            ))}
            <EditButtons g={g} h={h} keys={keys} hint={hint} />
            {/* 넓은 화면 — 티켓 아래 빈자리에 식당 장식 */}
            <div className="mt-auto flex items-end justify-center gap-3 pt-2 opacity-80" aria-hidden>
              <Decor name="neon" h={64} />
              <Decor name="hello" h={56} />
              <Decor name="plant" h={60} />
            </div>
          </div>
        </div>
      ) : (
        // 폰 세로 — 위에서 아래로 한 화면: HUD → 테이블(손님 · 레시피 줄 · 접시) → 도구 → 재료(+되돌리기·비우기)
        <div className="mx-auto flex min-h-full max-w-[560px] flex-col gap-2 p-2">
          <Hud g={g} score={score} action={!g.over && <PauseButton ctl={pause} className="-mr-1.5 shrink-0" />} />
          {tables}
          <Kitchen g={g} h={h} keys={keys} hint={hint} />
          <Pantry g={g} h={h} keys={keys} hint={hint} flash={liveFlash} cols={cols} edit />
        </div>
      )}

      {opening && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center">
          <div className="flex flex-col items-center">
            <Decor name="sign" h={110} className="animate-pop" />
            <p className="animate-pop grad-text font-mono text-6xl font-black tracking-[0.2em]">OPEN!</p>
          </div>
        </div>
      )}
      {coachLive && hint && coachAt && (
        <CoachHand
          at={coachAt}
          gesture="tap"
          label={t(`coach.${hint.kind}`)}
          labelAt={hint.kind === "item" || hint.kind === "undo" ? "above" : "below"}
          labelAlign={coachAt.x < 90 ? "start" : coachAt.x > size.w - 90 ? "end" : "center"}
          size={72}
        />
      )}
      {liveBanner && !g.over && <BannerView b={liveBanner} />}
      {liveToast && !g.over && <Toast text={liveToast.text} icon={liveToast.icon} />}
      {/* SYSTEM BUG — 앉아 있는 동안 식당 한가운데 글리치 버그 */}
      {g.bugs.some((b) => b.target.kind === "system" && b.crawl <= 0) && !g.over && (
        <div className="pointer-events-none absolute inset-x-0 top-[14%] z-20 flex flex-col items-center">
          <BugArt look="blue" size={120} className="animate-jitter" fallback={<span className="text-6xl">🐛</span>} />
          <p className="mt-1 animate-blink rounded bg-alert px-2 font-mono text-sm font-black text-white">SYSTEM BUG</p>
        </div>
      )}
      {ghost && (
        <div className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]" style={{ left: ghost.x, top: ghost.y }}>
          <GhostIcon g={g} src={ghost.src} />
        </div>
      )}
      {!g.over && <PauseMenu ctl={pause} />}
      {over}
    </div>
  );
}

function GhostIcon({ g, src }: { g: Game; src: DragSrc }) {
  if (src.kind === "item") return <ItemIcon item={src.item} size={40} />;
  if (src.kind === "slot") {
    const s = g.tools[src.tool][src.slot];
    return s?.kind === "item" ? <ItemIcon item={s.item} size={44} /> : <ToolIcon tool={src.tool} size={44} />;
  }
  // 접시를 끌면 트레이에 얹어 나른다
  return (
    <span className="relative grid place-items-center">
      <PropIcon prop="tray" size={84} />
      <PropIcon prop="plate" size={50} className="absolute -top-1" />
    </span>
  );
}

/** 드롭 대상 문자열(`plate:1` · `tool:pan` · `table:2` · `trash`) → 엔진 행동 */
function handleDrop(g: Game, src: DragSrc, target: string): void {
  const [kind, key] = target.split(":");
  if (kind === "plate" || kind === "table") {
    const i = Number(key);
    if (src.kind === "item") dropOnPlate(g, { item: src.item }, i);
    else if (src.kind === "slot") dropOnPlate(g, { tool: src.tool, slot: src.slot }, i);
    // 접시 → 테이블: 자기 테이블이면 제출, 남의 테이블(또는 남의 접시)이면 알려 준다. 제 접시 위에 놓으면 취소
    else if (kind === "table" || i !== src.i) dropPlate(g, src.i, { table: i });
  } else if (kind === "tool") {
    const tool = key as ToolId;
    if (src.kind === "item") dropOnTool(g, src.item, tool);
    else if (src.kind === "plate") dropPlate(g, src.i, { tool });
    else dropSlotOnTool(g, src.tool, src.slot, tool);
  } else if (kind === "trash") {
    // 도구 칸 재료 버리기 · 접시 비우기
    if (src.kind === "slot") discardSlot(g, src.tool, src.slot);
    else if (src.kind === "plate" && select(g, src.i)) trash(g);
  }
}

/* ── 효과음 (엔진 CUE → lib/sound) ─────────────────────────────── */

function playCues(g: Game): void {
  const c = g.cues;
  if (!c) return;
  g.cues = 0;
  if (c & CUE.OVER) {
    playSfx("glitch");
    return;
  }
  if (c & CUE.FULLSTACK) playSfx("legend");
  else if (c & CUE.STAGE) playSfx("level");
  if (c & CUE.REJECT) playSfx("fail");
  else if (c & CUE.SERVE) playSfx("serve", c & CUE.COMBO ? 1 + Math.min(10, g.combo - 4) * 0.05 : 1);
  if (c & CUE.BUG) playSfx("bug");
  if (c & CUE.WARN) playSfx("alarm");
  if (c & CUE.DING) playSfx("ding");
  if (c & CUE.CHOP) playSfx("chop");
  if (c & CUE.SIZZLE) playSfx("sizzle");
  if (c & CUE.SEAT) playSfx("near");
  if (c & CUE.TAP) playSfx("tap");
  if (c & CUE.BLOCK) playSfx("lock");
}
