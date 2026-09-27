// 🎨 아울러닝 리소스 시트 그림 연출 (렌더 전용) — public/assets/owlrun (사용자 제공)
// 모든 함수는 그림이 아직 없으면 false 를 돌려주고, 부르는 쪽이 기존 도형으로 그린다.
import { CFG, type Color } from "../config";
import type { ItemKind } from "../types";
import { drawSprite, spr, spritePattern, type SpriteName } from "./assets";
import type { Fx } from "./fx";
import { SWAP_SEC, type Game } from "./game";
import { spriteRadius } from "./owl";

const W = CFG.view.w;
const H = CFG.view.h;
const OWL_X = CFG.physics.owlX;

/* ───────────────────────── 부엉이 ───────────────────────── */

/**
 * 지금 보여 줄 캐릭터 그림 (캐릭터 시트) — 센 상태가 먼저.
 * 사망 > 추락 > 잠깐 자세(피격·기절·부활·승리·줍기·골든) > 스킬 상태(팬텀·얼음·불꽃) > 색 그림.
 * 스킬 상태 그림은 스킬 색과 같다 (🔴 BREAKER=불꽃 · 🔵 FREEZE=얼음 · 🟣 PHANTOM=무적) → 색 판단이 흐려지지 않는다.
 */
function owlArt(g: Game): { name: SpriteName; k: number; animate: boolean } {
  if (g.status === "dead") return { name: "char/dead", k: 1.15, animate: false };
  if (g.status === "falling") return { name: "char/fall", k: 1.1, animate: false };
  const pose = g.pose && g.pose.t > 0 ? g.pose.k : null;
  switch (pose) {
    case "hit":
      return { name: "char/hit", k: 1.1, animate: false };
    case "dizzy":
      return { name: "char/dizzy", k: 1.12, animate: false };
    case "revive":
      return { name: "char/revive", k: 1.35, animate: false };
    case "victory":
      return { name: "char/victory", k: 1.12, animate: true };
    case "happy":
      return { name: "char/happy", k: 1.12, animate: true };
    case "golden":
      return { name: "char/golden", k: 1.25, animate: true };
    case "energy":
      return { name: "char/fx-energy", k: 1.2, animate: true };
    case "score":
      return { name: "char/fx-score", k: 1.15, animate: true };
    case "turbo":
      return { name: "char/fx-turbo", k: 1.3, animate: false };
    default:
      break;
  }
  if (g.skill === "phantom" || g.phantomT > 0) return { name: "char/phantom", k: 1.18, animate: true };
  if (g.skill === "freeze") return { name: "char/freeze", k: 1.2, animate: true };
  if (g.skill === "breaker" || g.breakerT > 0) return { name: "char/fire", k: 1.15, animate: true };
  return { name: `char/${g.color}` as SpriteName, k: 1, animate: true };
}

/**
 * 부엉이 몸 (이미 translate·rotate·scale 된 좌표계에서).
 * 날갯짓 프레임은 시트에서 75px 라 뭉개져서, **큰 색 그림에 날갯짓을 코드로 입힌다** —
 * 누르는 동안 위아래로 눌렸다 늘어나고(22Hz) 날개 바람 호가 스친다, 떼면 천천히 둥실.
 */
