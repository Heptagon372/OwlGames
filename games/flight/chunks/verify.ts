// 청크 검증 (기획서 §8 생성 규칙 / §16 수용 기준 2)
// - 스키마 검사
// - 물리 시뮬레이션으로 S·M·L 모두에게 통과 경로가 있는지 탐색
// 엔진과 같은 물리/충돌 함수를 쓰므로 튜닝을 바꾸면 여기서도 바로 잡힌다.

import { CFG, type SizeKey } from "../config";
import { ellipseHitsRect, entityWidth, solidRects } from "../engine/collision";
import { clamp, hitbox, stepPhysics } from "../engine/owl";
import type { Chunk, Entity } from "../types";

const SIZES: SizeKey[] = ["S", "M", "L"];

export type ChunkIssue = { id: string; kind: "schema" | "path"; message: string };

const ID_RE = /^p[0-4]-[a-z0-9-]+$/;

export function validateSchema(c: Chunk): string[] {
  const out: string[] = [];
  const push = (m: string) => out.push(m);

  if (!ID_RE.test(c.id)) push(`id 형식이 p<페이즈>-<이름> 이 아님: ${c.id}`);
  if (!c.id.startsWith(`p${c.phase}-`)) push("id의 페이즈와 phase 필드가 다름");
  if (c.width < 480 || c.width > 1600) push(`width는 480~1600 (현재 ${c.width})`);
  if (c.difficulty < 1 || c.difficulty > 5) push("difficulty는 1~5");
  if (!c.tags.length) push("tags가 비어 있음");
  for (const y of [c.entryY, c.exitY]) {
    if (y < 60 || y > CFG.view.h - 60) push(`entryY/exitY는 60~${CFG.view.h - 60} (현재 ${y})`);
  }
  if (c.tags.includes("breather") && c.difficulty > 2) push("breather 청크는 difficulty 2 이하여야 함");

  const phaseGap = CFG.phases[c.phase].gapW;
  // P0(0~200m)는 "아무 입력도 안 하면 죽지 않는다"를 보장해야 하므로 바닥 차선을 비워둔다 (§16-3)
  const FLOOR_LANE = 500;
  let hasGate = false;
  let hasNarrow = false;
  let hasBug = false;
  let hasItem = false;

  for (const e of c.entities) {
    const w = entityWidth(e);
    if (e.x < 0 || e.x + w > c.width) push(`${e.t} x=${e.x} 가 청크 밖으로 나감`);
    switch (e.t) {
      case "pillar": {
        if (c.phase === 0 && e.gapY + e.gapH / 2 < FLOOR_LANE) push("P0의 pillar는 바닥 차선을 막을 수 없음 (gapY + gapH/2 ≥ 500)");
        if (e.gapH < phaseGap - 20) push(`pillar 통로가 좁음 (${e.gapH} < ${phaseGap - 20})`);
        if (e.gapH > 420) push("pillar 통로가 지나치게 넓음");
        if (e.gapY - e.gapH / 2 < 0 || e.gapY + e.gapH / 2 > CFG.view.h) push("pillar 통로가 화면을 벗어남");
        break;
      }
      case "wire":
        if (c.phase === 0 && e.y > 470) push("P0의 wire는 바닥 차선을 막을 수 없음 (y ≤ 470)");
        if (e.w < 60 || e.w > 520) push("wire 길이는 60~520");
        if (e.y < 40 || e.y > CFG.view.h - 40) push("wire y는 40~500");
        break;
      case "gate":
        hasGate = true;
        if (c.phase < 1) push("gate는 P1 이상에서만");
        if (e.h < 120) push("gate 높이는 120 이상");
        if (e.y < 0 || e.y + e.h > CFG.view.h) push("gate가 화면을 벗어남");
        break;
      case "narrow":
        hasNarrow = true;
        if (c.phase < 2) push("narrow는 P2 이상에서만");
        if (e.h < 40 || e.h > 70) push(`narrow 통로 높이는 40~70 (현재 ${e.h})`);
        if (e.w < 60 || e.w > 400) push("narrow 길이는 60~400");
        if (e.y - CFG.entity.narrowBand < -40 || e.y + e.h + CFG.entity.narrowBand > CFG.view.h + 40) {
          push("narrow 튜브(위아래 70px 띠 포함)가 화면을 너무 벗어남");
        }
        break;
      case "wall":
        if (c.phase < 2) push("wall은 P2 이상에서만");
        if (e.h < 60) push("wall 높이는 60 이상");
        break;
      case "bug":
        hasBug = true;
        if (c.phase < 3) push("bug는 P3 이상에서만");
        if (e.y1 - e.y0 < 40) push("bug 이동폭은 40 이상");
        if (e.period < 1.2 || e.period > 6) push("bug period는 1.2~6초");
        break;
      case "item":
        hasItem = true;
        if (e.y < 30 || e.y > CFG.view.h - 30) push("item y는 30~510");
        break;
    }
  }

  if (c.tags.includes("gate") && !hasGate) push("tags에 gate가 있는데 gate 엔티티가 없음");
  if (c.tags.includes("narrow") && !hasNarrow) push("tags에 narrow가 있는데 narrow 엔티티가 없음");
  if (c.tags.includes("moving") && !hasBug) push("tags에 moving이 있는데 bug 엔티티가 없음");
  if (c.tags.includes("item") && !hasItem) push("tags에 item이 있는데 item 엔티티가 없음");

  return out;
}

