// 🚀 아울스페이스 — 월드 (구조체 배열 + 풀). 런 중에는 절대 new 하지 않는다 (기획서 §13)

import { CFG, chipNeed } from "../config";
import { THEMES, type SpaceTheme, type ThemeId } from "../theme";
import { stageInfo, type StageInfo } from "../data/stages";
import { baseStats, STARTER_MAIN } from "../data/skills";
import type { LogLine, LogTag, MainSlot, PassiveSlot, Stats, SubSlot } from "../types";

const f32 = (n: number) => new Float32Array(n);
const u8 = (n: number) => new Uint8Array(n);
const i16 = (n: number) => new Int16Array(n);

/* ── 풀 ─────────────────────────────────────────────────────── */

/** 적 탄 — 900발. 둥근 구체 + 외곽선으로만 그린다 (§9) */
export type EBulletPool = {
  cap: number;
  alive: Uint8Array;
  x: Float32Array; y: Float32Array;
  vx: Float32Array; vy: Float32Array;
  r: Float32Array;
  /** 같은 탄은 그레이즈 1회만 (§4) */
  grazed: Uint8Array;
  /** 0 구체 / 1 큰 구체 */
  look: Uint8Array;
  life: Float32Array;
};

/** 내 탄 — 가늘고 긴 형태 */
export type PBulletPool = {
  cap: number;
  alive: Uint8Array;
  x: Float32Array; y: Float32Array;
  vx: Float32Array; vy: Float32Array;
  dmg: Float32Array;
  pierce: Float32Array;
  r: Float32Array;
  /** 0 볼트 / 1 레이저 / 2 유도 / 3 반사 / 4 분열 */
  look: Uint8Array;
  life: Float32Array;
  target: Int16Array;
};

export type EnemyPool = {
  cap: number;
  alive: Uint8Array;
  kind: Uint8Array;
  x: Float32Array; y: Float32Array;
  vx: Float32Array; vy: Float32Array;
  hp: Float32Array; maxHp: Float32Array;
  r: Float32Array;
  sides: Uint8Array;
  flash: Float32Array;
  chips: Float32Array;
  /** 0 잡몹 / 1 정예 / 2 보스 */
  rank: Uint8Array;
  /** 패턴 진행 */
  patIdx: Int16Array;
  patT: Float32Array;
  patFired: Uint8Array;
  phase: Float32Array;
};

/** 레이저 — 반드시 예고선(warn) 이 먼저다 (§14-4) */
export type LaserPool = {
  cap: number;
  alive: Uint8Array;
  x: Float32Array; y: Float32Array;
  angle: Float32Array;
  width: Float32Array;
  warn: Float32Array;
  active: Float32Array;
  /** 소유 적 (따라다닌다). -1 = 고정 */
  src: Int16Array;
};

export type ChipPool = {
  cap: number;
  alive: Uint8Array;
  x: Float32Array; y: Float32Array;
  vx: Float32Array; vy: Float32Array;
  value: Float32Array;
};

export type ParticlePool = {
  cap: number;
  alive: Uint8Array;
  x: Float32Array; y: Float32Array;
  vx: Float32Array; vy: Float32Array;
  life: Float32Array; max: Float32Array;
  r: Float32Array;
  color: Uint8Array;
};

export type ObstaclePool = {
  cap: number;
  alive: Uint8Array;
  x: Float32Array; y: Float32Array;
  w: Float32Array; h: Float32Array;
  hp: Float32Array; maxHp: Float32Array;
  kind: Uint8Array;
  flash: Float32Array;
};

/** 연속 발사(repeat) 예약 — 패턴 DSL 의 repeat 를 굴리는 큐 */
export type VolleyPool = {
  cap: number;
  alive: Uint8Array;
  src: Int16Array;
  next: Float32Array;
  left: Float32Array;
  interval: Float32Array;
  rotate: Float32Array;
  angle: Float32Array;
  type: Uint8Array;
  count: Float32Array;
  speed: Float32Array;
  spread: Float32Array;
  r: Float32Array;
  warn: Float32Array;
};

