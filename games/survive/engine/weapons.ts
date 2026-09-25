// 무기 8종 + 진화체 8종 (기획서 §6).
// 규칙: update* 안에서는 할당 금지 — 방문자 클로저는 모듈 로드 때 한 번만 만들고 스크래치 변수를 공유한다.
//
// 피해 적용 경계 (루프와의 계약):
//  - 날아가는 탄(feather·laser·ddos·spike·orbit)은 dmg를 실어 보내고 **충돌 판정은 게임 루프**가 한다.
//  - 즉발 광역(방화벽 틱·하니팟 폭발·백신·로그 폭탄)은 여기서 damageEnemy로 직접 처리한다.
//  - 하니팟은 owner 0 장판으로 설치되고, 루프가 life를 깎아 0에 가까워지면 여기서 기폭시킨다.

import { CFG } from "../config";
import type { EvolvedId, PassiveId, WeaponId, WeaponState } from "../types";
import {
  BULLET_KINDS,
  burst,
  damageEnemy,
  ENEMY_KINDS,
  forEachEnemyNear,
  healPlayer,
  nearestEnemy,
  spawnBullet,
  spawnHazard,
  type World,
} from "./world";
import { onEnemyDeath } from "./enemies";

/** 카드·HUD에 쓰는 한국어 정보 + 진화 짝 (§6 표) */
export const WEAPON_INFO: Record<
  WeaponId,
  { label: string; emoji: string; desc: string; pair: PassiveId; evolved: EvolvedId; evolvedLabel: string; evolvedDesc: string }
> = {
  feather: {
    label: "깃털 표창",
    emoji: "🪶",
    desc: "가장 가까운 적에게 자동 발사",
    pair: "ram",
    evolved: "feather_storm",
    evolvedLabel: "깃털 폭풍",
    evolvedDesc: "8방향으로 쉬지 않고 난사",
  },
  firewall: {
    label: "방화벽",
    emoji: "🛡️",
    desc: "주변 원형 장판이 지속 피해",
    pair: "firewall_thick",
    evolved: "zero_trust",
    evolvedLabel: "제로 트러스트",
    evolvedDesc: "반경 2배 + 적을 밀어낸다",
  },
  sniffer: {
    label: "패킷 스니퍼",
    emoji: "📡",
    desc: "직선으로 관통하는 레이저",
    pair: "bandwidth",
    evolved: "backbone",
    evolvedLabel: "백본 레이저",
    evolvedDesc: "화면을 관통하고 화상을 남긴다",
  },
  portscan: {
    label: "포트 스캐너",
    emoji: "🛰️",
    desc: "주위를 도는 위성 2개",
    pair: "core",
    evolved: "botnet_orbital",
    evolvedLabel: "봇넷 오비탈",
    evolvedDesc: "위성 6개 + 적을 빨아들인다",
  },
  honeypot: {
    label: "하니팟",
    emoji: "🍯",
    desc: "바닥에 설치해 적을 유인 후 폭발",
    pair: "magnet",
    evolved: "honey_cluster",
    evolvedLabel: "허니 클러스터",
    evolvedDesc: "연쇄 폭발로 번진다",
  },
  vaccine: {
    label: "백신",
    emoji: "💉",
    desc: "주기적으로 회복하고 주변에 피해",
    pair: "ram",
    evolved: "auto_immune",
    evolvedLabel: "자동 면역",
    evolvedDesc: "회복량 2배 + 무적 0.5초",
  },
  ddos: {
    label: "디도스",
    emoji: "⚡",
    desc: "무작위 방향으로 초당 2발",
    pair: "cpu",
    evolved: "volumetric",
    evolvedLabel: "볼류메트릭",
    evolvedDesc: "사방으로 탄막을 퍼붓는다",
  },
  logbomb: {
    label: "로그 폭탄",
    emoji: "🧨",
    desc: "40킬마다 화면 전체 폭발",
    pair: "core",
    evolved: "kernel_panic",
    evolvedLabel: "커널 패닉",
    evolvedDesc: "20킬마다 폭발 + 화면 정지",
  },
};

