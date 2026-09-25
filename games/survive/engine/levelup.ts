// 패시브 7종 + 레벨업 카드 추첨 (기획서 §5 · §6 · §14).
// 레벨업은 게임이 멈춘 뒤에만 도는 차가운 경로라 배열·객체를 만들어도 된다 (핫 패스 아님).

import { CFG } from "../config";
import type { Card, PassiveId, WeaponId } from "../types";
import type { World } from "./world";
import { WEAPON_INFO } from "./weapons";

/** 카드·HUD에 쓰는 한국어 정보 (§6 패시브 표) */
export const PASSIVE_INFO: Record<PassiveId, { label: string; emoji: string; desc: string }> = {
  core: { label: "코어", emoji: "🧠", desc: "피해 +12%" },
  cpu: { label: "CPU 클럭", emoji: "⏱️", desc: "쿨다운 -8%" },
  ram: { label: "램", emoji: "💾", desc: "투사체 +1 (3레벨마다)" },
  bandwidth: { label: "대역폭", emoji: "📶", desc: "투사체 속도·사거리 +15%" },
  firewall_thick: { label: "방화벽 두께", emoji: "🧱", desc: "최대 체력 +20, 받는 피해 -5%" },
  magnet: { label: "자석", emoji: "🧲", desc: "XP 획득 반경 +30%" },
  boots: { label: "부츠", emoji: "👟", desc: "이동속도 +10%" },
};

/** 레벨당 효과 (§6) */
const PASSIVE = {
  damage: 0.12,
  cooldown: 0.08,
  /** 쿨다운·피해 감소가 0에 수렴하지 않도록 바닥을 둔다 */
  cooldownMin: 0.4,
  projEvery: 3,
  projSpeed: 0.15,
  maxHp: 20,
  dmgTaken: 0.05,
  dmgTakenMin: 0.5,
  magnet: 0.3,
  speed: 0.1,
} as const;

/** 카드 가중치 (§14) */
const WEIGHT = { newWeapon: 1.6, weaponUp: 1.2, newPassive: 1, passiveUp: 0.9 } as const;

/** §14-3 "Lv10 이후" — CFG에 없는 값이라 여기서 정한다 */
const NEW_WEAPON_LATE_LEVEL = 10;
/** ⭐ 진화 배너 노출 시간 */
const EVOLVE_BANNER_SEC = 2.5;
/** §14-5 구제 대상 — 체력이 낮으면 가중치 2배 */
const LOW_HP_WEAPON: WeaponId = "vaccine";
const LOW_HP_PASSIVE: PassiveId = "firewall_thick";

const WEAPON_IDS: WeaponId[] = ["feather", "firewall", "sniffer", "portscan", "honeypot", "vaccine", "ddos", "logbomb"];
const PASSIVE_IDS: PassiveId[] = ["core", "cpu", "ram", "bandwidth", "firewall_thick", "magnet", "boots"];

/* ── 패시브 → 스탯 ───────────────────────────────────── */

/** 패시브 → w.stats 재계산 (§6 패시브 표) */
export function applyPassives(w: World): void {
  const p = w.passives;
  const core = p.core ?? 0;
  const cpu = p.cpu ?? 0;
  const ram = p.ram ?? 0;
  const bandwidth = p.bandwidth ?? 0;
  const thick = p.firewall_thick ?? 0;
  const magnet = p.magnet ?? 0;
  const boots = p.boots ?? 0;

  w.stats.damage = 1 + PASSIVE.damage * core;
  w.stats.cooldown = Math.max(PASSIVE.cooldownMin, 1 - PASSIVE.cooldown * cpu);
  // "3레벨마다 +1" — Lv1에 이미 1발 늘고 Lv4에 2발이 된다
  w.stats.projExtra = Math.ceil(ram / PASSIVE.projEvery);
  w.stats.projSpeed = 1 + PASSIVE.projSpeed * bandwidth;
  w.stats.magnet = CFG.player.magnet * (1 + PASSIVE.magnet * magnet);
  w.stats.speed = CFG.player.speed * (1 + PASSIVE.speed * boots);
  w.stats.dmgTaken = Math.max(PASSIVE.dmgTakenMin, 1 - PASSIVE.dmgTaken * thick);

  // 최대 체력이 늘면 늘어난 만큼 바로 채워 준다 (같은 값으로 다시 호출해도 안전)
  const maxHp = CFG.player.hp + PASSIVE.maxHp * thick;
  const gained = maxHp - w.player.maxHp;
  w.player.maxHp = maxHp;
  if (gained > 0) w.player.hp = Math.min(maxHp, w.player.hp + gained);
  else if (w.player.hp > maxHp) w.player.hp = maxHp;
}