export const SHOT_TYPES = ["fan", "ring", "aimed", "spiral", "laser", "random"] as const;

/* ── 월드 ───────────────────────────────────────────────────── */

export type Player = {
  x: number; y: number;
  lives: number;
  iframe: number;
  bombs: number;
  shield: boolean;
  shieldT: number;
  precise: boolean;
  /** 오빗 실드(S2) 남은 개수 */
  orbits: number;
  orbitT: number;
  /** 포인트 배리어(S8) 남은 방어 횟수 */
  barrier: number;
  barrierT: number;
  /** 타임 디스토션(S7) */
  slowT: number;
  slowCd: number;
  /** 페이크 아울(S12) 분신 — 적의 조준탄을 대신 끌어간다 */
  decoyX: number;
  decoyY: number;
  decoyT: number;
  /** 피어싱 레이저의 "이동 중 위력 감소" 판정용 */
  lastX: number;
  alive: boolean;
};

export type RunStats = {
  kills: number;
  graze: number;
  chips: number;
  damageTaken: number;
  bombsUsed: number;
  bossKilled: boolean;
  obstacles: number;
};

export type World = {
  t: number;
  frame: number;
  stage: number;
  info: StageInfo;
  theme: SpaceTheme;
  themeId: ThemeId;
  rand: () => number;
  reduced: boolean;

  player: Player;
  stats: Stats;
  main: MainSlot;
  subs: SubSlot[];
  passives: PassiveSlot[];
  mainCd: number;
  subCd: number[];

  ebullets: EBulletPool;
  pbullets: PBulletPool;
  enemies: EnemyPool;
  lasers: LaserPool;
  chips: ChipPool;
  particles: ParticlePool;
  obstacles: ObstaclePool;
  volleys: VolleyPool;

  /** 칩 게이지 */
  chipGauge: number;
  chipLevels: number;
  pending: number;

  boss: { idx: number; phase: number; active: boolean; spawned: boolean; maxHp: number; warnT: number };

  phase: "wave" | "boss" | "over";
  cleared: boolean;
  over: boolean;
  overReason: string;

  scrollY: number;
  scrollMul: number;

  shake: number;
  shakePx: number;
  flash: number;
  slow: number;
  vignette: number;

  log: LogLine[];
  banner: { text: string; sub: string; until: number } | null;

  run: RunStats;
  lowSpec: boolean;
  owlEnergyFound: boolean;
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
  const p = CFG.perf;
  const stats = baseStats();

  return {
    t: 0,
    frame: 0,
    stage,
    info: stageInfo(stage),
    theme: THEMES[themeId],
    themeId,
    rand: makeRng(seed),
    reduced,

    player: {
      x: CFG.screen.w / 2,
      y: CFG.screen.h * CFG.player.startY,
      lives: CFG.player.lives,
      iframe: 0,
      bombs: CFG.bomb.start,
      shield: false,
      shieldT: 0,
      precise: false,
      orbits: 0,
      orbitT: 0,
      barrier: 0,
      barrierT: 0,
      slowT: 0,
      slowCd: 8,
      decoyX: 0,
      decoyY: 0,
      decoyT: 0,
      lastX: CFG.screen.w / 2,
      alive: true,
    },
    stats,
    main: { id: STARTER_MAIN, lv: 1 },
    subs: [],
    passives: [],
    mainCd: 0,
    subCd: [0, 0, 0],

    ebullets: {
      cap: p.maxBullets, alive: u8(p.maxBullets), x: f32(p.maxBullets), y: f32(p.maxBullets),
      vx: f32(p.maxBullets), vy: f32(p.maxBullets), r: f32(p.maxBullets),
      grazed: u8(p.maxBullets), look: u8(p.maxBullets), life: f32(p.maxBullets),
    },
    pbullets: {
      cap: 256, alive: u8(256), x: f32(256), y: f32(256), vx: f32(256), vy: f32(256),
      dmg: f32(256), pierce: f32(256), r: f32(256), look: u8(256), life: f32(256), target: i16(256),
    },
    enemies: {
      cap: p.maxEnemies, alive: u8(p.maxEnemies), kind: u8(p.maxEnemies),
      x: f32(p.maxEnemies), y: f32(p.maxEnemies), vx: f32(p.maxEnemies), vy: f32(p.maxEnemies),
      hp: f32(p.maxEnemies), maxHp: f32(p.maxEnemies), r: f32(p.maxEnemies), sides: u8(p.maxEnemies),
      flash: f32(p.maxEnemies), chips: f32(p.maxEnemies), rank: u8(p.maxEnemies),
      patIdx: i16(p.maxEnemies), patT: f32(p.maxEnemies), patFired: u8(p.maxEnemies), phase: f32(p.maxEnemies),
    },
    lasers: {
      cap: 16, alive: u8(16), x: f32(16), y: f32(16), angle: f32(16), width: f32(16),
      warn: f32(16), active: f32(16), src: i16(16),
    },
    chips: {
      cap: p.maxChips, alive: u8(p.maxChips), x: f32(p.maxChips), y: f32(p.maxChips),
      vx: f32(p.maxChips), vy: f32(p.maxChips), value: f32(p.maxChips),
    },
    particles: {
      cap: p.maxParticles, alive: u8(p.maxParticles), x: f32(p.maxParticles), y: f32(p.maxParticles),
      vx: f32(p.maxParticles), vy: f32(p.maxParticles), life: f32(p.maxParticles),
      max: f32(p.maxParticles), r: f32(p.maxParticles), color: u8(p.maxParticles),
    },
    obstacles: {
      cap: p.maxObstacles, alive: u8(p.maxObstacles), x: f32(p.maxObstacles), y: f32(p.maxObstacles),
      w: f32(p.maxObstacles), h: f32(p.maxObstacles), hp: f32(p.maxObstacles),
      maxHp: f32(p.maxObstacles), kind: u8(p.maxObstacles), flash: f32(p.maxObstacles),
    },
    volleys: {
      cap: 32, alive: u8(32), src: i16(32), next: f32(32), left: f32(32), interval: f32(32),
      rotate: f32(32), angle: f32(32), type: u8(32), count: f32(32), speed: f32(32),
      spread: f32(32), r: f32(32), warn: f32(32),
    },

    chipGauge: 0,
    chipLevels: 0,
    pending: 0,

    boss: { idx: -1, phase: 0, active: false, spawned: false, maxHp: 0, warnT: 0 },

    phase: "wave",
    cleared: false,
    over: false,
    overReason: "",

    scrollY: 0,
    scrollMul: 1,

    shake: 0,
    shakePx: 0,
    flash: 0,
    slow: 0,
    vignette: 0,

    log: [],
    banner: null,

    run: { kills: 0, graze: 0, chips: 0, damageTaken: 0, bombsUsed: 0, bossKilled: false, obstacles: 0 },
    lowSpec: false,
    owlEnergyFound: false,
  };
}

