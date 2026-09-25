// 🦉 아울 서바이버즈 v2 — 월드 = 구조체 배열(SoA) + 오브젝트 풀 (기획서 §14)
// 런 중에는 절대 new 하지 않는다. 모든 배열은 createWorld 에서 한 번만 할당한다.

import { CFG, atkMult, hpMult, xpMult, xpToNext } from "../config";
import { THEMES, type Theme, type ThemeId } from "../theme";
import { ENEMY_SPEC, stageInfo, type EnemyKind, type StageInfo } from "../data/stages";
import { ENEMY_KINDS } from "../data/stages";
import { ACTIVE_IDS, applyPassives, baseStats, STARTER } from "../data/skills";
import { createGrid, queryGrid, rebuildGrid, type Grid } from "./spatial";
import type {
  ActiveId,
  DamageTag,
  EvoId,
  LogLine,
  LogTag,
  PassiveSlot,
  SkillSlot,
  Stats,
} from "../types";

/* ── 피해 태그 비트마스크 ─────────────────────────────────────── */
export const TAG = { physical: 1, electric: 2, explosion: 4, aoe: 8, pierce: 16 } as const;

export function tagMask(tags: DamageTag[]): number {
  let m = 0;
  for (const t of tags) m |= TAG[t];
  return m;
}

/* ── 풀 ─────────────────────────────────────────────────────── */

export type EnemyPool = {
  cap: number;
  alive: Uint8Array;
  kind: Uint8Array;
  x: Float32Array; y: Float32Array;
  vx: Float32Array; vy: Float32Array;
  hp: Float32Array; maxHp: Float32Array;
  speed: Float32Array; r: Float32Array; dmg: Float32Array; xp: Float32Array;
  sides: Uint8Array;
  flash: Float32Array;
  phase: Float32Array;
  /** 상태이상 남은 시간 */
  slowT: Float32Array; burnT: Float32Array; stunT: Float32Array; pullT: Float32Array; markT: Float32Array;
  burnDps: Float32Array;
  /** 보스·중간보스·엘리트 표시 */
  rank: Uint8Array;  // 0 잡몹 / 1 엘리트 / 2 중간보스 / 3 보스
  /** 은신(mimic·rootkit) 남은 시간 */
  hideT: Float32Array;
  /** 원거리 적의 사격 쿨다운 */
  shootCd: Float32Array;
};

export type BulletPool = {
  cap: number;
  alive: Uint8Array;
  x: Float32Array; y: Float32Array;
  vx: Float32Array; vy: Float32Array;
  dmg: Float32Array;
  life: Float32Array;
  pierce: Float32Array;
  r: Float32Array;
  tags: Uint8Array;
  /** 렌더 모양 0 깃털 / 1 레이저 / 2 빔 / 3 위성 / 4 탄막 / 5 부메랑 / 6 폭탄 / 7 적탄 */
  look: Uint8Array;
  /** 소속 액티브 슬롯 index (-1 = 적) */
  owner: Int16Array;
  /** 궤도·부메랑용 보조값 */
  aux: Float32Array;
  hostile: Uint8Array;
  status: Uint8Array;   // 0 없음 / 1 slow / 2 burn / 3 mark
};

export type OrbPool = {
  cap: number;
  alive: Uint8Array;
  x: Float32Array; y: Float32Array;
  vx: Float32Array; vy: Float32Array;
  value: Float32Array;
  /** 0 = XP / 1 = 체력 */
  kind: Uint8Array;
};

export type ParticlePool = {
  cap: number;
  alive: Uint8Array;
  x: Float32Array; y: Float32Array;
  vx: Float32Array; vy: Float32Array;
  life: Float32Array; max: Float32Array;
  r: Float32Array;
  color: Uint8Array;  // 팔레트 index
};

export type HazardPool = {
  cap: number;
  alive: Uint8Array;
  x: Float32Array; y: Float32Array;
  r: Float32Array;
  life: Float32Array; max: Float32Array;
  dps: Float32Array;
  tick: Float32Array;
  /** 0 플레이어 장판 / 1 적 장판 / 2 하니팟(폭발 예정) / 3 흡입 */
  kind: Uint8Array;
  owner: Int16Array;
  tags: Uint8Array;
};