/** 레벨 1~5 공통 스케일 (§6 — 무기별 수치는 TUNE) */
const LEVEL = { dmgStep: 0.25, cdStep: 0.08, minCd: 0.06 } as const;

/** 화면 절반 대각선 = 로그 폭탄 "화면 전체" 반경 */
const SCREEN_R = Math.sqrt(CFG.view.w * CFG.view.w + CFG.view.h * CFG.view.h) / 2;

/** 파티클 색 슬롯 (render.ts 팔레트 index) */
const COLOR = { hit: 1, heal: 2, fire: 3, spark: 4 } as const;

/** 위성은 매 프레임 되살리므로 수명은 짧게 잡는다 */
const ORBIT_LIFE = 0.2;
const ORBIT_PIERCE = 127;
const K_ORBIT = BULLET_KINDS.indexOf("orbit");
const K_BOSS = ENEMY_KINDS.indexOf("boss");

/** 무기별 튜닝 — 기획서에 없는 수치는 전부 여기서 정한다 */
const TUNE = {
  /** 🪶 깃털 표창 — 1발 / 0.8초 */
  feather: { cd: 0.8, dmg: 11, speed: 430, life: 1.1, r: 6, pierce: 0, extraEvery: 2, spread: 0.13, stormRays: 8, stormSpin: 1.1 },
  /** 🛡️ 방화벽 — 반경 70px 지속 피해 */
  firewall: { tick: 0.22, dps: 13, r0: 70, rStep: 14, evoMult: 2, knock: 320 },
  /** 📡 패킷 스니퍼 — 1.4초마다 관통 레이저 */
  sniffer: {
    cd: 1.4,
    dmg: 24,
    speed: 720,
    life: 0.85,
    r: 10,
    pierce: 99,
    spread: 0.2,
    evoSpeed: 1.5,
    evoLife: 1.9,
    burnCount: 2,
    burnGap: 150,
    burnR: 34,
    burnLife: 1.6,
    burnRatio: 0.3,
  },
  /** 🛰️ 포트 스캐너 — 위성 2개 */
  portscan: { dmg: 9, n0: 2, nEvo: 6, extraEvery: 2, orbit: 88, orbitStep: 7, spin: 2.4, evoSpin: 1.3, r: 13, pullR: 150, pull: 70 },
  /** 🍯 하니팟 — 3초마다 설치 */
  honeypot: {
    cd: 3,
    dmg: 30,
    place: 95,
    lureR: 44,
    lureDps: 4,
    fuse: 1.5,
    detonateAt: 0.1,
    blast: 115,
    blastStep: 8,
    chain: 2,
    chainFalloff: 0.55,
    chainMin: 1.5,
    chainFuse: 0.45,
    chainOffset: 90,
  },
  /** 💉 백신 — 8초마다 */
  vaccine: { cd: 8, dmg: 20, heal: 12, healStep: 3, r: 150, rStep: 12, evoHeal: 2, evoInvuln: 0.5 },
  /** ⚡ 디도스 — 초당 2발 */
  ddos: { cd: 0.5, dmg: 8, speed: 340, life: 1, r: 5, extraEvery: 2, evoRays: 8, evoSpin: 0.7 },
  /** 🧨 로그 폭탄 — 40킬마다 */
  logbomb: { dmg: 70, kills0: 40, killsStep: 4, killsEvo: 20, knock: 220, flash: 0.9, shake: 0.5 },
} as const;

/* ── 공통 계산 ───────────────────────────────────────── */

/** 무기 레벨·패시브를 반영한 피해량 */
export function weaponDamage(w: World, base: number, level: number): number {
  return base * (1 + (level - 1) * LEVEL.dmgStep) * w.stats.damage;
}