/* ── 로그 (§8) ──────────────────────────────────────────────── */

export function pushLog(w: World, tag: LogTag, text: string): void {
  w.log.push({ tag, text, t: w.t });
  if (w.log.length > CFG.feedback.logLines * 4) w.log.splice(0, w.log.length - CFG.feedback.logLines * 4);
}

export function visibleLog(w: World): LogLine[] {
  const out: LogLine[] = [];
  for (let i = w.log.length - 1; i >= 0 && out.length < CFG.feedback.logLines; i--) {
    if (w.t - w.log[i].t <= CFG.feedback.logFadeSec) out.push(w.log[i]);
  }
  return out.reverse();
}

/* ── 할당 ───────────────────────────────────────────────────── */

function free(alive: Uint8Array): number {
  for (let i = 0; i < alive.length; i++) if (!alive[i]) return i;
  return -1;
}

export function spawnEBullet(w: World, x: number, y: number, vx: number, vy: number, r = 6, look = 0): number {
  const b = w.ebullets;
  const i = free(b.alive);
  if (i < 0) return -1;
  b.alive[i] = 1;
  b.x[i] = x; b.y[i] = y; b.vx[i] = vx; b.vy[i] = vy;
  b.r[i] = r; b.grazed[i] = 0; b.look[i] = look; b.life[i] = 12;
  return i;
}

