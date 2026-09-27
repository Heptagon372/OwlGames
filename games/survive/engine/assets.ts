// 🦉 아울 서바이버즈 — 부엉이 스프라이트 (사용자 제공 이미지, public/assets/CREDITS.md)
//
// 원본 시트 한 장을 부위별로 잘라 `public/assets/survive-owl/*.webp` 에 두었다.
// 로딩 전에는 null 을 돌려주고, 렌더는 도형 폴백으로 그린다 — 에셋 없이도 게임이 돈다.

const BASE = "/assets/survive-owl";

export const OWL = {
  front: "front",
  back: "back",
  left: "left",
  right: "right",
  move1: "move-1",
  move2: "move-2",
  move3: "move-3",
  move4: "move-4",
  move5: "move-5",
  idle: "idle",
  happy: "happy",
  angry: "angry",
  surprised: "surprised",
  hit: "hit",
  dead: "dead",
  levelup: "levelup",
  arrow1: "arrow-1",
  arrow2: "arrow-2",
  arrow3: "arrow-3",
  slash: "slash",
  circle: "circle",
} as const;

export type OwlSprite = keyof typeof OWL;

/** 이동 애니메이션 (오른쪽을 보고 있다 — 왼쪽은 뒤집어 그린다) */
export const MOVE_FRAMES: OwlSprite[] = ["move1", "move2", "move3", "move4", "move5"];

/** 시작 화면 큰 그림 */
export const OWL_HERO = `${BASE}/hero.webp`;

const images = new Map<OwlSprite, HTMLImageElement>();
const ready = new Set<OwlSprite>();

export function preloadOwl(): void {
  if (typeof window === "undefined" || images.size) return;
  for (const name of Object.keys(OWL) as OwlSprite[]) {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => ready.add(name);
    img.src = `${BASE}/${OWL[name]}.webp`;
    images.set(name, img);
  }
}

/** 로딩된 스프라이트 (아직이면 null → 도형 폴백) */
export function owl(name: OwlSprite): HTMLImageElement | null {
  return ready.has(name) ? (images.get(name) ?? null) : null;
}

/* ── 몬스터·보스 (사용자 제공 네온 도형 시트) ─────────────────── */

const MOB_BASE = "/assets/survive-mobs";

/**
 * 도형 그림마다 **몸통이 그림에서 차지하는 비율**과 몸통 중심 높이.
 * 그림에는 왕관·눈꽃·고리 같은 장식이 붙어 있어서, 판정 반경(r)에 몸통을 맞추려면 이 값이 필요하다.
 *  body — 몸통 지름 ÷ 그림 너비 · cx·cy — 몸통 중심 ÷ 그림 너비·높이
 *  (원형은 속도선이 왼쪽에, 오각형은 레이저가 오른쪽에 붙어 있어서 몸통이 가운데가 아니다)
 */
export const MOB_ART = {
  tri: { body: 0.92, cx: 0.51, cy: 0.55 },
  square: { body: 0.84, cx: 0.5, cy: 0.51 },
  circle: { body: 0.67, cx: 0.57, cy: 0.53 },
  penta: { body: 0.65, cx: 0.38, cy: 0.49 },
  hexa: { body: 0.47, cx: 0.47, cy: 0.6 },
  hepta: { body: 0.54, cx: 0.49, cy: 0.48 },
  octa: { body: 0.85, cx: 0.5, cy: 0.49 },
  nona: { body: 0.74, cx: 0.51, cy: 0.54 },
  deca: { body: 0.67, cx: 0.52, cy: 0.56 },
  hendeca: { body: 0.59, cx: 0.5, cy: 0.51 },
  dodeca: { body: 0.84, cx: 0.5, cy: 0.48 },
  trideca: { body: 0.48, cx: 0.49, cy: 0.55 },
  tetradeca: { body: 0.6, cx: 0.49, cy: 0.6 },
  chrono: { body: 0.42, cx: 0.51, cy: 0.58 },
} as const;

export type MobArt = keyof typeof MOB_ART;

const mobImages = new Map<MobArt, HTMLImageElement>();
const mobReady = new Set<MobArt>();

export function preloadMobs(): void {
  if (typeof window === "undefined" || mobImages.size) return;
  for (const name of Object.keys(MOB_ART) as MobArt[]) {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => mobReady.add(name);
    img.src = `${MOB_BASE}/${name}.webp`;
    mobImages.set(name, img);
  }
}

/** 몬스터 그림 (없는 종류거나 아직 로딩 전이면 null → 네온 도형 폴백) */
export function mobArt(name: string): HTMLImageElement | null {
  return mobReady.has(name as MobArt) ? (mobImages.get(name as MobArt) ?? null) : null;
}

/** 몬스터 그림 주소 (가이드 화면 등 DOM 용) */
export function mobArtSrc(name: MobArt): string {
  return `${MOB_BASE}/${name}.webp`;
}

/* ── 장애물 (사용자 제공 네온 오브젝트 시트) ───────────────────── */

const OBST_BASE = "/assets/survive-obstacles";

/**
 * 장애물 그림마다 **단단한 부분이 그림에서 차지하는 비율** (글로우·파편은 그 바깥이다).
 * 판정 사각형(w×h)에 단단한 부분을 맞추려면 이 값으로 나눠서 그린다.
 * 부서진 그림은 **같은 배율로 잘려 있어서**(`scripts/slice-survive-obstacles.py`) 자기 크기 비율만 곱하면 된다.
 */
export const OBSTACLE_ART = {
  rack: { w: 0.84, h: 0.62 },
  box: { w: 0.75, h: 0.69 },
  extinguisher: { w: 0.83, h: 0.79 },
  cable: { w: 0.85, h: 0.73 },
  portal: { w: 0.91, h: 0.71 },
} as const;

export type ObstacleArt = keyof typeof OBSTACLE_ART;

const obstImages = new Map<string, HTMLImageElement>();
const obstReady = new Set<string>();

export function preloadObstacles(): void {
  if (typeof window === "undefined" || obstImages.size) return;
  for (const name of Object.keys(OBSTACLE_ART)) {
    for (const key of [name, `${name}-broken`]) {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => obstReady.add(key);
      img.src = `${OBST_BASE}/${key}.webp`;
      obstImages.set(key, img);
    }
  }
}

/** 장애물 그림 (아직 로딩 전이면 null → 도형 폴백) */
export function obstacleArt(name: string, broken: boolean): HTMLImageElement | null {
  const key = broken ? `${name}-broken` : name;
  return obstReady.has(key) ? (obstImages.get(key) ?? null) : null;
}
