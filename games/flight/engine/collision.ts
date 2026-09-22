// 충돌·니어미스 판정 (순수 함수 — 청크 검증 스크립트와 공유한다)
import { CFG, type SizeKey } from "../config";
import type { Entity } from "../types";

export type Rect = { x: number; y: number; w: number; h: number };

/** 엔티티가 이 크기의 부엉이에게 "벽"으로 작용하는 사각형들 (월드 좌표) */
export function solidRects(e: Entity, worldX: number, size: SizeKey, timeSec = 0): Rect[] {
  const H = CFG.view.h;
  switch (e.t) {
    case "pillar": {
      const top = e.gapY - e.gapH / 2;
      const bottom = e.gapY + e.gapH / 2;
      return [
        { x: worldX, y: -40, w: CFG.entity.pillarW, h: top + 40 },
        { x: worldX, y: bottom, w: CFG.entity.pillarW, h: H - bottom + 40 },
      ];
    }
    case "wire":
      return [{ x: worldX, y: e.y - CFG.entity.wireH / 2, w: e.w, h: CFG.entity.wireH }];
    case "narrow": {
      // 튜브 위아래 70px 띠만 벽이고 나머지 높이는 열려 있다.
      // S는 튜브로 질러갈 수 있고, M·L은 띠 위/아래로 돌아가야 한다.
      const band = CFG.entity.narrowBand;
      const walls: Rect[] = [
        { x: worldX, y: e.y - band, w: e.w, h: band },
        { x: worldX, y: e.y + e.h, w: e.w, h: band },
      ];
      if (size !== "S") walls.push({ x: worldX, y: e.y, w: e.w, h: e.h });
      return walls;
    }
    case "wall":
      // L은 부수고 지나가므로 벽이 아니다 (부수는 처리는 game.ts)
      return size === "L" ? [] : [{ x: worldX, y: e.y, w: CFG.entity.wallW, h: e.h }];
    case "bug": {
      const y = bugY(e, timeSec);
      const r = CFG.entity.bugR;
      return [{ x: worldX - r, y: y - r, w: r * 2, h: r * 2 }];
    }
    default:
      return [];
  }
}

export function bugY(e: Extract<Entity, { t: "bug" }>, timeSec: number): number {
  const mid = (e.y0 + e.y1) / 2;
  const amp = (e.y1 - e.y0) / 2;
  return mid + amp * Math.sin((2 * Math.PI * timeSec) / e.period);
}

/** 엔티티의 x 폭 (월드 좌표에서 차지하는 길이) */
export function entityWidth(e: Entity): number {
  switch (e.t) {
    case "pillar":
      return CFG.entity.pillarW;
    case "wire":
      return e.w;
    case "gate":
      return CFG.entity.gateW;
    case "narrow":
      return e.w;
    case "wall":
      return CFG.entity.wallW;
    case "bug":
      return CFG.entity.bugR * 2;
    case "item":
      return CFG.entity.itemR * 2;
  }
}

/** 타원 ↔ 사각형 거리. 0이면 겹침 (타원 공간으로 정규화해서 원-사각 거리로 계산) */
export function ellipseRectDistance(cx: number, cy: number, rx: number, ry: number, r: Rect): number {
  const nearestX = Math.max(r.x, Math.min(cx, r.x + r.w));
  const nearestY = Math.max(r.y, Math.min(cy, r.y + r.h));
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return 0;
  // 해당 방향의 타원 반경
  const ux = dx / dist;
  const uy = dy / dist;
  const edge = 1 / Math.hypot(ux / rx, uy / ry);
  return Math.max(0, dist - edge);
}

export function ellipseHitsRect(cx: number, cy: number, rx: number, ry: number, r: Rect): boolean {
  return ellipseRectDistance(cx, cy, rx, ry, r) === 0;
}

/** 니어미스: 닿지는 않았지만 margin 이내로 스친 경우 */
export function isNearMiss(dist: number): boolean {
  return dist > 0 && dist <= CFG.score.nearMissMarginPx;
}