/* ── 진화 판정 (§6) ──────────────────────────────────── */

/** 진화 가능한 무기 (조건: 무기 Lv5 + 짝 패시브 Lv3 이상) */
export function evolvableWeapon(w: World): WeaponId | null {
  for (let i = 0; i < w.weapons.length; i++) {
    const ws = w.weapons[i];
    if (ws.evolved || ws.level < CFG.levelup.maxWeaponLevel) continue;
    const pair = WEAPON_INFO[ws.id].pair;
    if ((w.passives[pair] ?? 0) >= CFG.levelup.evolvePassiveLevel) return ws.id;
  }
  return null;
}

/* ── 카드 추첨 (§14) ─────────────────────────────────── */

type Cand = { key: string; weight: number; newWeapon: boolean; card: Card };

/** 동일 카드 연속 3회 등장 금지 (§14-4) — 직전 2회의 추첨 결과를 월드별로 기억한다 */
const recent = new WeakMap<World, { prev1: string[]; prev2: string[] }>();

function weaponCard(id: WeaponId, level: number): Card {
  const info = WEAPON_INFO[id];
  return {
    kind: "weapon",
    id,
    level,
    label: level === 1 ? info.label : `${info.label} Lv.${level}`,
    desc: info.desc,
    emoji: info.emoji,
  };
}

function passiveCard(id: PassiveId, level: number): Card {
  const info = PASSIVE_INFO[id];
  return {
    kind: "passive",
    id,
    level,
    label: level === 1 ? info.label : `${info.label} Lv.${level}`,
    desc: info.desc,
    emoji: info.emoji,
  };
}

function evolveCard(id: WeaponId): Card {
  const info = WEAPON_INFO[id];
  return { kind: "evolve", id, evolved: info.evolved, label: `⭐ ${info.evolvedLabel}`, desc: info.evolvedDesc, emoji: info.emoji };
}

/** 지금 뽑을 수 있는 모든 카드 (슬롯 제한·MAX 반영) */
function buildCandidates(w: World): Cand[] {
  const L = CFG.levelup;
  const lowHp = w.player.hp <= w.player.maxHp * L.lowHpRatio;
  const list: Cand[] = [];

  const owned: WeaponId[] = [];
  for (let i = 0; i < w.weapons.length; i++) {
    const ws = w.weapons[i];
    owned.push(ws.id);
    if (ws.evolved || ws.level >= L.maxWeaponLevel) continue;
    list.push({
      key: `weapon:${ws.id}`,
      weight: WEIGHT.weaponUp * (lowHp && ws.id === LOW_HP_WEAPON ? L.lowHpWeight : 1),
      newWeapon: false,
      card: weaponCard(ws.id, ws.level + 1),
    });
  }

  // 무기 슬롯이 남을 때만 신규 무기가 등장한다 (§5.1)
  if (w.weapons.length < L.weaponSlots) {
    for (const id of WEAPON_IDS) {
      if (owned.includes(id)) continue;
      list.push({
        key: `weapon:${id}`,
        weight: WEIGHT.newWeapon * (lowHp && id === LOW_HP_WEAPON ? L.lowHpWeight : 1),
        newWeapon: true,
        card: weaponCard(id, 1),
      });
    }
  }

  let used = 0;
  for (const id of PASSIVE_IDS) if ((w.passives[id] ?? 0) > 0) used++;
  const passiveFree = used < L.passiveSlots;
  for (const id of PASSIVE_IDS) {
    const lv = w.passives[id] ?? 0;
    if (lv >= L.maxPassiveLevel) continue;
    if (lv === 0 && !passiveFree) continue;
    list.push({
      key: `passive:${id}`,
      weight: (lv === 0 ? WEIGHT.newPassive : WEIGHT.passiveUp) * (lowHp && id === LOW_HP_PASSIVE ? L.lowHpWeight : 1),
      newWeapon: false,
      card: passiveCard(id, lv + 1),
    });
  }
  return list;
}

