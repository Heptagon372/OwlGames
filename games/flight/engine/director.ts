// 🎬 디렉터 — 2.0 의 새 요소를 "세트피스"(코드로 만드는 특수 청크)로 끼워 넣는다.
//
// 원칙
// - JSON 청크(P0~P4)는 그대로 두고, 단계가 바뀌면 그 단계의 새 요소를 담은 세트피스가 **첫 청크로 반드시** 나온다.
//   이후에는 풀린 세트피스가 확률로 섞인다(`setPieceChance`).
// - 세트피스는 자기 구간을 통째로 차지한다 → 레이저·중력 반전이 JSON 장애물과 겹쳐 "통과 불가"가 되지 않는다.
// - 타이밍은 청크의 기준 속도(sc, px/s)로 잰다. 1초 = sc px.
// - 경고 없는 즉사기는 없다: 레이저·미사일은 즉사가 아니라 에너지 피해이고, 전부 경고선이 먼저 뜬다.
import { CFG, COLOR_ORDER, FINAL_STAGE, type Color, type StageKey } from "../config";
import type { Chunk, Entity, ItemKind, TriggerEvent } from "../types";
import { stageKey } from "./phases";

const H = CFG.view.h;

export type SetPieceKind =
  | "laser"
  | "beams"
  | "barrage"
  | "movers"
  | "wave"
  | "flip"
  | "chain"
  | "storm"
  | "missileRun"
  | "gravityChaos"
  | "featherRain"
  | "laserEvent"
  | "golden";

/** 세트피스가 아니라 다음 JSON 청크 입구에 트리거로 얹는 이벤트 */
export type OverlayKind = "storm" | "phantomWorld" | "turbo" | "colorChaos" | "glitch";

export type Plan =
  | { k: "set"; kind: SetPieceKind; opts?: SetOpts }
  | { k: "json"; tag?: "narrow" | "gate" | "item" }
  | { k: "overlay"; ev: OverlayKind };

export type SetOpts = { n?: number; mode?: "same" | "cycle" | "random"; glitch?: boolean };

/** 단계에 들어설 때 반드시 보여주는 소개 (앞에서부터 차례로) */
export function introPlans(stage: number): Plan[] {
  const key: StageKey | "infinite" = stageKey(stage);
  switch (key) {
    case "color":
      return [{ k: "set", kind: "chain", opts: { n: 3, mode: "same" } }];
    case "size":
      return [{ k: "json", tag: "narrow" }];
    case "laser":
      return [{ k: "set", kind: "laser" }];
    case "moving":
      return [{ k: "set", kind: "movers" }];
    case "wave":
      return [{ k: "set", kind: "wave" }, { k: "set", kind: "flip" }];
    case "power":
      return [{ k: "set", kind: "chain", opts: { n: 10, mode: "cycle" } }];
    case "storm":
      return [{ k: "set", kind: "storm" }];
    case "missile":
      return [{ k: "set", kind: "missileRun" }];
    case "turbo":
      return [{ k: "overlay", ev: "turbo" }];
    case "glitch":
      return [{ k: "set", kind: "chain", opts: { n: 6, mode: "random", glitch: true } }];
    case "barrage":
      return [{ k: "set", kind: "barrage" }];
    case "chaos":
      return [{ k: "overlay", ev: "colorChaos" }, { k: "set", kind: "gravityChaos" }, { k: "overlay", ev: "glitch" }];
    case "final":
      return [{ k: "set", kind: "chain", opts: { n: 8, mode: "random", glitch: true } }, { k: "set", kind: "barrage" }];
    case "infinite":
      return stage === FINAL_STAGE + 1 ? [{ k: "set", kind: "storm" }] : [];
    default:
      return [];
  }
}

/** 이 단계에서 무작위로 섞일 수 있는 세트피스 */
export function setPiecePool(stage: number): SetPieceKind[] {
  const pool: SetPieceKind[] = [];
  if (stage >= 5) pool.push("laser", "beams");
  if (stage >= 6) pool.push("movers");
  if (stage >= 7) pool.push("wave", "flip");
  if (stage >= 8) pool.push("chain");
  if (stage >= 9) pool.push("storm");
  if (stage >= 10) pool.push("missileRun");
  if (stage >= 13) pool.push("barrage");
  if (stage >= 14) pool.push("gravityChaos");
  return pool;
}