export type ObstaclePool = {
  cap: number;
  alive: Uint8Array;
  x: Float32Array; y: Float32Array;
  w: Float32Array; h: Float32Array;
  hp: Float32Array; maxHp: Float32Array;
  kind: Uint8Array;  // 0 서버랙 / 1 박스 / 2 소화기 / 3 배선더미
  flash: Float32Array;
};

const f32 = (n: number) => new Float32Array(n);
const u8 = (n: number) => new Uint8Array(n);

function makeEnemies(cap: number): EnemyPool {
  return {
    cap, alive: u8(cap), kind: u8(cap), x: f32(cap), y: f32(cap), vx: f32(cap), vy: f32(cap),
    hp: f32(cap), maxHp: f32(cap), speed: f32(cap), r: f32(cap), dmg: f32(cap), xp: f32(cap),
    sides: u8(cap), flash: f32(cap), phase: f32(cap),
    slowT: f32(cap), burnT: f32(cap), stunT: f32(cap), pullT: f32(cap), markT: f32(cap),
    burnDps: f32(cap), rank: u8(cap), hideT: f32(cap), shootCd: f32(cap),
  };
}

function makeBullets(cap: number): BulletPool {
  return {
    cap, alive: u8(cap), x: f32(cap), y: f32(cap), vx: f32(cap), vy: f32(cap),
    dmg: f32(cap), life: f32(cap), pierce: f32(cap), r: f32(cap), tags: u8(cap),
    look: u8(cap), owner: new Int16Array(cap), aux: f32(cap), hostile: u8(cap), status: u8(cap),
  };
}

/* ── 월드 ───────────────────────────────────────────────────── */

export type Phase = "wave1" | "midboss" | "wave2" | "boss" | "over";

export type Player = {
  x: number; y: number;
  hp: number; maxHp: number;
  level: number; xp: number; xpNext: number;
  iframe: number;
  slow: number;
  /** P18 쉴드: 충전 시간 / 보유 여부 */
  noHitT: number; shield: boolean;
  invuln: number;
  dir: number;  // 마지막 이동 방향 (조준용)
  alive: boolean;
};

export type RunStats = {
  kills: number;
  midbossKilled: boolean;
  obstacles: number;
  damageTaken: number;
  revivesUsed: number;
  evolutions: number;
  hits: number;
};

export type World = {
  t: number;
  stage: number;
  info: StageInfo;
  theme: Theme;
  themeId: ThemeId;
  rand: () => number;
  reduced: boolean;

  player: Player;
  stats: Stats;
  actives: SkillSlot[];
  passives: PassiveSlot[];
  /** 이번 런에서 얻은 진화 (E12 처럼 액티브에 안 붙는 것도 있어서 따로 둔다) */
  evolutions: EvoId[];

  enemies: EnemyPool;
  bullets: BulletPool;
  orbs: OrbPool;
  particles: ParticlePool;
  hazards: HazardPool;
  obstacles: ObstaclePool;
  grid: Grid;

  boss: { idx: number; phase: number; timer: number; pattern: number; active: boolean; maxHp: number; spawned: boolean };
  midboss: { idx: number; active: boolean; spawned: boolean };

  phase: Phase;
  cleared: boolean;
  over: boolean;
  overReason: string;

  shake: number;
  shakePx: number;
  flash: number;
  freeze: number;
  vignette: number;

  log: LogLine[];
  banner: { text: string; sub: string; until: number } | null;

  run: RunStats;
  cam: { x: number; y: number };
  lowSpec: boolean;
  owlEnergyFound: boolean;
  frame: number;
};