type PathResult = { ok: boolean; exitReachable: boolean; flapFrames: number; frames: number };

/**
 * 청크를 통과할 수 있는지 BFS로 탐색한다.
 * 상태 = (프레임, y, vy)를 양자화. 매 프레임 "날갯짓/활공" 두 가지 중 선택.
 */
export function findPath(c: Chunk, size: SizeKey): PathResult {
  const dt = CFG.physics.dt;
  const scroll = CFG.phases[c.phase].scroll;
  const { rx, ry } = hitbox(size);
  const totalFrames = Math.ceil(c.width / (scroll * dt)) + 2;
  const H = CFG.view.h;

  // 상태 양자화: y 4px, vy 25px/s
  const key = (y: number, vy: number) => Math.round(y / 4) * 1000 + (Math.round(vy / 25) + 40);
  type State = { y: number; vy: number; flaps: number };

  let frontier = new Map<number, State>();
  frontier.set(key(c.entryY, 0), { y: c.entryY, vy: 0, flaps: 0 });

  let best: State | null = null;
  let exitReachable = false;

  for (let f = 0; f < totalFrames && frontier.size; f++) {
    const localX = scroll * f * dt;
    const next = new Map<number, State>();

    for (const st of frontier.values()) {
      for (const flap of [false, true]) {
        const p = stepPhysics({ y: st.y, vy: st.vy }, flap, dt);
        let y = p.y;
        let vy = p.vy;
        // 천장·바닥은 즉사가 아니라 튕김 (기획서 §2)
        if (y < ry) {
          y = ry;
          vy = 0;
        } else if (y > H - ry) {
          y = H - ry;
          vy = 0;
        }
        if (hitsAnything(c, localX + scroll * dt, y, rx, ry, size, scroll)) continue;
        const k = key(y, vy);
        const cand: State = { y, vy, flaps: st.flaps + (flap ? 1 : 0) };
        const prev = next.get(k);
        if (!prev || cand.flaps < prev.flaps) next.set(k, cand);
      }
    }
    frontier = next;
    // 폭발 방지 (충분히 넓은 상한)
    if (frontier.size > 40000) {
      frontier = new Map([...frontier].slice(0, 40000));
    }
  }

  for (const st of frontier.values()) {
    if (!best || st.flaps < best.flaps) best = st;
    if (Math.abs(st.y - c.exitY) <= 24) exitReachable = true;
  }

  return {
    ok: frontier.size > 0,
    exitReachable,
    flapFrames: best?.flaps ?? 0,
    frames: totalFrames,
  };
}

