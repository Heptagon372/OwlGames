// 월드 = 구조체 배열(SoA) + 오브젝트 풀 (기획서 §12).
// 런 중에는 절대 new 하지 않는다 — 모든 배열은 여기서 한 번만 할당한다.

import { CFG, stageById, xpToNext, type StageId } from "../config";
import { stageFromRatio, stageMult } from "@/lib/stages";
import type { BulletKind, EnemyKind, PassiveId, PlayerState, RunStats, Stats, WeaponState } from "../types";
import { createGrid, queryGrid, rebuildGrid, type Grid } from "./spatial";

export const ENEMY_KINDS: EnemyKind[] = ["bug", "worm", "trojan", "botnet", "ransom", "elite", "boss"];
export const BULLET_KINDS: BulletKind[] = ["feather", "laser", "orbit", "ddos", "explosion", "spike"];

export type EnemyPool = {
  cap: number;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  hp: Float32Array;
  maxHp: Float32Array;
  r: Float32Array;
  dmg: Float32Array;
  speed: Float32Array;
  kind: Uint8Array;
  alive: Uint8Array;
  /** 개체별 위상 (지그재그·보스 패턴용) */
  phase: Float32Array;
  /** 피격 반짝임 */
  flash: Float32Array;
  xp: Uint8Array;
};

export type BulletPool = {
  cap: number;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  life: Float32Array;
  dmg: Float32Array;
  r: Float32Array;
  kind: Uint8Array;
  pierce: Int8Array;
  alive: Uint8Array;
  /** 회전 무기(위성)·지속 장판의 각도·타이머 */
  phase: Float32Array;
  /** 같은 적을 연속 타격하지 않도록 하는 쿨다운 */
  hitCd: Float32Array;
  owner: Int8Array;
};

export type OrbPool = {
  cap: number;
  x: Float32Array;
  y: Float32Array;
  value: Float32Array;
  alive: Uint8Array;
  /** 자석에 끌려가는 속도 */
  vx: Float32Array;
  vy: Float32Array;
};

export type ParticlePool = {
  cap: number;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  life: Float32Array;
  max: Float32Array;
  r: Float32Array;
  color: Uint8Array;
  alive: Uint8Array;
};

/** 바닥 장판 (하니팟 폭발·보스 장판) */
export type HazardPool = {
  cap: number;
  x: Float32Array;
  y: Float32Array;
  r: Float32Array;
  life: Float32Array;
  dps: Float32Array;
  owner: Int8Array; // 0 = 플레이어, 1 = 적
  alive: Uint8Array;
};

export type Banner = { text: string; sub?: string; until: number } | null;

