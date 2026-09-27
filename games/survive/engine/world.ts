// 🦉 아울 서바이버즈 v3 — 월드 = 구조체 배열(SoA) + 오브젝트 풀 (기획서 §14)
// 런 중에는 절대 new 하지 않는다. 모든 배열은 createWorld 에서 한 번만 할당한다.
// v3 부터 맵은 **무한**이다 — 아레나 경계가 없고, 장애물은 obstacles.ts 가 카메라 주변에 흘려 깐다.

import { msg, ref, type Msg } from "@/games/core/i18n";
import { CFG, atkMult, hpMult, xpMult, xpToNext } from "../config";
import { THEMES, type Theme, type ThemeId } from "../theme";
import {
  ENEMY_KINDS,
  ENEMY_SPEC,
  MOB_KINDS,
  stageInfo,
  type BossKind,
  type EnemyKind,
  type StageInfo,
} from "../data/stages";
import { ACTIVE_IDS, applyPassives, baseStats, LOW_HP_RATIO, STARTER } from "../data/skills";
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

/** 풀의 kind 번호 → 특수 몬스터인가 (🔍 취약점 분석이 매 타격 보므로 표로 만들어 둔다) */
const SPECIAL_KIND = Uint8Array.from(ENEMY_KINDS, (k) => (ENEMY_SPEC[k].special ? 1 : 0));

/**
 * 장판 종류. 0~5 는 플레이어 스킬·예전 적 장판, 6~ 는 보스 패턴.
 *  warn  — 경고 원. 수명이 끝나는 순간 터진다 (flag LETHAL 이면 즉사)
 *  red   — 🔴 밟으면 즉사
 *  blue  — 🔵 밟으면 이동속도 감소
 *  hole  — 블랙홀 (tick 이 남아 있는 동안은 경고)
 *  safe  — 블랙홀의 안전 장판
 */
export const HZ = {
  field: 0, enemy: 1, honey: 2, pull: 3, stun: 4, burn: 5,
  warn: 6, red: 7, blue: 8, hole: 9, safe: 10,
} as const;

export const HZ_LETHAL = 1;

/**
 * 파티클·이펙트 색 번호 — 렌더가 테마 색으로 바꾼다.
 * 16 이상은 도형별 색(`theme.mobs`)이다 (MOB + 도형 index).
 */
export const PC = {
  mine: 0, enemy: 1, obstacle: 2, boss: 3, mineAlt: 4, ice: 5, danger: 6, hp: 7, xp: 8, text: 9, foe: 10,
  mob: 16,
} as const;

/** 스킬·연출 이펙트 종류 (그리기 전용 — 판정에는 쓰지 않는다) */
export const FX = {
  /** 퍼지는 링 */
  ring: 0,
  /** ❄️ 부채꼴 (x,y 에서 ang 방향, 반경 r) */
  cone: 1,
  /** ⚔️ 베기 스프라이트 */
  slash: 2,
  /** 🧊 하늘에서 떨어지는 폭격 */
  strike: 3,
  /** ⚡ 연쇄 번개 (x,y → x2,y2) */
  chain: 4,
  /** 적 등장 */
  spawn: 5,
  /** 적 파괴 — 네온 링 */
  death: 6,
  /** 💉 회복 */
  heal: 7,
  /** 🔭 곧은 광선 (x,y → x2,y2) — 저격·채찍 */
  beam: 8,
} as const;

export type FxPool = {
  cap: number;
  alive: Uint8Array;
  kind: Uint8Array;
  x: Float32Array; y: Float32Array;
  x2: Float32Array; y2: Float32Array;
  ang: Float32Array;
  r: Float32Array;
  life: Float32Array; max: Float32Array;
  color: Uint8Array;
};

/** 효과음 신호 — 엔진은 비트만 세우고, 소리는 화면이 낸다 (games/survive/audio.ts 의 CUE_SOUNDS) */
export const CUE = {
  tick: 1 << 0,
  alarm: 1 << 1,
  boom: 1 << 2,
  go: 1 << 3,
  hit: 1 << 4,
  kill: 1 << 5,
  elite: 1 << 6,
  pickup: 1 << 7,
  heal: 1 << 8,
  level: 1 << 9,
  evo: 1 << 10,
  stage: 1 << 11,
  bossIn: 1 << 12,
  bossDown: 1 << 13,
  death: 1 << 14,
  revive: 1 << 15,
  shield: 1 << 16,
  dodge: 1 << 17,
  shot: 1 << 18,
  zap: 1 << 19,
  slash: 1 << 20,
} as const;