function pickWeighted(w: World, pool: Cand[]): number {
  let total = 0;
  for (const c of pool) total += c.weight;
  let r = w.rand() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= pool[i].weight;
    if (r <= 0) return i;
  }
  return pool.length - 1;
}

function fill(w: World, out: Card[], keys: string[], pool: Cand[], want: number): void {
  while (out.length < want && pool.length > 0) {
    const i = pickWeighted(w, pool);
    const c = pool[i];
    pool.splice(i, 1);
    if (keys.includes(c.key)) continue;
    out.push(c.card);
    keys.push(c.key);
  }
}

/** 레벨업 카드 3장 (§14 규칙) */
export function drawCards(w: World): Card[] {
  const want = CFG.levelup.cards;
  const out: Card[] = [];
  const keys: string[] = [];

  // 1. 진화 가능하면 1번 슬롯 고정 (§15-4: 100% 등장)
  const evolve = evolvableWeapon(w);
  if (evolve) {
    out.push(evolveCard(evolve));
    keys.push(`evolve:${evolve}`);
  }

  const all = buildCandidates(w);
  const hist = recent.get(w);
  // 3. Lv10 이후에는 신규 무기 확률 40%
  const dropNew = w.player.level >= NEW_WEAPON_LATE_LEVEL && w.rand() >= CFG.levelup.newWeaponChanceLate;

  const pool: Cand[] = [];
  for (const c of all) {
    // 4. 직전 2회 연속 등장한 카드는 이번에 빼서 3연속을 막는다
    if (hist && hist.prev1.includes(c.key) && hist.prev2.includes(c.key)) continue;
    if (dropNew && c.newWeapon) continue;
    pool.push(c);
  }

  // 2. Lv6 이전에는 신규 무기 1장 이상 보장
  if (w.player.level < CFG.levelup.newWeaponBelowLevel && out.length < want) {
    const news: Cand[] = [];
    for (const c of pool) if (c.newWeapon) news.push(c);
    if (news.length > 0) {
      const c = news[pickWeighted(w, news)];
      out.push(c.card);
      keys.push(c.key);
      pool.splice(pool.indexOf(c), 1);
    }
  }

  fill(w, out, keys, pool, want);
  // 금지 규칙 때문에 3장이 안 되면 규칙을 풀어서 채운다 (빈 슬롯보다 낫다)
  if (out.length < want) fill(w, out, keys, all.slice(), want);

  if (hist) {
    hist.prev2 = hist.prev1;
    hist.prev1 = keys;
  } else {
    recent.set(w, { prev1: keys, prev2: [] });
  }
  return out;
}

/* ── 카드 적용 ───────────────────────────────────────── */

/** 카드 적용 (무기 추가·강화, 패시브 강화, 진화) */
export function applyCard(w: World, card: Card): void {
  if (card.kind === "weapon") {
    for (let i = 0; i < w.weapons.length; i++) {
      if (w.weapons[i].id !== card.id) continue;
      w.weapons[i].level = Math.min(CFG.levelup.maxWeaponLevel, w.weapons[i].level + 1);
      return;
    }
    if (w.weapons.length < CFG.levelup.weaponSlots) {
      w.weapons.push({ id: card.id, level: 1, cd: 0, evolved: null, ammo: 0 });
    }
    return;
  }

  if (card.kind === "passive") {
    const lv = w.passives[card.id] ?? 0;
    w.passives[card.id] = Math.min(CFG.levelup.maxPassiveLevel, lv + 1);
    applyPassives(w);
    return;
  }

  for (let i = 0; i < w.weapons.length; i++) {
    const ws = w.weapons[i];
    if (ws.id !== card.id || ws.evolved) continue;
    ws.evolved = card.evolved;
    ws.level = CFG.levelup.maxWeaponLevel;
    ws.cd = 0;
    w.run.evolutions += 1;
    const info = WEAPON_INFO[card.id];
    w.banner = { text: `⭐ ${info.evolvedLabel}`, sub: info.evolvedDesc, until: w.t + EVOLVE_BANNER_SEC };
    w.flash = 1;
    return;
  }
}