export type World = {
  t: number;
  stage: StageId;
  rand: () => number;
  player: PlayerState;
  stats: Stats;
  run: RunStats;
  weapons: WeaponState[];
  passives: Partial<Record<PassiveId, number>>;
  enemies: EnemyPool;
  bullets: BulletPool;
  orbs: OrbPool;
  parts: ParticlePool;
  hazards: HazardPool;
  grid: Grid;
  banner: Banner;
  /** 레벨업 대기 횟수 (카드 선택 동안 게임 정지) */
  pendingLevelUps: number;
  zone: number;
  /** 보스 엔티티 index (-1 = 없음) */
  bossIndex: number;
  /** 스폰 예산 누적 */
  spawnAcc: number;
  eliteTimer: number;
  shake: number;
  flash: number;
  /** 현재 단계 (1~15, 공통 단계 체계) */
  stage15: number;
  /** 이번 런에서 도달한 최고 단계 */
  stageMax: number;
  /** 저사양 모드 */
  lowSpec: boolean;
  over: boolean;
  cleared: boolean;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createWorld(seed: number, stage: StageId): World {
  const P = CFG.pool;
  const enemies: EnemyPool = {
    cap: P.enemies,
    x: new Float32Array(P.enemies),
    y: new Float32Array(P.enemies),
    vx: new Float32Array(P.enemies),
    vy: new Float32Array(P.enemies),
    hp: new Float32Array(P.enemies),
    maxHp: new Float32Array(P.enemies),
    r: new Float32Array(P.enemies),
    dmg: new Float32Array(P.enemies),
    speed: new Float32Array(P.enemies),
    kind: new Uint8Array(P.enemies),
    alive: new Uint8Array(P.enemies),
    phase: new Float32Array(P.enemies),
    flash: new Float32Array(P.enemies),
    xp: new Uint8Array(P.enemies),
  };
  const bullets: BulletPool = {
    cap: P.bullets,
    x: new Float32Array(P.bullets),
    y: new Float32Array(P.bullets),
    vx: new Float32Array(P.bullets),
    vy: new Float32Array(P.bullets),
    life: new Float32Array(P.bullets),
    dmg: new Float32Array(P.bullets),
    r: new Float32Array(P.bullets),
    kind: new Uint8Array(P.bullets),
    pierce: new Int8Array(P.bullets),
    alive: new Uint8Array(P.bullets),
    phase: new Float32Array(P.bullets),
    hitCd: new Float32Array(P.bullets),
    owner: new Int8Array(P.bullets),
  };
  const orbs: OrbPool = {
    cap: P.orbs,
    x: new Float32Array(P.orbs),
    y: new Float32Array(P.orbs),
    value: new Float32Array(P.orbs),
    alive: new Uint8Array(P.orbs),
    vx: new Float32Array(P.orbs),
    vy: new Float32Array(P.orbs),
  };
  const parts: ParticlePool = {
    cap: P.particles,
    x: new Float32Array(P.particles),
    y: new Float32Array(P.particles),
    vx: new Float32Array(P.particles),
    vy: new Float32Array(P.particles),
    life: new Float32Array(P.particles),
    max: new Float32Array(P.particles),
    r: new Float32Array(P.particles),
    color: new Uint8Array(P.particles),
    alive: new Uint8Array(P.particles),
  };
  const hazards: HazardPool = {
    cap: P.hazards,
    x: new Float32Array(P.hazards),
    y: new Float32Array(P.hazards),
    r: new Float32Array(P.hazards),
    life: new Float32Array(P.hazards),
    dps: new Float32Array(P.hazards),
    owner: new Int8Array(P.hazards),
    alive: new Uint8Array(P.hazards),
  };

  return {
    t: 0,
    stage,
    rand: mulberry32(seed),
    player: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      hp: CFG.player.hp,
      maxHp: CFG.player.hp,
      level: 1,
      xp: 0,
      xpNext: xpToNext(1),
      iframe: 0,
      slow: 0,
      invuln: 0,
    },
    stats: {
      damage: 1,
      cooldown: 1,
      projSpeed: 1,
      projExtra: 0,
      magnet: CFG.player.magnet,
      speed: CFG.player.speed,
      dmgTaken: 1,
    },
    run: {
      kills: 0,
      eliteKills: 0,
      bossKilled: false,
      damageTaken: 0,
      evolutions: 0,
      zonesCleared: 0,
      owlEnergyFound: false,
    },
    weapons: [{ id: "feather", level: 1, cd: 0, evolved: null, ammo: 0 }],
    passives: {},
    enemies,
    bullets,
    orbs,
    parts,
    hazards,
    grid: createGrid(P.enemies),
    banner: null,
    pendingLevelUps: 0,
    zone: 0,
    bossIndex: -1,
    spawnAcc: 0,
    eliteTimer: 30,
    shake: 0,
    flash: 0,
    stage15: 1,
    stageMax: 1,
    lowSpec: false,
    over: false,
    cleared: false,
  };
}

/* ── 풀 조작 ─────────────────────────────────────────── */

function freeSlot(alive: Uint8Array): number {
  for (let i = 0; i < alive.length; i++) if (!alive[i]) return i;
  return -1;
}

export type EnemySpec = { hp: number; speed: number; r: number; dmg: number; xp: number };

export function spawnEnemy(w: World, kind: EnemyKind, x: number, y: number, spec: EnemySpec): number {
  const e = w.enemies;
  const i = freeSlot(e.alive);
  if (i < 0) return -1;
  const st = stageById(w.stage);
  // 난이도 = 모드 배율 × 단계 배율 (단계마다 곱으로 어려워진다).
  // 보스만 예외 — 15초 안에 잡으라고 만든 체력이라 단계 배율까지 곱하면 절대 못 잡는다.
  const sm = kind === "boss" ? 1 : stageMult(w.stage15);
  e.alive[i] = 1;
  e.kind[i] = ENEMY_KINDS.indexOf(kind);
  e.x[i] = x;
  e.y[i] = y;
  e.vx[i] = 0;
  e.vy[i] = 0;
  e.hp[i] = spec.hp * st.hpMult * sm;
  e.maxHp[i] = e.hp[i];
  e.speed[i] = spec.speed * st.speedMult * (1 + (sm - 1) * 0.25);
  e.r[i] = spec.r;
  e.dmg[i] = spec.dmg;
  e.xp[i] = spec.xp;
  e.phase[i] = w.rand() * Math.PI * 2;
  e.flash[i] = 0;
  return i;
}