export function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function createWorld(seed: number, stage: number, themeId: ThemeId, reduced = false): World {
  const info = stageInfo(stage);
  const stats = baseStats();
  const p = CFG.perf;
  const rand = makeRng(seed);

  // 시작 보정 (§DECISIONS) — 적 체력만 스테이지마다 오르면 시작 장비로는 길을 못 뚫는다.
  // 높은 스테이지일수록 "이전 스테이지를 클리어하고 온 부엉이"답게 더 갖추고 시작한다.
  const step = Math.floor((Math.max(1, stage) - 1) / CFG.stage.startLevelEvery);
  const startLv = Math.min(CFG.evolution.maxSkillLv, 1 + step);
  const extra = Math.floor((Math.max(1, stage) - 1) / CFG.stage.startSkillEvery);
  stats.maxHp += CFG.stage.startHpPerStage * (Math.max(1, stage) - 1);

  const actives: SkillSlot[] = [{ id: STARTER, lv: startLv, evo: null, cd: 0 }];
  const pool = ACTIVE_IDS.filter((id) => id !== STARTER);
  for (let k = 0; k < extra && k < CFG.slots.active - 1; k++) {
    const pick = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    if (pick) actives.push({ id: pick, lv: startLv, evo: null, cd: 0 });
  }

  return {
    t: 0,
    stage,
    info,
    theme: THEMES[themeId],
    themeId,
    rand,
    reduced,

    player: {
      x: CFG.arena.w / 2,
      y: CFG.arena.h / 2,
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      level: 1,
      xp: 0,
      xpNext: xpToNext(1),
      iframe: 0,
      slow: 0,
      noHitT: 0,
      shield: false,
      invuln: 0,
      dir: 0,
      alive: true,
    },
    stats,
    actives,
    passives: [],
    evolutions: [],

    enemies: makeEnemies(p.maxEnemies + 24),
    bullets: makeBullets(p.maxProjectiles),
    orbs: {
      cap: p.maxOrbs, alive: u8(p.maxOrbs), x: f32(p.maxOrbs), y: f32(p.maxOrbs),
      vx: f32(p.maxOrbs), vy: f32(p.maxOrbs), value: f32(p.maxOrbs), kind: u8(p.maxOrbs),
    },
    particles: {
      cap: p.maxParticles, alive: u8(p.maxParticles), x: f32(p.maxParticles), y: f32(p.maxParticles),
      vx: f32(p.maxParticles), vy: f32(p.maxParticles), life: f32(p.maxParticles),
      max: f32(p.maxParticles), r: f32(p.maxParticles), color: u8(p.maxParticles),
    },
    hazards: {
      cap: p.maxHazards, alive: u8(p.maxHazards), x: f32(p.maxHazards), y: f32(p.maxHazards),
      r: f32(p.maxHazards), life: f32(p.maxHazards), max: f32(p.maxHazards), dps: f32(p.maxHazards),
      tick: f32(p.maxHazards), kind: u8(p.maxHazards), owner: new Int16Array(p.maxHazards),
      tags: u8(p.maxHazards),
    },
    obstacles: {
      cap: p.maxObstacles, alive: u8(p.maxObstacles), x: f32(p.maxObstacles), y: f32(p.maxObstacles),
      w: f32(p.maxObstacles), h: f32(p.maxObstacles), hp: f32(p.maxObstacles),
      maxHp: f32(p.maxObstacles), kind: u8(p.maxObstacles), flash: f32(p.maxObstacles),
    },
    grid: createGrid(p.maxEnemies + 24),

    boss: { idx: -1, phase: 0, timer: 0, pattern: 0, active: false, maxHp: 0, spawned: false },
    midboss: { idx: -1, active: false, spawned: false },

    phase: "wave1",
    cleared: false,
    over: false,
    overReason: "",

    shake: 0,
    shakePx: 0,
    flash: 0,
    freeze: 0,
    vignette: 0,

    log: [],
    banner: null,

    run: { kills: 0, midbossKilled: false, obstacles: 0, damageTaken: 0, revivesUsed: 0, evolutions: 0, hits: 0 },
    cam: { x: CFG.arena.w / 2, y: CFG.arena.h / 2 },
    lowSpec: false,
    owlEnergyFound: false,
    frame: 0,
  };
}

/* ── 전투 로그 (§9.2) ───────────────────────────────────────── */

export function pushLog(w: World, tag: LogTag, text: string): void {
  w.log.push({ tag, text, t: w.t });
  if (w.log.length > CFG.feedback.logLines * 3) w.log.splice(0, w.log.length - CFG.feedback.logLines * 3);
}

/** 화면에 보일 최근 줄 (3초 후 페이드) */
export function visibleLog(w: World): LogLine[] {
  const out: LogLine[] = [];
  for (let i = w.log.length - 1; i >= 0 && out.length < CFG.feedback.logLines; i--) {
    if (w.t - w.log[i].t <= CFG.feedback.logFadeSec) out.push(w.log[i]);
  }
  return out.reverse();
}