/** 무기 레벨·CPU 클럭 패시브를 반영한 쿨다운 */
export function weaponCooldown(w: World, base: number, level: number): number {
  return Math.max(LEVEL.minCd, base * (1 - (level - 1) * LEVEL.cdStep) * w.stats.cooldown);
}

/** 방화벽 장판 반경 — 렌더·HUD가 같은 값을 쓰도록 노출한다 */
export function firewallRadius(ws: WeaponState): number {
  const T = TUNE.firewall;
  return (T.r0 + T.rStep * (ws.level - 1)) * (ws.evolved === "zero_trust" ? T.evoMult : 1);
}

/* ── 광역 피해 (모듈 스코프 방문자) ──────────────────── */

let aoeW: World | null = null;
let aoeX = 0;
let aoeY = 0;
let aoeDmg = 0;
let aoeKnock = 0;

const aoeVisit = (i: number, dist: number): void => {
  const w = aoeW;
  if (!w) return;
  const e = w.enemies;
  if (!e.alive[i]) return;
  if (aoeKnock !== 0) {
    const d = dist > 0.001 ? dist : 1;
    e.vx[i] += ((e.x[i] - aoeX) / d) * aoeKnock;
    e.vy[i] += ((e.y[i] - aoeY) / d) * aoeKnock;
  }
  if (damageEnemy(w, i, aoeDmg)) onEnemyDeath(w, ENEMY_KINDS[e.kind[i]], e.x[i], e.y[i]);
};

/** 반경 안 전부에 즉발 피해 (+선택적 넉백) */
function areaHit(w: World, x: number, y: number, radius: number, dmg: number, knock: number): void {
  aoeW = w;
  aoeX = x;
  aoeY = y;
  aoeDmg = dmg;
  aoeKnock = knock;
  forEachEnemyNear(w, x, y, radius, aoeVisit);
  aoeW = null;
}

let pullW: World | null = null;
let pullX = 0;
let pullY = 0;
let pullPower = 0;

const pullVisit = (i: number, dist: number): void => {
  const w = pullW;
  if (!w) return;
  const e = w.enemies;
  if (!e.alive[i] || e.kind[i] === K_BOSS) return;
  const d = dist > 0.001 ? dist : 1;
  e.vx[i] += ((pullX - e.x[i]) / d) * pullPower;
  e.vy[i] += ((pullY - e.y[i]) / d) * pullPower;
};

/** 🛰️ 봇넷 오비탈 "흡수" — 주변 적을 위성 궤도 쪽으로 끌어당긴다 */
function areaPull(w: World, x: number, y: number, radius: number, power: number): void {
  pullW = w;
  pullX = x;
  pullY = y;
  pullPower = power;
  forEachEnemyNear(w, x, y, radius, pullVisit);
  pullW = null;
}

/** 각도 angle을 중심으로 count발을 부채꼴로 발사 */
function fanFire(
  w: World,
  kind: "feather" | "laser" | "ddos",
  angle: number,
  count: number,
  spread: number,
  speed: number,
  life: number,
  r: number,
  dmg: number,
  pierce: number,
): void {
  const px = w.player.x;
  const py = w.player.y;
  for (let k = 0; k < count; k++) {
    const a = angle + (k - (count - 1) / 2) * spread;
    spawnBullet(w, kind, px, py, Math.cos(a) * speed, Math.sin(a) * speed, dmg, life, r, pierce);
  }
}

/* ── 무기별 갱신 ─────────────────────────────────────── */