/** 이 단계에서 일어날 수 있는 랜덤 이벤트 (2.0 §20) */
export function eventPool(stage: number): Plan[] {
  if (stage < CFG.events.fromStage) return [];
  const pool: Plan[] = [
    { k: "set", kind: "featherRain" },
    { k: "set", kind: "laserEvent" },
    { k: "set", kind: "golden" },
    { k: "overlay", ev: "storm" },
    { k: "overlay", ev: "phantomWorld" },
  ];
  if (stage >= 11) pool.push({ k: "overlay", ev: "turbo" });
  if (stage >= 14) pool.push({ k: "overlay", ev: "colorChaos" }, { k: "overlay", ev: "glitch" });
  return pool;
}

export function overlayEvent(ev: OverlayKind): TriggerEvent {
  return { k: ev };
}

/* ───────────────────────── 세트피스 빌더 ───────────────────────── */

type Ctx = { stage: number; sc: number; rand: () => number; chainId: number };

const OPEN = (id: string, width: number, entities: Entity[]): Chunk => ({
  id,
  width: Math.round(width),
  phase: 0,
  difficulty: 3,
  tags: ["set"],
  entryY: H / 2,
  exitY: H / 2,
  entities,
});

function between(rand: () => number, a: number, b: number): number {
  return a + (b - a) * rand();
}

function pickColor(rand: () => number, not?: Color): Color {
  const pool = not ? COLOR_ORDER.filter((c) => c !== not) : COLOR_ORDER;
  return pool[Math.floor(rand() * pool.length)];
}

function item(x: number, y: number, kind: ItemKind): Entity {
  return { t: "item", x: Math.round(x), y: Math.round(y), kind };
}

/** 아이템 폭풍 가중치 — 흔함 → 희귀 → 전설 */
function stormItem(rand: () => number, stage: number): ItemKind {
  const r = rand();
  if (stage >= 9 && r < 0.035) return (["rage", "phantom", "crown"] as const)[Math.floor(rand() * 3)];
  if (r < 0.12) return (["magnet", "double", "shield", "bigFeather"] as const)[Math.floor(rand() * 4)];
  if (r < 0.45) return "feather";
  if (r < 0.75) return "star";
  return "gem";
}