export function drawOwlSprite(ctx: CanvasRenderingContext2D, g: Game): boolean {
  const { ry } = spriteRadius(g.size);
  const art = owlArt(g);
  const img = spr(art.name) ?? spr(`char/${g.color}` as SpriteName);
  if (!img) return false;
  // 캐릭터 시트 3판(외곽선 스티커)은 번짐 여백이 없어 몸이 칸을 거의 채운다
  const h = ry * 2.55 * art.k;
  const w = (img.width / img.height) * h;
  const flap = art.animate && g.flapping && g.status === "playing";
  const beat = flap ? Math.sin(g.time * 22) : 0;
  const bob = art.animate && !flap ? Math.sin(g.time * 3.2) * 1.6 : 0;
  const sx = 1 - beat * 0.035;
  const sy = 1 + beat * 0.075;

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(0, bob - beat * 2);
  // 지금 색의 은은한 빛 — 어두운 하늘에서도 색이 한눈에 보이게 (외곽선 그림은 자체 빛이 없다)
  const rim = ctx.createRadialGradient(0, 0, h * 0.18, 0, 0, h * 0.62);
  rim.addColorStop(0, `${HEX[g.color]}55`);
  rim.addColorStop(1, `${HEX[g.color]}00`);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = rim;
  ctx.fillRect(-h * 0.7, -h * 0.7, h * 1.4, h * 1.4);
  ctx.restore();
  // 날개 바람 — 날개를 내리칠 때 몸 뒤로 희미한 호 두 개
  if (flap && beat > 0.2) {
    ctx.save();
    ctx.strokeStyle = `rgba(230,240,255,${(beat - 0.2) * 0.45})`;
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(-w * 0.12, dir * h * 0.05, w * 0.5, Math.PI + dir * 0.55, Math.PI + dir * 1.15, dir < 0);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.scale(sx, sy);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();

  // 꼬리 쪽 색 도형 배지 (색 + 도형 병기 — 색각 이상 배려). 스킬·자세 그림일 때도 지금 색을 알려 준다
  drawSprite(ctx, `color-${g.color}` as SpriteName, -w * 0.4, h * 0.3, ry * 0.95);
  return true;
}

/** 색별 혜성 꼬리 — 빠를수록 · FEVER · 스킬 · 터보면 길고 진하게 */
export function drawOwlTrail(ctx: CanvasRenderingContext2D, g: Game, fx: Fx): boolean {
  const img = spr(`char/trail-${g.color}` as SpriteName);
  if (!img || g.status === "ready") return !!img;
  const hot = g.feverT > 0 || g.turboT > 0 || g.overdrive || g.skill !== null;
  const { ry } = spriteRadius(g.size);
  const len = ry * (3.2 + fx.speedT * 2.6 + (hot ? 2 : 0));
  const alpha = Math.min(1, 0.32 + fx.speedT * 0.45 + (hot ? 0.35 : 0));
  // 꼬리는 실제 움직임의 반대쪽으로 — (앞으로 가는 속도, 위아래 속도)의 각도
  const motion = Math.atan2(g.vy, Math.max(240, g.scroll)) * 0.85;
  const w = len * 1.25;
  const h = (img.height / img.width) * w;
  const back = w * 0.42;
  ctx.save();
  ctx.translate(OWL_X - Math.cos(motion) * back, g.y - Math.sin(motion) * back);
  // 시트의 꼬리는 머리가 오른쪽 위(약 -38°)를 향한다 → 머리가 진행 방향을 보게 돌린다
  ctx.rotate(motion + (38 * Math.PI) / 180);
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
  return true;
}

const HEX: Record<Color, string> = { R: "#FF4D4D", B: "#3DD9EB", P: "#A855F7" };

/** 색을 바꾼 순간 — 새 색 고리가 퍼지고, 도형 그림이 머리 위로 튀어 오른다 */
export function drawSwap(ctx: CanvasRenderingContext2D, g: Game): void {
  if (g.swapT <= 0) return;
  const k = 1 - g.swapT / SWAP_SEC;
  const hex = HEX[g.color];
  ctx.save();
  ctx.strokeStyle = hex;
  ctx.globalAlpha = 1 - k;
  ctx.lineWidth = 4 * (1 - k) + 1;
  ctx.shadowColor = hex;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(OWL_X, g.y, 22 + k * 46, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  const s = 0.55 + Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.45;
  drawSprite(ctx, `color-${g.color}` as SpriteName, OWL_X, g.y - 42 - k * 16, 30 * s, { alpha: 1 - k * k });
}

/* ───────────────────────── 아이템 ───────────────────────── */

export const ITEM_ART: Partial<Record<ItemKind, SpriteName>> = {
  feather: "item-feather",
  bigFeather: "item-feather",
  efficiency: "item-energy",
  shield: "item-shield",
  rainbow: "item-box",
  gem: "item-crystal",
  star: "item-star",
  double: "item-star",
  magnet: "item-magnet",
  rage: "item-rage",
  phantom: "item-phantom",
  golden: "item-golden",
  owlEnergy: "item-owl-energy",
  grow: "item-size-L",
  shrink: "item-size-S",
};

const ITEM_H: Partial<Record<ItemKind, number>> = {
  bigFeather: 46,
  golden: 42,
  owlEnergy: 44,
  grow: 30,
  shrink: 28,
  double: 38,
};

/** 아이템 그림 — 둥실둥실 + 맥동, 희귀는 반짝이 */
export function drawItemSprite(ctx: CanvasRenderingContext2D, kind: ItemKind, cx: number, cy: number, time: number): boolean {
  const art = ITEM_ART[kind];
  if (!art || !spr(art)) return false;
  const h = (ITEM_H[kind] ?? 36) * (1 + Math.sin(time * 5 + cx * 0.05) * 0.05);
  const rot = kind === "star" || kind === "double" ? Math.sin(time * 3) * 0.15 : 0;
  if (kind === "bigFeather") {
    // 큰 깃털 — 금빛 후광
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "rgba(255,176,32,0.22)";
    ctx.beginPath();
    ctx.arc(cx, cy, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  drawSprite(ctx, art, cx, cy, h, { rot });
  if (kind === "double") {
    ctx.save();
    ctx.font = "900 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#1a0f00";
    ctx.strokeText("×2", cx + 14, cy + 15);
    ctx.fillStyle = "#FFD27A";
    ctx.fillText("×2", cx + 14, cy + 15);
    ctx.restore();
  }
  // 반짝이 (크리스털 · 별 · 전설)
  if (kind === "gem" || kind === "star" || kind === "golden" || kind === "crown") {
    const t = (time * 1.3 + cx * 0.01) % 1;
    if (t < 0.35) {
      const a = Math.sin((t / 0.35) * Math.PI);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
      ctx.lineWidth = 2;
      const sx = cx + 9;
      const sy = cy - 10;
      ctx.beginPath();
      ctx.moveTo(sx - 7 * a, sy);
      ctx.lineTo(sx + 7 * a, sy);
      ctx.moveTo(sx, sy - 7 * a);
      ctx.lineTo(sx, sy + 7 * a);
      ctx.stroke();
      ctx.restore();
    }
  }
  return true;
}

/** 먹은 아이템 — 커지며 빛으로 사라진다 */
export function drawPickups(ctx: CanvasRenderingContext2D, g: Game): void {
  for (const p of g.pickups) {
    const k = 1 - p.life / p.max;
    const art = ITEM_ART[p.kind];
    // 부엉이 쪽으로 빨려 들어가며 커진다
    const x = p.x + (OWL_X - p.x) * k * 0.6;
    const y = p.y + (g.y - p.y) * k * 0.6;
    if (art) drawSprite(ctx, art, x, y, 36 * (1 + k * 1.4), { alpha: (1 - k) * 0.9, additive: true });
    ctx.save();
    ctx.strokeStyle = `rgba(255,226,170,${(1 - k) * 0.9})`;
    ctx.lineWidth = 3 * (1 - k) + 0.5;
    ctx.beginPath();
    ctx.arc(x, y, 14 + k * 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/* ───────────────────────── 장애물 ───────────────────────── */

/**
 * 돌벽 기둥 (시트의 "기본 벽" 돌 블록을 이어 붙인다) + 통로 쪽 끝에 가시 캡.
 * `glitch`면 글리치 블록 무늬 (가짜 틈).
 */
export function drawStoneWall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  dir: "down" | "up",
  night: boolean,
  glitch = false,
): boolean {
  const pat = spritePattern(ctx, glitch ? "glitch-block" : "wall-block", w);
  if (!pat || h <= 0) return false;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(x, dir === "down" ? y + h : y);
  ctx.fillStyle = pat;
  // 통로 쪽 끝에서 무늬가 시작되도록 (블록이 반쯤 잘려 보이지 않게)
  ctx.fillRect(0, dir === "down" ? -h - 200 : 0, w, h + 200);
  ctx.restore();

  // 입체감 — 좌우 음영
  ctx.save();
  const shade = ctx.createLinearGradient(x, 0, x + w, 0);
  shade.addColorStop(0, "rgba(0,0,0,0.35)");
  shade.addColorStop(0.25, "rgba(0,0,0,0)");
  shade.addColorStop(0.8, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.4)");
  ctx.fillStyle = shade;
  ctx.fillRect(x, y, w, h);
  if (night) {
    ctx.strokeStyle = "rgba(205,168,255,0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }
  ctx.restore();

  // 가시 캡 — 통로를 향해 가시가 선다 (여기가 위험하다는 신호)
  const spikes = spr("spikes");
  if (spikes && !glitch) {
    const cw = w + 10;
    const ch = (spikes.height / spikes.width) * cw;
    if (h > ch * 0.9) {
      const cy = dir === "down" ? y + h - ch / 2 : y + ch / 2;
      drawSprite(ctx, "spikes", x + w / 2, cy, ch, { flipY: dir === "down" });
    }
  }
  return true;
}

/** 좁은 통로의 위아래 띠 — 돌 판(천장/바닥) 무늬 */
export function drawStoneBand(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): boolean {
  const pat = spritePattern(ctx, "wall-slab", 90);
  if (!pat) return false;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  ctx.restore();
  return true;
}

/* ───────────────────────── 배경 ───────────────────────── */

/** 단계별 하늘 (시트의 "배경 & 환경") */
export function backdropFor(stage: number): SpriteName {
  if (stage >= 15) return "bg-15";
  if (stage >= 14) return "bg-14";
  if (stage >= 10) return "bg-10";
  if (stage >= 5) return "bg-05";
  return "bg-01";
}

function drawCover(ctx: CanvasRenderingContext2D, name: SpriteName, alpha: number, drift: number): void {
  const img = spr(name);
  if (!img || alpha <= 0.01) return;
  const h = H + 80;
  const w = (img.width / img.height) * h;
  const range = Math.max(0, w - W - 40);
  // 아주 천천히 좌우로 흐른다 (먼 하늘)
  const off = range * (0.5 + 0.5 * Math.sin(drift));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, -20 - off, -60, w, h);
  ctx.restore();
}

export function drawBackdrop(ctx: CanvasRenderingContext2D, g: Game, fx: Fx, night: boolean): void {
  const base = night ? 0.22 : 0.58;
  const drift = g.worldX * 0.00012;
  if (fx.backdropPrev) drawCover(ctx, fx.backdropPrev as SpriteName, base * (1 - fx.backdropT), drift);
  drawCover(ctx, fx.backdrop as SpriteName, base * (fx.backdropPrev ? fx.backdropT : 1), drift);
  if (!spr(fx.backdrop as SpriteName)) return;
  // 장애물이 잘 보이게 아래쪽을 눌러 준다
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, "rgba(7,11,24,0.15)");
  shade.addColorStop(0.6, "rgba(7,11,24,0.35)");
  shade.addColorStop(1, "rgba(7,11,24,0.65)");
  ctx.fillStyle = shade;
  ctx.fillRect(-60, -60, W + 120, H + 120);
}

const CLOUDS = Array.from({ length: 6 }, (_, i) => ({
  x: (i * 211) % (W + 200),
  y: 40 + ((i * 53) % 150),
  h: 34 + ((i * 17) % 30),
  a: 0.28 + (i % 3) * 0.1,
}));

export function drawClouds(ctx: CanvasRenderingContext2D, g: Game): void {
  if (!spr("deco-cloud")) return;
  for (const c of CLOUDS) {
    const x = ((((c.x - g.worldX * 0.12) % (W + 200)) + W + 200) % (W + 200)) - 100;
    drawSprite(ctx, "deco-cloud", x, c.y, c.h, { alpha: c.a });
  }
}

/** 달 그림 (없으면 false → 도형 달) */
export function drawMoon(ctx: CanvasRenderingContext2D): boolean {
  return drawSprite(ctx, "deco-moon", W - 130, 86, 78);
}