/** 🪶 깃털 표창 — 가장 가까운 적에게 자동 발사 / 진화: 8방향 난사 */
function updateFeather(w: World, ws: WeaponState, dt: number): void {
  const T = TUNE.feather;
  if (ws.cd > 0) {
    ws.cd -= dt;
    return;
  }
  const dmg = weaponDamage(w, T.dmg, ws.level);
  const speed = T.speed * w.stats.projSpeed;
  const life = T.life * w.stats.projSpeed;

  if (ws.evolved === "feather_storm") {
    ws.ammo += T.stormSpin;
    for (let k = 0; k < T.stormRays; k++) {
      const a = ws.ammo + (Math.PI * 2 * k) / T.stormRays;
      spawnBullet(w, "feather", w.player.x, w.player.y, Math.cos(a) * speed, Math.sin(a) * speed, dmg, life, T.r, T.pierce);
    }
    ws.cd = weaponCooldown(w, T.cd, ws.level);
    return;
  }

  const target = nearestEnemy(w, w.player.x, w.player.y);
  if (target < 0) return; // 적이 없으면 쿨다운을 쓰지 않고 대기
  ws.cd = weaponCooldown(w, T.cd, ws.level);
  const a = Math.atan2(w.enemies.y[target] - w.player.y, w.enemies.x[target] - w.player.x);
  const n = 1 + Math.floor((ws.level - 1) / T.extraEvery) + w.stats.projExtra;
  fanFire(w, "feather", a, n, T.spread, speed, life, T.r, dmg, T.pierce);
}

/** 🛡️ 방화벽 — 주변 원형 장판 지속 피해 / 진화: 반경 2배 + 넉백 */
function updateFirewall(w: World, ws: WeaponState, dt: number): void {
  const T = TUNE.firewall;
  ws.cd -= dt;
  if (ws.cd > 0) return;
  // 고정 틱 — 누적분을 보정하되 큰 dt에서 음수로 밀리지 않게 한다
  ws.cd += T.tick;
  if (ws.cd <= 0) ws.cd = T.tick;
  const evo = ws.evolved === "zero_trust";
  areaHit(w, w.player.x, w.player.y, firewallRadius(ws), weaponDamage(w, T.dps, ws.level) * T.tick, evo ? T.knock : 0);
}

/** 📡 패킷 스니퍼 — 직선 관통 레이저 / 진화: 화면 관통 + 화상 */
function updateSniffer(w: World, ws: WeaponState, dt: number): void {
  const T = TUNE.sniffer;
  if (ws.cd > 0) {
    ws.cd -= dt;
    return;
  }
  const target = nearestEnemy(w, w.player.x, w.player.y);
  if (target < 0) return;
  ws.cd = weaponCooldown(w, T.cd, ws.level);

  const evo = ws.evolved === "backbone";
  const dmg = weaponDamage(w, T.dmg, ws.level);
  const speed = T.speed * w.stats.projSpeed * (evo ? T.evoSpeed : 1);
  const life = T.life * w.stats.projSpeed * (evo ? T.evoLife : 1);
  const a = Math.atan2(w.enemies.y[target] - w.player.y, w.enemies.x[target] - w.player.x);
  fanFire(w, "laser", a, 1 + w.stats.projExtra, T.spread, speed, life, T.r, dmg, T.pierce);

  if (!evo) return;
  // 화상: 빔이 지나간 자리에 짧게 남는 자국 (spike 탄, 제자리)
  const bx = Math.cos(a);
  const by = Math.sin(a);
  for (let k = 1; k <= T.burnCount; k++) {
    spawnBullet(
      w,
      "spike",
      w.player.x + bx * T.burnGap * k,
      w.player.y + by * T.burnGap * k,
      0,
      0,
      dmg * T.burnRatio,
      T.burnLife,
      T.burnR,
      ORBIT_PIERCE,
    );
  }
}

