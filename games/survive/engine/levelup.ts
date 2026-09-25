// 🦉 아울 서바이버즈 v2 — 레벨업 카드 (기획서 §6 · §7 추첨 규칙)

import { CFG } from "../config";
import {
  ACTIVE_IDS,
  ACTIVES,
  EVOLUTIONS,
  levelLabel,
  PASSIVE_IDS,
  PASSIVES,
  RESCUE_PASSIVES,
} from "../data/skills";
import { pushLog, recalcStats, type World } from "./world";
import type { ActiveId, Card, EvoId, PassiveId, SkillId } from "../types";

/** 지금 진화할 수 있는 조합 (§6.1) — 액티브 MAX + 짝 패시브 Lv3 */
export function pendingEvolution(w: World): EvoId | null {
  for (const slot of w.actives) {
    if (slot.evo) continue;
    const sk = ACTIVES[slot.id];
    if (!sk.evo || !sk.evoReq) continue;
    if (slot.lv < CFG.evolution.activeMaxLv) continue;
    const req = w.passives.find((p) => p.id === sk.evoReq);
    if (req && req.lv >= CFG.evolution.passiveReqLv) return sk.evo;
  }
  // 🔄 E12 는 패시브 기반 (P13 MAX + P14 Lv3)
  if (!w.evolutions.includes("E12")) {
    const p13 = w.passives.find((p) => p.id === "P13");
    const p14 = w.passives.find((p) => p.id === "P14");
    if (p13 && p13.lv >= CFG.evolution.maxSkillLv && p14 && p14.lv >= CFG.evolution.passiveReqLv) return "E12";
  }
  return null;
}

function evoCard(id: EvoId): Card {
  const e = EVOLUTIONS[id];
  return { kind: "evolution", id, name: e.name, emoji: e.emoji, desc: e.desc, level: "진화" };
}

function activeCard(id: ActiveId, lv: number): Card {
  const s = ACTIVES[id];
  return {
    kind: lv === 0 ? "new-active" : "up-active",
    id,
    name: s.name,
    emoji: s.emoji,
    desc: lv === 0 ? s.desc : `피해 +25% · 쿨다운 -8%`,
    level: levelLabel(lv),
  };
}

function passiveCard(id: PassiveId, lv: number): Card {
  const s = PASSIVES[id];
  return {
    kind: lv === 0 ? "new-passive" : "up-passive",
    id,
    name: s.name,
    emoji: s.emoji,
    desc: s.desc,
    level: levelLabel(lv),
  };
}

type Choice = { card: Card; weight: number };

/**
 * 카드 3장을 뽑는다.
 * `history` 는 직전 추첨들에서 제시된 id 목록 (같은 카드가 3회 연속 나오지 않게 쓴다).
 */
export function drawCards(w: World, history: SkillId[][] = []): Card[] {
  const evo = pendingEvolution(w);
  const out: Card[] = [];
  if (evo && CFG.evolution.forceTopSlot) out.push(evoCard(evo));

  const lowHp = w.player.hp / w.player.maxHp <= CFG.card.lowHpRatio;
  const activeFull = w.actives.length >= CFG.slots.active;
  const passiveFull = w.passives.length >= CFG.slots.passive;
  const newRate = w.player.level >= 10 ? CFG.card.newSkillRateAfterLv10 : 1;

  // 최근 2회 연속으로 나온 카드는 제외 (§7 추첨 규칙 4)
  const last = history.slice(-(CFG.card.noRepeat - 1));
  const blocked = new Set<SkillId>();
  if (last.length === CFG.card.noRepeat - 1) {
    for (const id of last[0]) if (last.every((h) => h.includes(id))) blocked.add(id);
  }

  const pool: Choice[] = [];

  for (const id of ACTIVE_IDS) {
    if (blocked.has(id)) continue;
    const slot = w.actives.find((s) => s.id === id);
    if (slot) {
      if (slot.lv >= CFG.evolution.maxSkillLv || slot.evo) continue;
      pool.push({ card: activeCard(id, slot.lv), weight: 1.2 });
    } else if (!activeFull) {
      pool.push({ card: activeCard(id, 0), weight: 1.6 * newRate });
    }
  }

  for (const id of PASSIVE_IDS) {
    if (blocked.has(id)) continue;
    const slot = w.passives.find((p) => p.id === id);
    const rescue = lowHp && RESCUE_PASSIVES.includes(id) ? CFG.card.lowHpWeight : 1;
    if (slot) {
      if (slot.lv >= CFG.evolution.maxSkillLv) continue;
      pool.push({ card: passiveCard(id, slot.lv), weight: 0.9 * rescue });
    } else if (!passiveFull) {
      pool.push({ card: passiveCard(id, 0), weight: 1.0 * newRate * rescue });
    }
  }

  // Lv6 이전에는 신규 액티브를 최소 1장 보장 (§7 추첨 규칙 2)
  if (w.player.level < CFG.card.newActiveBeforeLv && !activeFull && out.length < CFG.card.choices) {
    const news = pool.filter((c) => c.card.kind === "new-active");
    if (news.length > 0) {
      const pick = news[Math.floor(w.rand() * news.length)];
      out.push(pick.card);
    }
  }

  while (out.length < CFG.card.choices && pool.length > 0) {
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

/** 카드 적용 */
export function applyCard(w: World, card: Card): void {
  if (card.kind === "evolution") {
    const id = card.id as EvoId;
    const def = EVOLUTIONS[id];
    const slot = w.actives.find((s) => s.id === def.base);
    if (slot) slot.evo = id;
    w.evolutions.push(id);
    w.run.evolutions += 1;
    w.freeze = CFG.feedback.evoFreezeSec;
    w.flash = Math.max(w.flash, 0.2);
    pushLog(w, "EVO", `⭐ ${def.name} 진화 완료`);
    w.banner = { text: `⭐ ${def.name}`, sub: "진화", until: w.t + 2 };
    recalcStats(w);
    return;
  }

  if (card.kind === "new-active" || card.kind === "up-active") {
    const id = card.id as ActiveId;
    const slot = w.actives.find((s) => s.id === id);
    if (slot) slot.lv = Math.min(CFG.evolution.maxSkillLv, slot.lv + 1);
    else w.actives.push({ id, lv: 1, evo: null, cd: 0 });
    pushLog(w, "INFO", `${ACTIVES[id].emoji} ${ACTIVES[id].name} ${slot ? `Lv${slot.lv}` : "획득"}`);
    return;
  }

  const id = card.id as PassiveId;
  const slot = w.passives.find((p) => p.id === id);
  if (slot) slot.lv = Math.min(CFG.evolution.maxSkillLv, slot.lv + 1);
  else w.passives.push({ id, lv: 1 });
  recalcStats(w);
  pushLog(w, "INFO", `${PASSIVES[id].emoji} ${PASSIVES[id].name} ${slot ? `Lv${slot.lv}` : "획득"}`);
}

/** 결과 화면·서버 meta 에 쓰는 빌드 요약 (§11.3) */
export function buildSummary(w: World): string[] {
  const out: string[] = [];
  for (const id of w.evolutions) out.push(id);
  for (const s of w.actives) if (!s.evo) out.push(`${s.id}:${s.lv}`);
  for (const p of w.passives) out.push(`${p.id}:${p.lv}`);
  return out;
}