function hitsAnything(
  c: Chunk,
  localX: number,
  y: number,
  rx: number,
  ry: number,
  size: SizeKey,
  scroll: number,
): boolean {
  const owlX = localX;
  for (const e of c.entities) {
    const w = entityWidth(e);
    // x축으로 겹치지 않으면 건너뛴다
    if (e.x > owlX + rx || e.x + w < owlX - rx) continue;
    const t = owlX / scroll; // bug 위상은 청크 진행도 기준 (엔진과 동일)
    for (const r of solidRects(e as Entity, e.x, size, t)) {
      if (ellipseHitsRect(owlX, y, rx, ry, r)) return true;
    }
  }
  return false;
}

/** 아무 입력도 하지 않았을 때 끝까지 살아남는지 (P0 보장용) */
export function survivesWithoutInput(c: Chunk, size: SizeKey = "M"): boolean {
  const dt = CFG.physics.dt;
  const scroll = CFG.phases[c.phase].scroll;
  const { rx, ry } = hitbox(size);
  const frames = Math.ceil(c.width / (scroll * dt)) + 2;
  let y = c.entryY;
  let vy = 0;
  for (let f = 0; f < frames; f++) {
    const p = stepPhysics({ y, vy }, false, dt);
    y = clamp(p.y, ry, CFG.view.h - ry);
    vy = y === p.y ? p.vy : 0;
    if (hitsAnything(c, scroll * f * dt, y, rx, ry, size, scroll)) return false;
  }
  return true;
}

export function verifyChunk(c: Chunk): ChunkIssue[] {
  const issues: ChunkIssue[] = validateSchema(c).map((message) => ({ id: c.id, kind: "schema" as const, message }));

  if (c.phase === 0 && !survivesWithoutInput(c)) {
    issues.push({ id: c.id, kind: "path", message: "P0 청크인데 무입력 상태로 통과하지 못함 (§16-3)" });
  }

  for (const size of SIZES) {
    const r = findPath(c, size);
    if (!r.ok) issues.push({ id: c.id, kind: "path", message: `${size} 크기로 통과할 수 있는 경로가 없음` });
    else if (!r.exitReachable) {
      issues.push({ id: c.id, kind: "path", message: `${size} 크기로 exitY(${c.exitY})에 도달할 수 없음` });
    }
    // 날갯짓 비용이 지나치게 크면 에너지가 구조적으로 고갈된다
    const flapSec = (r.flapFrames * CFG.physics.dt);
    const cost = flapSec * CFG.energy.flapDrain;
    if (r.ok && cost > CFG.energy.maxBySize[size] * 0.6) {
      issues.push({
        id: c.id,
        kind: "path",
        message: `${size} 최소 경로의 에너지 소비가 너무 큼 (${cost.toFixed(0)} > 최대치의 60%)`,
      });
    }
  }
  return issues;
}

/** 청크 묶음 전체 검증 + 규칙(중복 id, 페이즈별 최소 개수) */
export function verifyAll(chunks: Chunk[]): ChunkIssue[] {
  const issues: ChunkIssue[] = [];
  const seen = new Set<string>();
  for (const c of chunks) {
    if (seen.has(c.id)) issues.push({ id: c.id, kind: "schema", message: "id 중복" });
    seen.add(c.id);
    issues.push(...verifyChunk(c));
  }
  for (let phase = 0; phase <= 4; phase++) {
    const inPhase = chunks.filter((c) => c.phase === phase);
    if (inPhase.length < 8) {
      issues.push({ id: `P${phase}`, kind: "schema", message: `페이즈당 청크 8개 이상 필요 (현재 ${inPhase.length})` });
    }
    if (!inPhase.some((c) => c.tags.includes("breather"))) {
      issues.push({ id: `P${phase}`, kind: "schema", message: "페이즈마다 breather 청크가 최소 1개 필요" });
    }
  }
  if (chunks.length < 40) issues.push({ id: "*", kind: "schema", message: `청크 40개 이상 필요 (현재 ${chunks.length})` });
  return issues;
}

export { clamp };