/** 🛰️ 포트 스캐너 — 주위를 도는 위성 / 진화: 위성 6개 + 흡수 */
function updatePortscan(w: World, ws: WeaponState, dt: number): void {
  const T = TUNE.portscan;
  const evo = ws.evolved === "botnet_orbital";
  const n = evo ? T.nEvo : T.n0 + Math.floor((ws.level - 1) / T.extraEvery) + w.stats.projExtra;
  const radius = (T.orbit + T.orbitStep * (ws.level - 1)) * w.stats.projSpeed;
  const dmg = weaponDamage(w, T.dmg, ws.level);
  ws.ammo += T.spin * (evo ? T.evoSpin : 1) * dt;

  const b = w.bullets;
  let found = 0;
  for (let i = 0; i < b.cap; i++) {
    if (!b.alive[i] || b.kind[i] !== K_ORBIT) continue;
    if (found >= n) {
      b.alive[i] = 0; // 레벨이 내려갈 일은 없지만 여분은 정리한다
      continue;
    }
    placeOrbit(w, i, found, n, radius, dmg, ws.ammo, T.r);
    found++;
  }
  while (found < n) {
    const i = spawnBullet(w, "orbit", w.player.x, w.player.y, 0, 0, dmg, ORBIT_LIFE, T.r, ORBIT_PIERCE);
    if (i < 0) break;
    placeOrbit(w, i, found, n, radius, dmg, ws.ammo, T.r);
    found++;
  }
  if (evo) areaPull(w, w.player.x, w.player.y, radius + T.pullR, T.pull * dt);
}

/** 위성 한 개를 궤도 위에 올려 둔다 (속도 0 — 위치를 매 프레임 직접 쓴다) */
function placeOrbit(w: World, i: number, idx: number, n: number, radius: number, dmg: number, spin: number, r: number): void {
  const b = w.bullets;
  const a = spin + (Math.PI * 2 * idx) / n;
  b.x[i] = w.player.x + Math.cos(a) * radius;
  b.y[i] = w.player.y + Math.sin(a) * radius;
  b.vx[i] = 0;
  b.vy[i] = 0;
  b.dmg[i] = dmg;
  b.r[i] = r;
  b.life[i] = ORBIT_LIFE;
  b.pierce[i] = ORBIT_PIERCE;
  b.phase[i] = a;
}

/** 🍯 하니팟 — 설치 → 유인 → 폭발 / 진화: 연쇄 폭발 */
function updateHoneypot(w: World, ws: WeaponState, dt: number): void {
  const T = TUNE.honeypot;
  if (ws.cd > 0) ws.cd -= dt;
  else {
    const a = w.rand() * Math.PI * 2;
    const d = w.rand() * T.place;
    spawnHazard(w, w.player.x + Math.cos(a) * d, w.player.y + Math.sin(a) * d, T.lureR, T.fuse, T.lureDps, 0);
    ws.cd = weaponCooldown(w, T.cd, ws.level);
  }

  // 수명이 다 된 설치물을 기폭 (루프가 hazard.life를 깎아 준다)
  const h = w.hazards;
  const chain = ws.evolved === "honey_cluster";
  const blast = T.blast + T.blastStep * (ws.level - 1);
  const base = weaponDamage(w, T.dmg, ws.level);
  for (let i = 0; i < h.cap; i++) {
    if (!h.alive[i] || h.owner[i] !== 0 || h.life[i] > T.detonateAt) continue;
    const hx = h.x[i];
    const hy = h.y[i];
    const power = h.dps[i] / T.lureDps; // 연쇄 단계마다 줄어드는 위력
    h.alive[i] = 0;
    burst(w, hx, hy, 12, COLOR.fire);
    areaHit(w, hx, hy, blast * power, base * power, 0);
    if (!chain || h.dps[i] * T.chainFalloff < T.chainMin) continue;
    for (let k = 0; k < T.chain; k++) {
      const a = w.rand() * Math.PI * 2;
      spawnHazard(
        w,
        hx + Math.cos(a) * T.chainOffset,
        hy + Math.sin(a) * T.chainOffset,
        T.lureR,
        T.chainFuse,
        h.dps[i] * T.chainFalloff,
        0,
      );
    }
  }
}