/** 레이저 종류 */
export const BEAM = { damage: 0, lethal: 1, telegraph: 2 } as const;

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
  /** 0 잡몹 / 1 특수 소환물(시한폭탄·분신) / 3 보스 */
  rank: Uint8Array;
  /** 은신(보스 분신 연출 등) 남은 시간 */
  hideT: Float32Array;
  /** 특수 행동 쿨다운 (돌진·사격·소환·재생 펄스) */
  shootCd: Float32Array;
  /** 돌진: 조준(+) 남은 시간 / 돌진 중(-)이면 음수로 남은 시간 */
  dashT: Float32Array;
  dirX: Float32Array; dirY: Float32Array;
  /** 🔵 구각형 버프를 받았는가 (중첩 금지) */
  buff: Uint8Array;
  /** 수명 (시한폭탄 도화선·분신 자폭). 0 이면 없음 */
  life: Float32Array;
  /** 나온 지 몇 초 — 등장 연출(커지며 나타나기)에 쓴다 */
  age: Float32Array;
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
  /**
   * 렌더 모양 0 깃털 / 1 레이저 / 2 빔 / 3 위성 / 4 탄막 / 5 부메랑 / 6 폭탄 / 7 적탄 / 8 추적탄 / 9 감속탄
   * / 10 포탑 / 11 지뢰 / 12 원반 / 13 웜 / 14 스윕 레이저 (번호는 skills.ts 의 LOOK)
   */
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
  kind: Uint8Array;
  owner: Int16Array;
  tags: Uint8Array;
  /** HZ_LETHAL 등 */
  flag: Uint8Array;
};

export type ObstaclePool = {
  cap: number;
  alive: Uint8Array;
  x: Float32Array; y: Float32Array;
  w: Float32Array; h: Float32Array;
  hp: Float32Array; maxHp: Float32Array;
  kind: Uint8Array;  // 0 서버랙 / 1 박스 / 2 소화기 / 3 배선더미
  flash: Float32Array;
  /** 무한 맵 격자 칸 좌표 — 같은 칸을 두 번 깔지 않게 */
  cx: Int32Array; cy: Int32Array;
};

/** 레이저 — 경고(warn) 동안 선만 보이고, 발사(fire) 동안 닿으면 맞는다 */
export type BeamPool = {
  cap: number;
  alive: Uint8Array;
  x: Float32Array; y: Float32Array;
  ang: Float32Array;
  len: Float32Array;
  width: Float32Array;
  warn: Float32Array;
  fire: Float32Array;
  dmg: Float32Array;
  kind: Uint8Array;
  /** 이번 발사에서 이미 맞혔는가 */
  hit: Uint8Array;
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
    dashT: f32(cap), dirX: f32(cap), dirY: f32(cap), buff: u8(cap), life: f32(cap), age: f32(cap),
  };
}

function makeBullets(cap: number): BulletPool {
  return {
    cap, alive: u8(cap), x: f32(cap), y: f32(cap), vx: f32(cap), vy: f32(cap),
    dmg: f32(cap), life: f32(cap), pierce: f32(cap), r: f32(cap), tags: u8(cap),
    look: u8(cap), owner: new Int16Array(cap), aux: f32(cap), hostile: u8(cap), status: u8(cap),
  };
}

/* ── 보스 상태 ──────────────────────────────────────────────── */

/**
 * 보스 4종의 상태를 한 구조체에 평평하게 둔다 (런 중 할당 금지).
 * 필드 이름 앞머리가 보스를 가리킨다 — 공통 / nona(구각형) / tri(십삼각형) / chrono(십오각형).
 */
export type BossState = {
  idx: number;
  kind: BossKind | null;
  active: boolean;
  /** 이번 보스를 잡았다 — game.ts 가 보고 다음 단계로 넘긴다 */
  defeated: boolean;
  maxHp: number;
  /** 등장 직후 무적 연출 */
  intro: number;
  /** 전투 시간 */
  t: number;
  timer: number;
  step: number;

  /** 공격 가능한 방향 (구각형 약점 · 십오각형 시계). 꺼져 있으면 어디서든 맞는다 */
  gateOn: boolean;
  gateN: number;
  gateA: Float32Array;
  gateW: number;
  /** 무적 (시간 역행 연출 등) */
  shield: number;

  nonaGauge: number;
  nonaBaseR: number;
  nonaBaseHp: number;
  nonaWeakT: number;
  nonaBuffT: number;
  nonaShotT: number;

  triArenaX: number;
  triArenaY: number;
  triArenaR: number;
  triOutsideT: number;
  triNearT: number;
  triSlowF: number;
  triDashCd: number;
  triDashSeries: number;
  triDashStep: number;
  triDashWarn: number;
  triDashRun: number;
  triDashAng: number;
  triLaserT: number;
  /** 레이저가 끝나면 그 자리에 색 장판을 깐다 */
  triTileT: number;
  triLaserX: number;
  triLaserY: number;
  triLaserRot: number;
  triHoleT: number;
  triDoomLeft: number;
  triDoomT: number;
  triDoomWarn: number;

  chLoop: number;
  chLimit: number;
  chBaseHp: number;
  chRage: number;
  chRewound: boolean;
  chRewindT: number;
  chRewindHp: number;
  chHist: Float32Array;
  chHistN: number;
  chHistT: number;
  chHomingT: number;
  chRainT: number;
  chBombT: number;
  chBombFuse: number;
  chCloneT: number;
  chClockT: number;
  chClockOn: boolean;
  chStopT: number;
  chStopLeft: number;
  chReverseIdx: number;
  /** 최후의 심판 — 시작 후 흐른 시간 (-1 = 아직) */
  chTimeout: number;
  chLastRain: Float32Array;
  chLastRainN: number;
};