/* ── 풀 할당 ────────────────────────────────────────────────── */

function freeSlot(alive: Uint8Array): number {
  for (let i = 0; i < alive.length; i++) if (!alive[i]) return i;
  return -1;
}

export function aliveEnemies(w: World): number {
  let n = 0;
  for (let i = 0; i < w.enemies.cap; i++) if (w.enemies.alive[i]) n++;
  return n;
}

export function enemyCap(w: World): number {
  return w.lowSpec ? CFG.perf.maxEnemiesLow : CFG.perf.maxEnemies;
}

export function spawnEnemy(w: World, kind: EnemyKind, x: number, y: number, rank = 0): number {
  const e = w.enemies;
  const i = freeSlot(e.alive);
  if (i < 0) return -1;
  const spec = ENEMY_SPEC[kind];
  const hm = hpMult(w.stage);
  const am = atkMult(w.stage);
  const fast = w.info.rule === "fast" ? 1.3 : 1;

  e.alive[i] = 1;
  e.kind[i] = ENEMY_KINDS.indexOf(kind);
  e.x[i] = x; e.y[i] = y;
  e.vx[i] = 0; e.vy[i] = 0;
  e.hp[i] = spec.hp * hm;
  e.maxHp[i] = e.hp[i];
  e.speed[i] = spec.speed * fast;
  e.r[i] = spec.r;
  e.dmg[i] = spec.dmg * am;
  e.xp[i] = spec.xp * xpMult(w.stage);
  e.sides[i] = spec.sides;
  e.flash[i] = 0;
  e.phase[i] = w.rand() * Math.PI * 2;
  e.slowT[i] = 0; e.burnT[i] = 0; e.stunT[i] = 0; e.pullT[i] = 0; e.markT[i] = 0;
  e.burnDps[i] = 0;
  e.rank[i] = rank;
  e.hideT[i] = 0;
  e.shootCd[i] = 1 + w.rand();
  return i;
}

export function spawnBullet(
  w: World,
  x: number, y: number, vx: number, vy: number,
  dmg: number, life: number, r: number, look: number, tags: number,
  opts?: { pierce?: number; owner?: number; aux?: number; hostile?: boolean; status?: number },
): number {
  const b = w.bullets;
  const i = freeSlot(b.alive);
  if (i < 0) return -1;
  b.alive[i] = 1;
  b.x[i] = x; b.y[i] = y; b.vx[i] = vx; b.vy[i] = vy;
  b.dmg[i] = dmg; b.life[i] = life; b.r[i] = r; b.look[i] = look; b.tags[i] = tags;
  b.pierce[i] = opts?.pierce ?? 0;
  b.owner[i] = opts?.owner ?? -1;
  b.aux[i] = opts?.aux ?? 0;
  b.hostile[i] = opts?.hostile ? 1 : 0;
  b.status[i] = opts?.status ?? 0;
  return i;
}

export function spawnOrb(w: World, x: number, y: number, value: number, kind = 0): number {
  const o = w.orbs;
  const i = freeSlot(o.alive);
  if (i < 0) return -1;
  o.alive[i] = 1;
  o.x[i] = x; o.y[i] = y; o.vx[i] = 0; o.vy[i] = 0;
  o.value[i] = value; o.kind[i] = kind;
  return i;
}

export function spawnParticle(w: World, x: number, y: number, vx: number, vy: number, life: number, r: number, color: number): void {
  if (w.reduced) return;
  const q = w.particles;
  const i = freeSlot(q.alive);
  if (i < 0) return;
  q.alive[i] = 1;
  q.x[i] = x; q.y[i] = y; q.vx[i] = vx; q.vy[i] = vy;
  q.life[i] = life; q.max[i] = life; q.r[i] = r; q.color[i] = color;
}

export function burst(w: World, x: number, y: number, n: number, color: number, power = 120): void {
  const count = w.lowSpec ? Math.ceil(n / 2) : n;
  for (let k = 0; k < count; k++) {
    const a = (Math.PI * 2 * k) / count + w.rand();
    const s = power * (0.4 + w.rand() * 0.8);
    spawnParticle(w, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.25 + w.rand() * 0.3, 2 + w.rand() * 2, color);
  }
}