/** 💉 백신 — 주기적 회복 + 주변 피해 / 진화: 회복 2배 + 무적 0.5초 */
function updateVaccine(w: World, ws: WeaponState, dt: number): void {
  const T = TUNE.vaccine;
  if (ws.cd > 0) {
    ws.cd -= dt;
    return;
  }
  ws.cd = weaponCooldown(w, T.cd, ws.level);
  const evo = ws.evolved === "auto_immune";
  healPlayer(w, (T.heal + T.healStep * (ws.level - 1)) * (evo ? T.evoHeal : 1));
  if (evo && w.player.invuln < T.evoInvuln) w.player.invuln = T.evoInvuln;
  const radius = T.r + T.rStep * (ws.level - 1);
  burst(w, w.player.x, w.player.y, 10, COLOR.heal);
  areaHit(w, w.player.x, w.player.y, radius, weaponDamage(w, T.dmg, ws.level), 0);
}

/** ⚡ 디도스 — 무작위 방향 난사 / 진화: 탄막 */
function updateDdos(w: World, ws: WeaponState, dt: number): void {
  const T = TUNE.ddos;
  if (ws.cd > 0) {
    ws.cd -= dt;
    return;
  }
  ws.cd = weaponCooldown(w, T.cd, ws.level);
  const dmg = weaponDamage(w, T.dmg, ws.level);
  const speed = T.speed * w.stats.projSpeed;
  const life = T.life * w.stats.projSpeed;

  if (ws.evolved === "volumetric") {
    ws.ammo += T.evoSpin;
    for (let k = 0; k < T.evoRays; k++) {
      const a = ws.ammo + (Math.PI * 2 * k) / T.evoRays;
      spawnBullet(w, "ddos", w.player.x, w.player.y, Math.cos(a) * speed, Math.sin(a) * speed, dmg, life, T.r, 0);
    }
    return;
  }

  const n = 1 + Math.floor((ws.level - 1) / T.extraEvery) + w.stats.projExtra;
  for (let k = 0; k < n; k++) {
    const a = w.rand() * Math.PI * 2;
    spawnBullet(w, "ddos", w.player.x, w.player.y, Math.cos(a) * speed, Math.sin(a) * speed, dmg, life, T.r, 0);
  }
}

/** 🧨 로그 폭탄 — 일정 킬마다 화면 전체 폭발 / 진화: 20킬마다 + 화면 정지 */
function updateLogbomb(w: World, ws: WeaponState): void {
  const T = TUNE.logbomb;
  const evo = ws.evolved === "kernel_panic";
  const need = evo ? T.killsEvo : Math.max(T.killsEvo, T.kills0 - T.killsStep * (ws.level - 1));
  if (ws.ammo <= 0) {
    ws.ammo = w.run.kills + need; // 획득 시점부터 카운트 시작
    return;
  }
  if (w.run.kills < ws.ammo) return;
  ws.ammo = w.run.kills + need;
  burst(w, w.player.x, w.player.y, 24, COLOR.spark, 320);
  areaHit(w, w.player.x, w.player.y, SCREEN_R, weaponDamage(w, T.dmg, ws.level), T.knock);
  w.flash = T.flash;
  w.shake = T.shake;
}

/** 모든 보유 무기의 쿨다운을 굴리고 발사한다 */
export function updateWeapons(w: World, dt: number): void {
  const list = w.weapons;
  for (let k = 0; k < list.length; k++) {
    const ws = list[k];
    switch (ws.id) {
      case "feather":
        updateFeather(w, ws, dt);
        break;
      case "firewall":
        updateFirewall(w, ws, dt);
        break;
      case "sniffer":
        updateSniffer(w, ws, dt);
        break;
      case "portscan":
        updatePortscan(w, ws, dt);
        break;
      case "honeypot":
        updateHoneypot(w, ws, dt);
        break;
      case "vaccine":
        updateVaccine(w, ws, dt);
        break;
      case "ddos":
        updateDdos(w, ws, dt);
        break;
      case "logbomb":
        updateLogbomb(w, ws);
        break;
    }
  }
}