function makeBoss(): BossState {
  return {
    idx: -1, kind: null, active: false, defeated: false, maxHp: 0, intro: 0, t: 0, timer: 0, step: 0,
    gateOn: false, gateN: 0, gateA: f32(2), gateW: 0, shield: 0,
    nonaGauge: 0, nonaBaseR: 0, nonaBaseHp: 0, nonaWeakT: 0, nonaBuffT: 0, nonaShotT: 0,
    triArenaX: 0, triArenaY: 0, triArenaR: 0, triOutsideT: 0, triNearT: 0, triSlowF: 1,
    triDashCd: 0, triDashSeries: 0, triDashStep: 0, triDashWarn: 0, triDashRun: 0, triDashAng: 0,
    triLaserT: 0, triTileT: -1, triLaserX: 0, triLaserY: 0, triLaserRot: 0, triHoleT: 0, triDoomLeft: 0, triDoomT: 0, triDoomWarn: 0,
    chLoop: 0, chLimit: 0, chBaseHp: 0, chRage: 0, chRewound: false, chRewindT: 0, chRewindHp: 0,
    chHist: f32(64), chHistN: 0, chHistT: 0,
    chHomingT: 0, chRainT: 0, chBombT: 0, chBombFuse: 0, chCloneT: 0, chClockT: 0, chClockOn: false,
    chStopT: 0, chStopLeft: 0, chReverseIdx: 0, chTimeout: -1, chLastRain: f32(64), chLastRainN: 0,
  };
}

/* ── 월드 ───────────────────────────────────────────────────── */

export type Player = {
  x: number; y: number;
  hp: number; maxHp: number;
  level: number; xp: number; xpNext: number;
  iframe: number;
  /** 감속 남은 시간과 배율 (칠각형 탄·파란 장판) */
  slow: number;
  slowMult: number;
  /** 넉백·블랙홀 끌림 속도 */
  kx: number; ky: number;
  /** P18 쉴드: 충전 시간 / 보유 여부 */
  noHitT: number; shield: boolean;
  invuln: number;
  dir: number;  // 마지막 이동 방향 (조준용)
  alive: boolean;

  /* ── 연출 (스프라이트 선택용 — 판정에는 쓰지 않는다) ── */
  /** 지금 움직이고 있는가 */
  moving: boolean;
  /** 바라보는 쪽: 0 정면(아래) · 1 후면(위) · 2 왼쪽 · 3 오른쪽 */
  face: number;
  /** 마지막으로 옆으로 움직인 뒤 흐른 시간 — 멈춰도 잠깐은 옆을 본다 */
  sideT: number;
  /** 감정: 0 없음 · 1 기쁨 · 2 화남 · 3 놀람 */
  emote: number;
  emoteT: number;
  /** 맞은 직후 (피격 스프라이트) */
  hitT: number;
  /** 레벨업 연출 */
  lvlT: number;
  /** 애니메이션 시계 */
  anim: number;
};

export type RunStats = {
  kills: number;
  bosses: number;
  obstacles: number;
  damageTaken: number;
  revivesUsed: number;
  evolutions: number;
  hits: number;
};