export function spawnPBullet(
  w: World, x: number, y: number, vx: number, vy: number,
  dmg: number, look = 0, pierce = 0, r = 4,
): number {
  const b = w.pbullets;
  const i = free(b.alive);
  if (i < 0) return -1;
  b.alive[i] = 1;
  b.x[i] = x; b.y[i] = y; b.vx[i] = vx; b.vy[i] = vy;
  b.dmg[i] = dmg; b.look[i] = look; b.pierce[i] = pierce; b.r[i] = r;
  b.life[i] = 3; b.target[i] = -1;
  return i;
}

export function spawnLaser(w: World, x: number, y: number, angle: number, width: number, warn: number, src = -1): number {
  const l = w.lasers;
  const i = free(l.alive);
  if (i < 0) return -1;
  l.alive[i] = 1;
  l.x[i] = x; l.y[i] = y; l.angle[i] = angle; l.width[i] = width;
  l.warn[i] = warn; l.active[i] = 0; l.src[i] = src;
  return i;
}

export function spawnChip(w: World, x: number, y: number, value: number = CFG.chip.value): number {
  const c = w.chips;
  const i = free(c.alive);
  if (i < 0) return -1;
  c.alive[i] = 1;
  c.x[i] = x; c.y[i] = y; c.vx[i] = 0; c.vy[i] = 60; c.value[i] = value;
  return i;
}

export function spawnParticle(w: World, x: number, y: number, vx: number, vy: number, life: number, r: number, color: number): void {
  if (w.reduced) return;
  const q = w.particles;
  const i = free(q.alive);
  if (i < 0) return;
  q.alive[i] = 1;
  q.x[i] = x; q.y[i] = y; q.vx[i] = vx; q.vy[i] = vy;
  q.life[i] = life; q.max[i] = life; q.r[i] = r; q.color[i] = color;
}

export function burst(w: World, x: number, y: number, n: number, color: number, power = 160): void {
  const count = w.lowSpec ? Math.ceil(n / 2) : n;
  for (let k = 0; k < count; k++) {
    const a = (Math.PI * 2 * k) / count + w.rand();
    const s = power * (0.4 + w.rand() * 0.8);
    spawnParticle(w, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.25 + w.rand() * 0.3, 2 + w.rand() * 2, color);
  }
}

/* ── 조회 / 판정 ────────────────────────────────────────────── */

export function aliveEnemies(w: World): number {
  let n = 0;
  for (let i = 0; i < w.enemies.cap; i++) if (w.enemies.alive[i]) n++;
  return n;
}

export function countEBullets(w: World): number {
  let n = 0;
  for (let i = 0; i < w.ebullets.cap; i++) if (w.ebullets.alive[i]) n++;
  return n;
}