export function spawnBullet(
  w: World,
  kind: BulletKind,
  x: number,
  y: number,
  vx: number,
  vy: number,
  dmg: number,
  life: number,
  r: number,
  pierce = 0,
): number {
  const b = w.bullets;
  const i = freeSlot(b.alive);
  if (i < 0) return -1;
  b.alive[i] = 1;
  b.kind[i] = BULLET_KINDS.indexOf(kind);
  b.x[i] = x;
  b.y[i] = y;
  b.vx[i] = vx;
  b.vy[i] = vy;
  b.dmg[i] = dmg;
  b.life[i] = life;
  b.r[i] = r;
  b.pierce[i] = pierce;
  b.phase[i] = 0;
  b.hitCd[i] = 0;
  b.owner[i] = 0;
  return i;
}

export function spawnOrb(w: World, x: number, y: number, value: number): void {
  const o = w.orbs;
  let i = freeSlot(o.alive);
  if (i < 0) {
    // 화면에 너무 많으면 가장 오래된 것에 합친다 (§12 자동 병합)
    i = 0;
    o.value[i] += value;
    return;
  }
  o.alive[i] = 1;
  o.x[i] = x;
  o.y[i] = y;
  o.value[i] = value;
  o.vx[i] = 0;
  o.vy[i] = 0;
}

export function spawnParticle(w: World, x: number, y: number, vx: number, vy: number, life: number, color: number, r: number): void {
  if (w.lowSpec && w.rand() < 0.5) return;
  const p = w.parts;
  const i = freeSlot(p.alive);
  if (i < 0) return;
  p.alive[i] = 1;
  p.x[i] = x;
  p.y[i] = y;
  p.vx[i] = vx;
  p.vy[i] = vy;
  p.life[i] = life;
  p.max[i] = life;
  p.color[i] = color;
  p.r[i] = r;
}

export function spawnHazard(w: World, x: number, y: number, r: number, life: number, dps: number, owner: 0 | 1): void {
  const h = w.hazards;
  const i = freeSlot(h.alive);
  if (i < 0) return;
  h.alive[i] = 1;
  h.x[i] = x;
  h.y[i] = y;
  h.r[i] = r;
  h.life[i] = life;
  h.dps[i] = dps;
  h.owner[i] = owner;
}

export function burst(w: World, x: number, y: number, count: number, color: number, speed = 160): void {
  const n = w.lowSpec ? Math.ceil(count / 2) : count;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + w.rand();
    const s = speed * (0.4 + w.rand());
    spawnParticle(w, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.35 + w.rand() * 0.25, color, 2 + w.rand() * 2);
  }
}

/* ── 조회 ────────────────────────────────────────────── */

export function refreshGrid(w: World): void {
  rebuildGrid(w.grid, w.enemies.cap, w.enemies.x, w.enemies.y, w.enemies.alive);
}

/** 반경 안의 적을 훑는다 (실제 거리 검사 포함) */
export function forEachEnemyNear(w: World, x: number, y: number, radius: number, fn: (i: number, dist: number) => void): void {
  const e = w.enemies;
  const r2 = radius * radius;
  queryGrid(w.grid, x, y, radius, (i) => {
    if (!e.alive[i]) return;
    const dx = e.x[i] - x;
    const dy = e.y[i] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= r2) fn(i, Math.sqrt(d2));
  });
}

/** 가장 가까운 적 (없으면 -1) */
export function nearestEnemy(w: World, x: number, y: number, maxDist = 900): number {
  const e = w.enemies;
  let best = -1;
  let bestD = maxDist * maxDist;
  for (let i = 0; i < e.cap; i++) {
    if (!e.alive[i]) continue;
    const dx = e.x[i] - x;
    const dy = e.y[i] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) {
      bestD = d2;
      best = i;
    }
  }
  return best;
}

export function aliveEnemies(w: World): number {
  let n = 0;
  const e = w.enemies;
  for (let i = 0; i < e.cap; i++) if (e.alive[i]) n++;
  return n;
}

/** 적에게 피해. 처치하면 true */
export function damageEnemy(w: World, i: number, dmg: number): boolean {
  const e = w.enemies;
  if (!e.alive[i]) return false;
  e.hp[i] -= dmg;
  e.flash[i] = 0.12;
  if (e.hp[i] > 0) return false;

  e.alive[i] = 0;
  const kind = ENEMY_KINDS[e.kind[i]];
  w.run.kills += 1;
  spawnOrb(w, e.x[i], e.y[i], e.xp[i]);
  burst(w, e.x[i], e.y[i], kind === "boss" ? 40 : 8, 1);
  if (kind === "elite") w.run.eliteKills += 1;
  if (kind === "boss") {
    w.run.bossKilled = true;
    w.bossIndex = -1;
    w.shake = 0.8;
  }
  return true;
}

/** 경과 시간 → 현재 단계 (1~15) */
export function runStage(w: World): number {
  return stageFromRatio(w.t / CFG.runSec);
}

export function healPlayer(w: World, amount: number): void {
  w.player.hp = Math.min(w.player.maxHp, w.player.hp + amount);
}