export type World = {
  /** 장애물 배치가 이 값으로 결정된다 (같은 칸은 언제 와도 같다) */
  seed: number;
  t: number;
  /** 지금 단계와 그 단계에 머문 시간 */
  stage: number;
  stageT: number;
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
  beams: BeamPool;
  fx: FxPool;
  grid: Grid;

  boss: BossState;

  /** 십오각형을 한 번이라도 잡았는가 (§12 — 이후 4단계마다 재등장) */
  cleared: boolean;
  over: boolean;
  overReason: Msg | null;

  /** ⏸️ 시간 정지 — 플레이어만 움직인다 */
  frozen: number;
  /** 💀 최후의 심판 — 흑백 화면 */
  gray: number;
  /** 보스를 잡은 직후 — 화면의 경험치를 전부 빨아들인다 */
  vacuum: number;
  /** 이번 프레임에 울릴 효과음 (CUE 비트) — 화면이 꺼내 가고 비운다 */
  cues: number;
  /** 시작 카운트다운 (3·2·1) — 0 이 될 때까지 월드가 멈춘다 */
  countdown: number;

  /** 피해를 준 위치 (보스 방향 판정용). hitOn 이 꺼져 있으면 플레이어 위치로 본다 */
  hitX: number;
  hitY: number;
  hitOn: boolean;

  /** 최근 처치 기록 (⏪ 시간 역주행이 되살린다) */
  killMem: { kind: Uint8Array; x: Float32Array; y: Float32Array; head: number; n: number };
  /** 부서진 장애물 칸 (링 버퍼) */
  broken: { cx: Int32Array; cy: Int32Array; head: number; n: number };
  /**
   * 🍴 포크 밤 — 처치 순간 확률로 폭발 자리를 쌓아 두고, 다음 프레임에 skills.ts 가 터뜨린다.
   * killEnemy 안에서 바로 터뜨리면 연쇄 폭발이 재귀로 끝없이 깊어진다.
   */
  pops: { chance: number; x: Float32Array; y: Float32Array; n: number };
  /** 장애물을 마지막으로 흘려 깐 카메라 칸 */
  streamCx: number;
  streamCy: number;

  shake: number;
  shakePx: number;
  flash: number;
  freeze: number;
  vignette: number;

  log: LogLine[];
  banner: { m: Msg; sub: Msg; until: number } | null;

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

export function createWorld(seed: number, themeId: ThemeId, reduced = false): World {
  const stats = baseStats();
  const p = CFG.perf;
  const rand = makeRng(seed);
  const m = p.killMemory;
  const b = CFG.obstacle.brokenMemory;

  return {
    seed: seed >>> 0,
    t: 0,
    stage: 1,
    stageT: 0,
    info: stageInfo(1),
    theme: THEMES[themeId],
    themeId,
    rand,
    reduced,

    player: {
      x: 0, y: 0,
      hp: stats.maxHp, maxHp: stats.maxHp,
      level: 1, xp: 0, xpNext: xpToNext(1),
      iframe: 0, slow: 0, slowMult: 1, kx: 0, ky: 0,
      noHitT: 0, shield: false, invuln: 0, dir: 0, alive: true,
      moving: false, face: 0, sideT: 99, emote: 0, emoteT: 0, hitT: 0, lvlT: 0, anim: 0,
    },
    stats,
    actives: [{ id: STARTER, lv: 1, evo: null, cd: 0 }],
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
      tags: u8(p.maxHazards), flag: u8(p.maxHazards),
    },
    obstacles: {
      cap: p.maxObstacles, alive: u8(p.maxObstacles), x: f32(p.maxObstacles), y: f32(p.maxObstacles),
      w: f32(p.maxObstacles), h: f32(p.maxObstacles), hp: f32(p.maxObstacles),
      maxHp: f32(p.maxObstacles), kind: u8(p.maxObstacles), flash: f32(p.maxObstacles),
      cx: new Int32Array(p.maxObstacles), cy: new Int32Array(p.maxObstacles),
    },
    fx: {
      cap: p.maxFx, alive: u8(p.maxFx), kind: u8(p.maxFx), x: f32(p.maxFx), y: f32(p.maxFx),
      x2: f32(p.maxFx), y2: f32(p.maxFx), ang: f32(p.maxFx), r: f32(p.maxFx),
      life: f32(p.maxFx), max: f32(p.maxFx), color: u8(p.maxFx),
    },
    beams: {
      cap: p.maxBeams, alive: u8(p.maxBeams), x: f32(p.maxBeams), y: f32(p.maxBeams),
      ang: f32(p.maxBeams), len: f32(p.maxBeams), width: f32(p.maxBeams), warn: f32(p.maxBeams),
      fire: f32(p.maxBeams), dmg: f32(p.maxBeams), kind: u8(p.maxBeams), hit: u8(p.maxBeams),
    },
    grid: createGrid(p.maxEnemies + 24),

    boss: makeBoss(),

    cleared: false,
    over: false,
    overReason: null,
    frozen: 0,
    gray: 0,
    vacuum: 0,
    cues: 0,
    countdown: 0,

    hitX: 0,
    hitY: 0,
    hitOn: false,

    killMem: { kind: u8(m), x: f32(m), y: f32(m), head: 0, n: 0 },
    broken: { cx: new Int32Array(b), cy: new Int32Array(b), head: 0, n: 0 },
    pops: { chance: 0, x: f32(p.popQueue), y: f32(p.popQueue), n: 0 },
    streamCx: Number.NaN,
    streamCy: Number.NaN,

    shake: 0,
    shakePx: 0,
    flash: 0,
    freeze: 0,
    vignette: 0,

    log: [],
    banner: null,

    run: { kills: 0, bosses: 0, obstacles: 0, damageTaken: 0, revivesUsed: 0, evolutions: 0, hits: 0 },
    cam: { x: 0, y: 0 },
    lowSpec: false,
    owlEnergyFound: false,
    frame: 0,
  };
}

