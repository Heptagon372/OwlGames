// 🚀 아울스페이스 — 칩 게이지 → 스킬 3택 (기획서 §5.1)
// 선택 횟수가 런당 6~10회로 적다. 탄막 게임은 화면을 읽는 데 인지 자원을 써야 한다.

import { CFG } from "../config";
import {
  applyStats,
  levelLabel,
  MAIN_IDS,
  MAINS,
  PASSIVE_IDS,
  PASSIVES,
  SUB_IDS,
  SUBS,
} from "../data/skills";
import { pushLog, type World } from "./world";
import type { Card, MainId, PassiveId, SkillId, SubId } from "../types";

function mainCard(w: World, id: MainId): Card {
  const cur = w.main.id === id ? w.main.lv : 0;
  return {
    kind: "main",
    id,
    name: MAINS[id].name,
    emoji: MAINS[id].emoji,
    desc: MAINS[id].desc,
    level: cur === 0 ? "교체" : levelLabel(cur),
  };
}

function subCard(w: World, id: SubId): Card {
  const cur = w.subs.find((s) => s.id === id)?.lv ?? 0;
  return { kind: "sub", id, name: SUBS[id].name, emoji: SUBS[id].emoji, desc: SUBS[id].desc, level: levelLabel(cur) };
}

function passiveCard(w: World, id: PassiveId): Card {
  const cur = w.passives.find((s) => s.id === id)?.lv ?? 0;
  return {
    kind: "passive",
    id,
    name: PASSIVES[id].name,
    emoji: PASSIVES[id].emoji,
    desc: PASSIVES[id].desc,
    level: levelLabel(cur),
  };
}

/** 카드 3장 (§5.1) */
export function drawCards(w: World, history: SkillId[][] = []): Card[] {
  const pool: { card: Card; weight: number }[] = [];

  // 최근 2회 연속으로 나온 카드는 뺀다
  const last = history.slice(-2);
  const blocked = new Set<SkillId>();
  if (last.length === 2) for (const id of last[0]) if (last[1].includes(id)) blocked.add(id);

  const maxLv = CFG.slots.maxLv;

  for (const id of MAIN_IDS) {
    if (blocked.has(id)) continue;
    const cur = w.main.id === id ? w.main.lv : 0;
    if (cur >= maxLv) continue;
    // 교체는 조금 드물게, 강화는 자주
    pool.push({ card: mainCard(w, id), weight: cur > 0 ? 1.5 : 0.8 });
  }

  const subFull = w.subs.length >= CFG.slots.sub;
  for (const id of SUB_IDS) {
    if (blocked.has(id)) continue;
    const slot = w.subs.find((s) => s.id === id);
    if (slot) {
      if (slot.lv >= maxLv) continue;
      pool.push({ card: subCard(w, id), weight: 1.2 });
    } else if (!subFull) {
      pool.push({ card: subCard(w, id), weight: 1.4 });
    }
  }

  const passFull = w.passives.length >= CFG.slots.passive;
  for (const id of PASSIVE_IDS) {
    if (blocked.has(id)) continue;
    const slot = w.passives.find((s) => s.id === id);
    if (slot) {
      if (slot.lv >= maxLv) continue;
      pool.push({ card: passiveCard(w, id), weight: 1.1 });
    } else if (!passFull) {
      pool.push({ card: passiveCard(w, id), weight: 1.2 });
    }
  }

  const out: Card[] = [];
  while (out.length < CFG.slots.choices && pool.length > 0) {
    const usable = pool.filter((c) => !out.some((o) => o.id === c.card.id));
    if (usable.length === 0) break;
    let total = 0;
    for (const c of usable) total += c.weight;
    let r = w.rand() * total;
    let picked = usable[usable.length - 1];
    for (const c of usable) {
      r -= c.weight;
      if (r <= 0) { picked = c; break; }
    }
    out.push(picked.card);
  }
  return out;
}

export function applyCard(w: World, card: Card): void {
  if (card.kind === "main") {
    const id = card.id as MainId;
    if (w.main.id === id) w.main.lv = Math.min(CFG.slots.maxLv, w.main.lv + 1);
    else w.main = { id, lv: 1 };
    pushLog(w, "SKILL", `${MAINS[id].emoji} ${MAINS[id].name} Lv${w.main.lv}`);
    return;
  }

  if (card.kind === "sub") {
    const id = card.id as SubId;
    const slot = w.subs.find((s) => s.id === id);
    if (slot) slot.lv = Math.min(CFG.slots.maxLv, slot.lv + 1);
    else if (w.subs.length < CFG.slots.sub) w.subs.push({ id, lv: 1 });
    pushLog(w, "SKILL", `${SUBS[id].emoji} ${SUBS[id].name} Lv${w.subs.find((s) => s.id === id)?.lv ?? 1}`);
  } else {
    const id = card.id as PassiveId;
    const slot = w.passives.find((s) => s.id === id);
    if (slot) slot.lv = Math.min(CFG.slots.maxLv, slot.lv + 1);
    else if (w.passives.length < CFG.slots.passive) w.passives.push({ id, lv: 1 });
    pushLog(w, "SKILL", `${PASSIVES[id].emoji} ${PASSIVES[id].name} Lv${w.passives.find((s) => s.id === id)?.lv ?? 1}`);
  }

  recalc(w);
}

export function recalc(w: World): void {
  const before = w.stats.bombMax;
  w.stats = applyStats(w.passives, w.subs);
  // 💣 봄 확장은 시작 봄도 올린다
  if (w.stats.bombMax > before) w.player.bombs = Math.min(w.stats.bombMax, w.player.bombs + 1);
}

/** 결과 화면·서버 meta 용 빌드 요약 (§10.3) */
export function buildSummary(w: World): string[] {
  const out = [`${w.main.id}:${w.main.lv}`];
  for (const s of w.subs) out.push(`${s.id}:${s.lv}`);
  for (const p of w.passives) out.push(`${p.id}:${p.lv}`);
  return out;
}