export function spawnHazard(
  w: World, x: number, y: number, r: number, life: number, dps: number, kind: number,
  opts?: { owner?: number; tags?: number },
): number {
  const h = w.hazards;
  const i = freeSlot(h.alive);
  if (i < 0) return -1;
  h.alive[i] = 1;
  h.x[i] = x; h.y[i] = y; h.r[i] = r;
  h.life[i] = life; h.max[i] = life; h.dps[i] = dps; h.tick[i] = 0;
  h.kind[i] = kind;
  h.owner[i] = opts?.owner ?? -1;
  h.tags[i] = opts?.tags ?? TAG.aoe;
  return i;
}

/* ── 조회 ───────────────────────────────────────────────────── */

export function refreshGrid(w: World): void {
  rebuildGrid(w.grid, w.enemies.cap, w.enemies.x, w.enemies.y, w.enemies.alive);
}

export function forEachEnemyNear(w: World, x: number, y: number, r: number, visit: (i: number) => void): void {
  queryGrid(w.grid, x, y, r, visit);
}

/** 가장 가까운 적 (은신 중이면 제외) */
export function nearestEnemy(w: World, x: number, y: number, maxR = 900): number {
  let best = -1;
  let bd = maxR * maxR;
  const e = w.enemies;
  for (let i = 0; i < e.cap; i++) {
    if (!e.alive[i] || e.hideT[i] > 0) continue;
    const dx = e.x[i] - x;
    const dy = e.y[i] - y;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/* ── 피해 ───────────────────────────────────────────────────── */

/**
 * 적에게 피해. 치명타·속성 연계(§6.2)를 여기서 한 번에 처리한다.
 * 반환값은 "이 타격으로 죽었는가".
 */
export function damageEnemy(w: World, i: number, amount: number, tags: number, crit = true): boolean {
  const e = w.enemies;
  if (!e.alive[i] || amount <= 0) return false;

  let dmg = amount;

  // ❄️ 둔화 + ⚡ 전기 = ×2 (감전 증폭)
  if (e.slowT[i] > 0 && tags & TAG.electric) dmg *= 2;
  // 🕳️ 흡입 + 광역 = +50%
  if (e.pullT[i] > 0 && tags & TAG.aoe) dmg *= 1.5;

  // 🎯 표식 + 관통 = 치명타 확정
  let isCrit = false;
  if (e.markT[i] > 0 && tags & TAG.pierce) isCrit = true;
  else if (crit && w.rand() < w.stats.critRate) isCrit = true;
  if (isCrit) dmg *= w.stats.critDamage;

  e.hp[i] -= dmg;
  e.flash[i] = CFG.feedback.hitFlashSec;

  // 🔥 화상 + 💥 폭발 = 주변 3체로 확산
  if (e.burnT[i] > 0 && tags & TAG.explosion) {
    let spread = 0;
    forEachEnemyNear(w, e.x[i], e.y[i], 90, (j) => {
      if (spread >= 3 || j === i || !e.alive[j]) return;
      e.burnT[j] = Math.max(e.burnT[j], e.burnT[i]);
      e.burnDps[j] = Math.max(e.burnDps[j], e.burnDps[i]);
      spread++;
    });
  }

  if (isCrit && dmg >= 60) pushLog(w, "CRIT", `치명타 ${Math.round(dmg)}`);

  if (e.hp[i] <= 0) {
    killEnemy(w, i);
    return true;
  }
  return false;
}

export function killEnemy(w: World, i: number): void {
  const e = w.enemies;
  if (!e.alive[i]) return;
  const x = e.x[i];
  const y = e.y[i];
  const rank = e.rank[i];
  const kind = ENEMY_KINDS[e.kind[i]];

  e.alive[i] = 0;
  w.run.kills += 1;
  burst(w, x, y, rank >= 2 ? 18 : 8, rank >= 2 ? 3 : 1, rank >= 2 ? 220 : 120);
  spawnOrb(w, x, y, e.xp[i]);

  // ♻️ 가비지 컬렉터
  if (w.stats.lifestealRate > 0 && w.rand() < w.stats.lifestealRate) healPlayer(w, 2);

  // 🐴 트로이목마는 분열한다
  if (kind === "trojan") {
    for (let k = 0; k < 3; k++) {
      const a = (Math.PI * 2 * k) / 3;
      spawnEnemy(w, "bug", x + Math.cos(a) * 22, y + Math.sin(a) * 22);
    }
  }

  if (rank === 2) {
    w.run.midbossKilled = true;
    w.midboss.active = false;
    pushLog(w, "DROP", "중간보스 처치 — 보상 상자");
  }
  if (rank === 3) {
    w.boss.active = false;
    w.cleared = true;
  }
}

export function healPlayer(w: World, amount: number): void {
  const half = w.info.rule === "halfheal" ? 0.5 : 1;
  w.player.hp = Math.min(w.player.maxHp, w.player.hp + amount * half);
}

/** 플레이어 피격. 부활(P13/E12)·쉴드(P18)·무적 처리를 전부 여기서 한다 (§9.1) */
export function hurtPlayer(w: World, amount: number, fromBoss = false): void {
  const p = w.player;
  if (!p.alive || p.iframe > 0 || p.invuln > 0 || w.over) return;

  // 🌑 스텔스 캐시 — 쉴드가 차 있으면 한 번 무효
  if (p.shield) {
    p.shield = false;
    p.noHitT = 0;
    p.iframe = w.stats.iFrame;
    pushLog(w, "INFO", "스텔스 캐시 — 피격 1회 무효");
    return;
  }

  const dmg = Math.max(1, Math.round(amount * w.stats.damageTaken));
  p.hp -= dmg;
  p.iframe = w.stats.iFrame;
  p.noHitT = 0;
  w.run.damageTaken += 1;
  w.run.hits += 1;

  w.shake = Math.max(w.shake, fromBoss ? CFG.feedback.bossShakeSec : CFG.feedback.shakeSec);
  w.shakePx = fromBoss ? CFG.feedback.bossShakePx : CFG.feedback.shakePx;
  if (fromBoss) w.flash = Math.max(w.flash, 0.12);
  w.vignette = 0.5;

  pushLog(w, "WARN", `${dmg} 피해   HP ${Math.max(0, Math.round(p.hp))}/${Math.round(p.maxHp)}`);

  if (p.hp <= 0) {
    if (w.stats.revives > w.run.revivesUsed) {
      w.run.revivesUsed += 1;
      p.hp = Math.max(1, Math.round(p.maxHp * (w.stats.reviveHeal || 0.35)));
      p.invuln = w.stats.reviveIFrame;
      w.flash = Math.max(w.flash, 0.3);
      pushLog(w, "FATAL", `HP 0 — 리스폰 프로토콜 발동 (무적 ${w.stats.reviveIFrame.toFixed(1)}s)`);
      if (w.stats.reviveBlast) {
        for (let i = 0; i < w.enemies.cap; i++) {
          if (w.enemies.alive[i] && w.enemies.rank[i] < 2) damageEnemy(w, i, 400, TAG.explosion | TAG.aoe, false);
        }
        pushLog(w, "EVO", "페일오버 클러스터 — 화면 전체 폭발");
      }
    } else {
      p.hp = 0;
      p.alive = false;
      w.over = true;
      w.overReason = w.boss.active ? `${w.info.boss.name} ${w.boss.phase + 1}페이즈` : "잡몹에 포위됨";
      pushLog(w, "FATAL", "HP 0 — 시스템 침해");
    }
  }
}

/** 패시브가 바뀌면 스탯을 다시 계산한다 (최대 체력 증가분은 즉시 회복) */
export function recalcStats(w: World): void {
  const hasE12 = w.evolutions.includes("E12");
  const before = w.stats.maxHp;
  w.stats = applyPassives(w.passives, hasE12);
  const gained = w.stats.maxHp - before;
  w.player.maxHp = w.stats.maxHp;
  if (gained > 0) w.player.hp = Math.min(w.player.maxHp, w.player.hp + gained);
}

/** 액티브 슬롯 찾기 */
export function findActive(w: World, id: ActiveId): SkillSlot | undefined {
  return w.actives.find((s) => s.id === id);
}

export function findPassive(w: World, id: string): PassiveSlot | undefined {
  return w.passives.find((p) => p.id === id);
}

export function clampToArena(x: number, y: number, r: number): { x: number; y: number } {
  return {
    x: Math.max(r, Math.min(CFG.arena.w - r, x)),
    y: Math.max(r, Math.min(CFG.arena.h - r, y)),
  };
}

export type { Stats };