/** 시작 스킬 외에 액티브를 하나 더 쥐여 준다 (테스트·봇용) */
export function grantActive(w: World, id: ActiveId, lv = 1): void {
  if (w.actives.some((s) => s.id === id)) return;
  if (!ACTIVE_IDS.includes(id)) return;
  w.actives.push({ id, lv, evo: null, cd: 0 });
}

/* ── 전투 로그 (§9.2) ───────────────────────────────────────── */

export function pushLog(w: World, tag: LogTag, m: Msg): void {
  w.log.push({ tag, m, t: w.t });
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

export function banner(w: World, m: Msg, sub: Msg, sec: number = CFG.stage.bannerSec): void {
  w.banner = { m, sub, until: w.t + sec };
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

export function countKind(w: World, kind: EnemyKind): number {
  const k = ENEMY_KINDS.indexOf(kind);
  let n = 0;
  for (let i = 0; i < w.enemies.cap; i++) if (w.enemies.alive[i] && w.enemies.kind[i] === k) n++;
  return n;
}

export function enemyCap(w: World): number {
  return w.lowSpec ? CFG.perf.maxEnemiesLow : CFG.perf.maxEnemies;
}

export function kindOf(w: World, i: number): EnemyKind {
  return ENEMY_KINDS[w.enemies.kind[i]];
}

/** 😡 시간의 분노 — 십오각형과 싸우는 동안 잡몹이 세진다 (0~1) */
export function rageRatio(w: World): number {
  return w.boss.active && w.boss.kind === "chrono" ? w.boss.chRage / CFG.chrono.rage.max : 0;
}

export function spawnEnemy(w: World, kind: EnemyKind, x: number, y: number, rank = 0): number {
  const e = w.enemies;
  const i = freeSlot(e.alive);
  if (i < 0) return -1;
  const spec = ENEMY_SPEC[kind];
  const rage = rank === 0 ? rageRatio(w) : 0;
  const rc = CFG.chrono.rage;

  e.alive[i] = 1;
  e.kind[i] = ENEMY_KINDS.indexOf(kind);
  e.x[i] = x; e.y[i] = y;
  e.vx[i] = 0; e.vy[i] = 0;
  e.hp[i] = spec.hp * hpMult(w.stage) * (1 + rage * rc.hp);
  e.maxHp[i] = e.hp[i];
  e.speed[i] = spec.speed * (1 + rage * rc.speed);
  e.r[i] = spec.r;
  e.dmg[i] = spec.dmg * atkMult(w.stage) * (1 + rage * rc.dmg);
  e.xp[i] = spec.xp * xpMult(w.stage);
  e.sides[i] = spec.sides;
  e.flash[i] = 0;
  e.phase[i] = w.rand() * Math.PI * 2;
  e.slowT[i] = 0; e.burnT[i] = 0; e.stunT[i] = 0; e.pullT[i] = 0; e.markT[i] = 0;
  e.burnDps[i] = 0;
  e.rank[i] = rank;
  e.hideT[i] = 0;
  e.shootCd[i] = 1 + w.rand() * 2;
  e.dashT[i] = 0;
  e.dirX[i] = 0; e.dirY[i] = 0;
  e.buff[i] = 0;
  e.life[i] = 0;
  e.age[i] = 0;
  return i;
}

/** 도형별 색 번호 (파티클·이펙트용) */
export function mobColor(w: World, i: number): number {
  const k = w.enemies.kind[i];
  return k < MOB_KINDS.length ? PC.mob + k : w.enemies.rank[i] === 3 ? PC.boss : PC.foe;
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
  opts?: { owner?: number; tags?: number; flag?: number; tick?: number },
): number {
  const h = w.hazards;
  const i = freeSlot(h.alive);
  if (i < 0) return -1;
  h.alive[i] = 1;
  h.x[i] = x; h.y[i] = y; h.r[i] = r;
  h.life[i] = life; h.max[i] = life; h.dps[i] = dps; h.tick[i] = opts?.tick ?? 0;
  h.kind[i] = kind;
  h.owner[i] = opts?.owner ?? -1;
  h.tags[i] = opts?.tags ?? TAG.aoe;
  h.flag[i] = opts?.flag ?? 0;
  return i;
}

/** 그리기 전용 이펙트 — 풀이 차면 조용히 버린다 */
export function spawnFx(
  w: World, kind: number, x: number, y: number, life: number, r: number,
  opts?: { ang?: number; x2?: number; y2?: number; color?: number },
): void {
  // 동작 줄이기 모드에서도 공격이 어디로 갔는지 보여 주는 선(부채꼴·번개·광선)은 남긴다
  if (w.reduced && kind !== FX.cone && kind !== FX.chain && kind !== FX.beam) return;
  const f = w.fx;
  const i = freeSlot(f.alive);
  if (i < 0) return;
  f.alive[i] = 1;
  f.kind[i] = kind;
  f.x[i] = x; f.y[i] = y;
  f.x2[i] = opts?.x2 ?? x; f.y2[i] = opts?.y2 ?? y;
  f.ang[i] = opts?.ang ?? 0;
  f.r[i] = r;
  f.life[i] = life; f.max[i] = life;
  f.color[i] = opts?.color ?? PC.mine;
}

/** 레이저 한 줄 (x,y 에서 ang 방향으로 len 만큼) */
export function spawnBeam(
  w: World, x: number, y: number, ang: number, len: number, width: number,
  warn: number, fire: number, dmg: number, kind: number,
): number {
  const b = w.beams;
  const i = freeSlot(b.alive);
  if (i < 0) return -1;
  b.alive[i] = 1;
  b.x[i] = x; b.y[i] = y; b.ang[i] = ang; b.len[i] = len; b.width[i] = width;
  b.warn[i] = warn; b.fire[i] = fire; b.dmg[i] = dmg; b.kind[i] = kind; b.hit[i] = 0;
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

/** 각도 차 (-π~π) */
export function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * 보스가 이 방향에서 오는 피해를 받는가.
 * 🔵 구각형 약점(노란 임팩트) · 🕛 십오각형 시계(12시/6시)가 이 한 곳을 쓴다.
 */
export function bossTakesFrom(w: World, i: number): boolean {
  const b = w.boss;
  if (b.intro > 0 || b.shield > 0) return false;
  if (!b.gateOn) return true;
  const sx = w.hitOn ? w.hitX : w.player.x;
  const sy = w.hitOn ? w.hitY : w.player.y;
  const a = Math.atan2(sy - w.enemies.y[i], sx - w.enemies.x[i]);
  for (let k = 0; k < b.gateN; k++) {
    if (Math.abs(angleDiff(a, b.gateA[k])) <= b.gateW) return true;
  }
  return false;
}

/**
 * 적에게 피해. 치명타·속성 연계(§6.2)를 여기서 한 번에 처리한다.
 * 반환값은 "이 타격으로 죽었는가".
 */
export function damageEnemy(w: World, i: number, amount: number, tags: number, crit = true): boolean {
  const e = w.enemies;
  if (!e.alive[i] || amount <= 0) return false;

  const isBoss = e.rank[i] === 3 && i === w.boss.idx;
  if (isBoss && !bossTakesFrom(w, i)) {
    // 막혔다 — 작은 불꽃만 튀고 피해는 없다
    if (w.frame % 6 === 0) spawnParticle(w, e.x[i], e.y[i], (w.rand() - 0.5) * 80, (w.rand() - 0.5) * 80, 0.18, 2, PC.text);
    return false;
  }

  let dmg = amount;

  // ❄️ 둔화 + ⚡ 전기 = ×2 (감전 증폭)
  if (e.slowT[i] > 0 && tags & TAG.electric) dmg *= 2;
  // 🕳️ 흡입 + 광역 = +50%
  if (e.pullT[i] > 0 && tags & TAG.aoe) dmg *= 1.5;

  // 🔍 취약점 분석 — 보스·소환물·특수 몬스터
  if (w.stats.bossDamage !== 1 && (e.rank[i] >= 1 || SPECIAL_KIND[e.kind[i]])) dmg *= w.stats.bossDamage;
  // 🚨 페일세이프 — 체력이 낮을 때
  if (w.stats.lowHpDamage !== 1 && w.player.hp <= w.player.maxHp * LOW_HP_RATIO) dmg *= w.stats.lowHpDamage;

  // 🎯 표식 + 관통 = 치명타 확정
  let isCrit = false;
  if (e.markT[i] > 0 && tags & TAG.pierce) isCrit = true;
  else if (crit && w.rand() < w.stats.critRate) isCrit = true;
  if (isCrit) dmg *= w.stats.critDamage;

  e.hp[i] -= dmg;
  e.flash[i] = CFG.feedback.hitFlashSec;

  if (isBoss) {
    // 🔵 구각형 — 때리면 포식 게이지가 준다
    if (w.boss.kind === "nona") {
      w.boss.nonaGauge = Math.max(0, w.boss.nonaGauge - (dmg / Math.max(1, w.boss.maxHp)) * 100 * CFG.nona.gaugePerHpPct);
    }
    // 🟥 십삼각형 — 맞을수록 느려진다 (§11 "공격으로 속도를 감소")
    if (w.boss.kind === "trideca") {
      w.boss.triSlowF = Math.max(CFG.trideca.slowMin, w.boss.triSlowF - CFG.trideca.slowPerHit);
    }
  }

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

  if (isCrit && dmg >= 60) pushLog(w, "CRIT", msg("crit", { dmg: Math.round(dmg) }));

  if (e.hp[i] <= 0) {
    killEnemy(w, i);
    return true;
  }
  return false;
}

/** 경험치·기록 없이 없앤다 (콜로세움 입장 · 분신 자폭) */
export function removeEnemy(w: World, i: number, fx = true): void {
  const e = w.enemies;
  if (!e.alive[i]) return;
  e.alive[i] = 0;
  if (fx) burst(w, e.x[i], e.y[i], 6, mobColor(w, i), 90);
}

export function killEnemy(w: World, i: number): void {
  const e = w.enemies;
  if (!e.alive[i]) return;
  const x = e.x[i];
  const y = e.y[i];
  const rank = e.rank[i];

  const color = mobColor(w, i);
  e.alive[i] = 0;
  w.run.kills += 1;
  if (!(rank === 3 && i === w.boss.idx)) w.cues |= rank >= 1 ? CUE.elite : CUE.kill;
  // 네온 파편 + 퍼지는 링 (도형 색)
  burst(w, x, y, rank >= 1 ? 18 : 9, color, rank >= 1 ? 240 : 150);
  spawnFx(w, FX.death, x, y, 0.35, e.r[i], { color, ang: e.phase[i] });
  spawnOrb(w, x, y, e.xp[i]);

  // ♻️ 가비지 컬렉터
  if (w.stats.lifestealRate > 0 && w.rand() < w.stats.lifestealRate) healPlayer(w, 2);

  // 🍴 포크 밤 — 잡몹이 확률로 터진다 (폭발은 다음 프레임, skills.ts)
  const q = w.pops;
  if (q.chance > 0 && rank === 0 && q.n < q.x.length && w.rand() < q.chance) {
    q.x[q.n] = x;
    q.y[q.n] = y;
    q.n++;
  }

  // ⏪ 시간 역주행이 되살릴 수 있게 잡몹만 기억한다
  if (rank === 0 && e.kind[i] < MOB_KINDS.length) {
    const m = w.killMem;
    m.kind[m.head] = e.kind[i];
    m.x[m.head] = x;
    m.y[m.head] = y;
    m.head = (m.head + 1) % m.kind.length;
    m.n = Math.min(m.kind.length, m.n + 1);
  }

  if (rank === 3 && i === w.boss.idx) {
    w.boss.active = false;
    w.boss.defeated = true;
  }
}

export function healPlayer(w: World, amount: number): void {
  w.player.hp = Math.min(w.player.maxHp, w.player.hp + amount);
}

/** 피격 스프라이트를 보여 주는 시간 */
const PLAYER_HIT_SEC = 0.35;

/** 부엉이 감정 표시 (기쁨·화남·놀람) */
export function emote(w: World, kind: 1 | 2 | 3, sec = 1.4): void {
  w.player.emote = kind;
  w.player.emoteT = sec;
}

function die(w: World, reason: Msg): void {
  const p = w.player;
  p.hp = 0;
  p.alive = false;
  w.over = true;
  w.overReason = reason;
  w.cues |= CUE.death;
  pushLog(w, "FATAL", msg("down"));
}

/** 죽을 때의 사유 — 보스전이면 보스 이름, 아니면 포위 */
function deathReason(w: World): Msg {
  return w.boss.active && w.boss.kind ? msg("overBoss", { boss: ref(`boss.${w.boss.kind}`) }) : msg("overMobs");
}

/** HP 가 0 이 됐을 때 — 부활(P13/E12)이 남았으면 살린다 */
function onZeroHp(w: World, reason: Msg): void {
  const p = w.player;
  if (w.stats.revives > w.run.revivesUsed) {
    w.run.revivesUsed += 1;
    p.hp = Math.max(1, Math.round(p.maxHp * (w.stats.reviveHeal || 0.35)));
    p.invuln = w.stats.reviveIFrame;
    p.alive = true;
    w.flash = Math.max(w.flash, 0.3);
    w.cues |= CUE.revive;
    pushLog(w, "FATAL", msg("revive", { sec: w.stats.reviveIFrame.toFixed(1) }));
    if (w.stats.reviveBlast) {
      for (let i = 0; i < w.enemies.cap; i++) {
        if (w.enemies.alive[i] && w.enemies.rank[i] === 0) damageEnemy(w, i, 400, TAG.explosion | TAG.aoe, false);
      }
      pushLog(w, "EVO", msg("failover"));
    }
    return;
  }
  die(w, reason);
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
    w.cues |= CUE.shield;
    pushLog(w, "INFO", msg("stealthUsed"));
    return;
  }

  // 📉 패킷 손실 — 확률로 흘린다 (짧은 무적을 줘서 같은 접촉으로 매 프레임 다시 굴리지 않게)
  if (w.stats.dodge > 0 && w.rand() < w.stats.dodge) {
    p.iframe = w.stats.iFrame * 0.5;
    burst(w, p.x, p.y, 6, PC.text, 120);
    w.cues |= CUE.dodge;
    pushLog(w, "INFO", msg("dodged"));
    return;
  }

  const dmg = Math.max(1, Math.round(amount * w.stats.damageTaken));
  p.hp -= dmg;
  p.iframe = w.stats.iFrame;
  p.hitT = PLAYER_HIT_SEC;
  p.noHitT = 0;
  w.run.damageTaken += 1;
  w.run.hits += 1;
  w.cues |= CUE.hit;

  w.shake = Math.max(w.shake, fromBoss ? CFG.feedback.bossShakeSec : CFG.feedback.shakeSec);
  w.shakePx = fromBoss ? CFG.feedback.bossShakePx : CFG.feedback.shakePx;
  if (fromBoss) w.flash = Math.max(w.flash, 0.12);
  w.vignette = 0.5;

  pushLog(w, "WARN", msg("hurt", { dmg, hp: Math.max(0, Math.round(p.hp)), max: Math.round(p.maxHp) }));

  // ↩️ 역추적 — 맞은 순간 주변을 되받아친다
  if (w.stats.thorns > 0) {
    const hit = w.stats.thorns * w.stats.damage;
    const e = w.enemies;
    forEachEnemyNear(w, p.x, p.y, THORNS_R + 30, (i) => {
      if (!e.alive[i] || Math.hypot(e.x[i] - p.x, e.y[i] - p.y) > THORNS_R + e.r[i]) return;
      damageEnemy(w, i, hit, TAG.physical, false);
    });
    spawnFx(w, FX.ring, p.x, p.y, 0.3, THORNS_R, { color: PC.mineAlt });
  }

  if (p.hp <= 0) onZeroHp(w, deathReason(w));
}

/** ↩️ 역추적 반격 반경 */
const THORNS_R = 130;

/**
 * 즉사 (폭격 원 · 빨간 장판 · 콜로세움 붕괴).
 * 쉴드·피격 무적은 무시하지만, 부활 무적과 부활 패시브는 그대로 통한다 — 빌드가 의미를 잃지 않게.
 */
export function killPlayer(w: World, reason: Msg): void {
  const p = w.player;
  if (!p.alive || p.invuln > 0 || w.over) return;
  w.run.damageTaken += 1;
  w.run.hits += 1;
  w.shake = Math.max(w.shake, CFG.feedback.bossShakeSec);
  w.shakePx = CFG.feedback.bossShakePx;
  w.flash = Math.max(w.flash, 0.3);
  w.cues |= CUE.hit;
  pushLog(w, "FATAL", msg("lethal"));
  p.hp = 0;
  onZeroHp(w, reason);
}

/** 지속 피해 (콜로세움 밖) — 피격 무적 없이 조금씩 깎는다 */
export function drainPlayer(w: World, amount: number): void {
  const p = w.player;
  if (!p.alive || p.invuln > 0 || w.over || amount <= 0) return;
  p.hp -= amount;
  p.noHitT = 0;
  w.vignette = Math.max(w.vignette, 0.3);
  if (p.hp <= 0) {
    w.run.damageTaken += 1;
    onZeroHp(w, deathReason(w));
  }
}

/** 💀 최후의 심판 — 무엇으로도 막을 수 없다 */
export function judgePlayer(w: World): void {
  if (w.over) return;
  w.run.damageTaken += 1;
  die(w, msg("overTime"));
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

/** 점 (px,py) 와 선분 사이 거리의 제곱 */
export function segDist2(px: number, py: number, x: number, y: number, ang: number, len: number): number {
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const t = Math.max(0, Math.min(len, (px - x) * dx + (py - y) * dy));
  const qx = x + dx * t - px;
  const qy = y + dy * t - py;
  return qx * qx + qy * qy;
}

export type { Stats };