export function nearestEnemy(w: World, x: number, y: number): number {
  let best = -1;
  let bd = Infinity;
  const e = w.enemies;
  for (let i = 0; i < e.cap; i++) {
    if (!e.alive[i]) continue;
    const d = (e.x[i] - x) ** 2 + (e.y[i] - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** 화면 전탄 소거 (피격·봄·페이즈 전환) */
export function clearBullets(w: World, scoreChips = false): void {
  const b = w.ebullets;
  for (let i = 0; i < b.cap; i++) {
    if (!b.alive[i]) continue;
    if (scoreChips) spawnChip(w, b.x[i], b.y[i], 1);
    spawnParticle(w, b.x[i], b.y[i], 0, -80, 0.2, 3, 2);
    b.alive[i] = 0;
  }
  for (let i = 0; i < w.lasers.cap; i++) w.lasers.alive[i] = 0;
}

export function damageEnemy(w: World, i: number, amount: number): boolean {
  const e = w.enemies;
  if (!e.alive[i] || amount <= 0) return false;
  let dmg = amount;
  if (w.stats.critRate > 0 && w.rand() < w.stats.critRate) dmg *= w.stats.critDamage;
  e.hp[i] -= dmg;
  e.flash[i] = CFG.feedback.flashSec;
  if (e.hp[i] > 0) return false;
  killEnemy(w, i);
  return true;
}

export function killEnemy(w: World, i: number): void {
  const e = w.enemies;
  if (!e.alive[i]) return;
  const x = e.x[i];
  const y = e.y[i];
  const rank = e.rank[i];
  e.alive[i] = 0;
  w.run.kills += 1;

  burst(w, x, y, rank === 2 ? 22 : 9, rank === 2 ? 4 : 3, rank === 2 ? 260 : 150);
  const chips = Math.round(e.chips[i]);
  for (let k = 0; k < chips; k++) {
    spawnChip(w, x + (w.rand() - 0.5) * 26, y + (w.rand() - 0.5) * 26);
  }

  if (rank === 2) {
    w.boss.active = false;
    w.run.bossKilled = true;
    w.cleared = true;
  }
}

/** 칩 게이지 — 그레이즈로도 찬다 (잘 피하면 더 빨리 강해진다, §5.1) */
export function addChipGauge(w: World, amount: number): void {
  w.chipGauge += amount * w.stats.chipGain;
  const need = chipNeed(w.chipLevels);
  if (w.chipGauge >= need) {
    w.chipGauge -= need;
    w.chipLevels += 1;
    w.pending += 1;
  }
}

/** 피격 (§3) — 생명 -1 + 전탄 소거 + 무적 3초 + 봄 보충 */
export function hitPlayer(w: World): void {
  const p = w.player;
  if (!p.alive || p.iframe > 0 || w.over) return;

  // 🛡️ 나노 실드(P8) / 포인트 배리어(S8) 가 먼저 막는다
  if (p.shield) {
    p.shield = false;
    p.shieldT = 0;
    p.iframe = 0.6;
    pushLog(w, "SKILL", "나노 실드가 막았어요");
    return;
  }

  p.lives -= 1;
  w.run.damageTaken += 1;
  p.iframe = w.stats.iFrame;
  p.bombs = Math.min(w.stats.bombMax, p.bombs + 1);

  clearBullets(w);
  burst(w, p.x, p.y, 24, 0, 280);
  w.shake = Math.max(w.shake, CFG.feedback.hitShakeSec);
  w.shakePx = CFG.feedback.hitShakePx;
  w.flash = Math.max(w.flash, 0.25);
  w.slow = Math.max(w.slow, CFG.feedback.hitSlowSec);
  w.vignette = 0.6;

  pushLog(w, "FATAL", `피격! 남은 생명 ${Math.max(0, p.lives)}`);

  if (p.lives <= 0) {
    p.alive = false;
    w.over = true;
    w.overReason = w.boss.active ? `${w.info.boss.name} PHASE ${w.boss.phase + 1}` : "격추";
  }
}

/** 봄 (§3) — 전탄 소거 + 대형 피해 + 무적 */
export function fireBomb(w: World): void {
  const p = w.player;
  if (!p.alive || p.bombs <= 0 || w.over) return;

  if (w.rand() >= w.stats.bombKeepRate) p.bombs -= 1;
  w.run.bombsUsed += 1;
  p.iframe = Math.max(p.iframe, CFG.bomb.iFrameSec);

  clearBullets(w, true);
  for (let i = 0; i < w.enemies.cap; i++) {
    if (w.enemies.alive[i]) damageEnemy(w, i, CFG.bomb.damage * w.stats.damage);
  }
  burst(w, p.x, p.y, 28, 1, 320);
  w.shake = Math.max(w.shake, CFG.feedback.bombShakeSec);
  w.shakePx = 6;
  w.flash = Math.max(w.flash, 0.35);
  pushLog(w, "SKILL", `봄 발동 — 남은 ${p.bombs}개`);
}

export function clampToScreen(x: number, y: number, r: number): { x: number; y: number } {
  return {
    x: Math.max(r, Math.min(CFG.screen.w - r, x)),
    y: Math.max(r, Math.min(CFG.screen.h - r, y)),
  };
}