export function buildSetPiece(kind: SetPieceKind, ctx: Ctx, opts: SetOpts = {}): Chunk {
  const { sc, rand, stage } = ctx;
  const id = `set-${kind}`;
  switch (kind) {
    case "laser": {
      // 입구에서 경고 → 발사. 구간은 비워 두고, 위험한 자리에 보상을 둔다
      const r = rand();
      const pattern = stage >= 9 && r < 0.3 ? "cross" : r < 0.55 ? "single" : r < 0.8 ? "double" : "diag";
      const ys: number[] = [];
      if (pattern === "single") ys.push(Math.round(between(rand, 110, 430)));
      if (pattern === "double") ys.push(Math.round(between(rand, 80, 190)), Math.round(between(rand, 350, 460)));
      if (pattern === "diag" || pattern === "cross") {
        const down = rand() < 0.5;
        ys.push(down ? 60 : 480, down ? 480 : 60);
        if (pattern === "cross") ys.push(down ? 430 : 110);
      }
      const width = sc * 3.4;
      const ents: Entity[] = [{ t: "trigger", x: 0, ev: { k: "laser", pattern, ys } }];
      // 레이저를 피한 자리에 별 두 개 (위험 = 보상)
      const safe = pattern === "single" ? (ys[0] > H / 2 ? ys[0] - 110 : ys[0] + 110) : H / 2;
      ents.push(item(sc * 1.6, safe, "star"), item(sc * 2.3, safe, "feather"));
      return OPEN(id, width, ents);
    }
    case "beams": {
      // 세로 레이저 기둥 — 위/아래를 번갈아 막는다 (│ 패턴)
      const n = stage >= 12 ? 3 : 2;
      const gap = sc * 1.15;
      const ents: Entity[] = [];
      let top = rand() < 0.5;
      for (let i = 0; i < n; i++) {
        const x = sc * 1.1 + gap * i;
        ents.push(top ? { t: "beam", x, y0: 0, y1: 300 } : { t: "beam", x, y0: 240, y1: H });
        ents.push(item(x + 60, top ? 420 : 120, i === n - 1 ? "gem" : "star"));
        top = !top;
      }
      return OPEN(id, sc * 1.1 + gap * n + sc * 0.5, ents);
    }
    case "barrage": {
      // 4레인 순차 폭격 — 1 → 3 → 2 → 4 처럼 섞인 순서로 하나씩만 켜진다
      const order = [0, 1, 2, 3];
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      const ents: Entity[] = [{ t: "trigger", x: 0, ev: { k: "barrage", order } }];
      ents.push(item(sc * 2.2, 25 + H / 2, "feather"), item(sc * 3.6, H / 2, "star"));
      return OPEN(id, sc * 5.4, ents);
    }
    case "movers": {
      // 움직이는 벽 2 + 가짜 틈 1 (소개 때는 가운데가 가짜 틈)
      const ents: Entity[] = [];
      const gapH = stage >= 10 ? 190 : 210;
      const xs = [sc * 1.0, sc * 2.1, sc * 3.2];
      const fakeAt = stage === 6 ? 1 : Math.floor(rand() * 3);
      xs.forEach((x, i) => {
        if (i === fakeAt) {
          const gapA = Math.round(between(rand, 150, 390));
          const dir = gapA > H / 2 ? -1 : 1;
          const gapB = Math.round(Math.max(135, Math.min(405, gapA + dir * between(rand, 180, 230))));
          ents.push({ t: "shifter", x: Math.round(x), gapA, gapB, gapH: gapH + 20, switchT: x / sc - 1.0 });
          ents.push(item(x - sc * 0.35, gapB, "star"));
        } else {
          const lo = Math.round(between(rand, 150, 200));
          ents.push({
            t: "mover",
            x: Math.round(x),
            gapY0: lo,
            gapY1: lo + Math.round(between(rand, 170, 210)),
            gapH,
            period: between(rand, 2.4, 3.2),
            phase: rand() * Math.PI * 2,
          });
        }
      });
      return OPEN(id, sc * 4.3, ents);
    }
    case "wave": {
      const gapH = stage >= 10 ? 235 : 255;
      const ents: Entity[] = [{ t: "zone", x: 0, w: Math.round(sc * 4), kind: "wave" }];
      for (const x of [sc * 1.3, sc * 2.7]) {
        ents.push({ t: "pillar", x: Math.round(x), gapY: Math.round(between(rand, 225, 315)), gapH });
      }
      ents.push(item(sc * 2.0, H / 2, "feather"));
      return OPEN(id, sc * 4, ents);
    }
    case "flip": {
      // 중력 반전 구역 — 위쪽에 보상 (거꾸로 떨어지면 자연히 먹게 된다)
      const x0 = sc * 1.0;
      const w = sc * 2.6;
      const ents: Entity[] = [
        { t: "zone", x: Math.round(x0), w: Math.round(w), kind: "flip" },
        { t: "pillar", x: Math.round(sc * 2.3), gapY: H / 2, gapH: 300 },
      ];
      for (let i = 0; i < 4; i++) ents.push(item(x0 + sc * 0.35 + i * sc * 0.55, 70, i === 3 ? "gem" : "star"));
      return OPEN(id, sc * 4.4, ents);
    }
    case "chain": {
      // 색 체인 — 빠르게 이어지는 전면 게이트. 끝까지 PERFECT면 COLOR BURST
      const n = opts.n ?? (stage > FINAL_STAGE ? 7 : 5);
      const mode = opts.mode ?? (rand() < 0.5 ? "cycle" : "random");
      const glitch = opts.glitch ?? (stage >= CFG.glitch.fromStage && rand() < 0.5);
      const spacing = Math.max(200, sc * 0.62);
      const first = sc * 0.9;
      const ents: Entity[] = [];
      let color = pickColor(rand);
      for (let i = 0; i < n; i++) {
        if (i > 0) {
          if (mode === "cycle") color = COLOR_ORDER[(COLOR_ORDER.indexOf(color) + 1) % 3];
          else if (mode === "random") color = pickColor(rand, color);
        }
        const x = first + spacing * i;
        // 글리치는 체인 중간에만 (첫 게이트는 정직하게)
        const fake = glitch && i > 0 && rand() < 0.35 ? pickColor(rand, color) : undefined;
        ents.push({ t: "gate", x: Math.round(x), y: 0, h: H, color, fake, chain: { id: ctx.chainId, idx: i, n } });
        if (i % 2 === 1) ents.push(item(x + spacing / 2 - 18, between(rand, 150, 390), "star"));
      }
      return OPEN(id, first + spacing * n + sc * 0.5, ents);
    }
    case "storm": {
      // 아이템 폭풍 — 욕심을 부르는 구간. 가벼운 전깃줄 두 개만
      const ents: Entity[] = [];
      const cols = 6;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < 4; r++) {
          if (rand() < 0.25) continue;
          const y = 90 + r * 120 + (c % 2) * 50;
          if (y > H - 40) continue;
          ents.push(item(sc * 0.6 + c * sc * 0.55, y, stormItem(rand, stage)));
        }
      }
      ents.push({ t: "wire", x: Math.round(sc * 1.4), y: 250, w: 140 }, { t: "wire", x: Math.round(sc * 2.8), y: 330, w: 140 });
      return OPEN(id, sc * 4.1, ents);
    }
    case "missileRun": {
      const ents: Entity[] = [
        { t: "trigger", x: 0, ev: { k: "missile", count: stage >= 13 ? 2 : 1 } },
        { t: "wire", x: Math.round(sc * 1.9), y: 90, w: 180 },
        { t: "wire", x: Math.round(sc * 1.9), y: 450, w: 180 },
        item(sc * 2.8, H / 2, "feather"),
      ];
      return OPEN(id, sc * 3.6, ents);
    }
    case "gravityChaos": {
      const ents: Entity[] = [{ t: "zone", x: Math.round(sc * 0.9), w: Math.round(sc * 3.7), kind: "gravityChaos" }];
      for (let i = 0; i < 6; i++) ents.push(item(sc * 1.1 + i * sc * 0.55, i % 2 ? 90 : 450, i === 5 ? "gem" : "star"));
      return OPEN(id, sc * 5, ents);
    }
    case "featherRain": {
      const ents: Entity[] = [
        { t: "trigger", x: 0, ev: { k: "featherRain" } },
        { t: "wire", x: Math.round(sc * 2.2), y: 300, w: 120 },
      ];
      return OPEN(id, sc * (CFG.events.featherRainSec + 0.8), ents);
    }
    case "laserEvent": {
      // ⚠️ LASER WARNING — 화면 전체가 붉어지고 3·2·1 뒤 안전 띠만 남기고 발사
      const safeTop = Math.round(between(rand, 70, H - 70 - 170));
      return OPEN(id, sc * 4.2, [
        { t: "trigger", x: 0, ev: { k: "laser", pattern: "event", ys: [safeTop] } },
        item(sc * 1.4, safeTop + 85, "star"),
      ]);
    }
    case "golden": {
      // 🟡 황금 부엉이 — 전깃줄 두 가닥 사이 아주 좁은 틈에서 기다린다.
      // 틈 밖은 열려 있어서 안 먹고 지나가도 된다 (먹을 것인가?)
      const gapY = Math.round(between(rand, 150, 390));
      const px = Math.round(sc * 1.5);
      const half = CFG.events.goldenGap / 2;
      const w = 220;
      return OPEN(id, sc * 3.2, [
        { t: "trigger", x: 0, ev: { k: "golden" } },
        { t: "wire", x: px, y: gapY - half, w },
        { t: "wire", x: px, y: gapY + half, w },
        item(px + w / 2 - CFG.entity.itemR, gapY, "golden"),
        item(px - sc * 0.6, gapY, "feather"),
      ]);
    }
  }
}
