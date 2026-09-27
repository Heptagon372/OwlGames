// 🦉 아울 서바이버즈 v3 — 몬스터 15단계 (기획서 §2·§4·§5)
//
// 몬스터는 도형이다. 단계마다 새 도형이 하나씩 풀리고, 앞 단계 도형은 계속 섞여 나온다.
// 이름은 여기에 두지 않는다 — 화면 문구는 `messages/*.json` 의 `hud.survive.enemy` 가 id 로 찾는다.

import { bossOf } from "../config";

export type MobKind =
  | "tri" | "square" | "circle" | "penta" | "hepta"
  | "octa" | "deca" | "hendeca" | "dodeca" | "tetradeca";

/** 보스 4종 — 5·8·12·15단계 (15는 16단계부터 4단계마다 다시 온다) */
export type BossKind = "hexa" | "nona" | "trideca" | "chrono";

/** 보스가 부리는 소환물 (⏱️ 시한폭탄 · 👥 시간의 분신) */
export type ExtraKind = "bomb" | "clone";

export type EnemyKind = MobKind | BossKind | ExtraKind;

export type Trait = "none" | "charge" | "shoot4" | "summon" | "regen";

export type EnemySpec = {
  hp: number;
  speed: number;
  r: number;
  dmg: number;
  xp: number;
  /** 변 수 — 0 이면 원 */
  sides: number;
  trait: Trait;
  /** 특수 몬스터 표시 (카드 테두리·HUD) */
  special: boolean;
  /** 동시에 살아 있을 수 있는 수 (특수 몬스터가 화면을 덮지 않게) */
  max: number;
};

/**
 * 몬스터 스펙. 기획서의 상대 관계를 수치로 옮겼다.
 *  - 삼각형은 시작 스킬(깃털 표창 11) 한 방에 죽는다
 *  - 사각형 = 삼각형 ×2 체력, 팔각형 = 사각형 ×2 체력
 *  - 십각형 = 원형 ×2 속도
 *  - 십이각형 = 느리고 약하지만 한 대가 아프다
 *  - 십사각형 = 체력이 가장 높고 가장 느리다 (그래서 가장 크다)
 *  - 몸집(`r`)은 적지 않는다 — `sizeOf(hp, speed)` 가 정한다
 */
/**
 * 몸집은 체력·속도에서 나온다 — **체력이 많을수록 크고, 빠를수록 작다**.
 * 삼각형(체력 10 · 속도 60)이 기준(9px)이고 7~24px 사이로 묶는다.
 * 그림(`assets.ts` 의 `MOB_ART`)도 이 반지름에 맞춰 그려지므로, 수치만 고치면 보이는 크기도 같이 바뀐다.
 */
export function sizeOf(hp: number, speed: number): number {
  const r = 9 * (hp / 10) ** 0.3 * (60 / speed) ** 0.22;
  return Math.round(Math.min(24, Math.max(7, r)));
}

type MobStat = Omit<EnemySpec, "r">;

const MOB_STAT: Record<MobKind, MobStat> = {
  tri:       { hp: 10,  speed: 60,  dmg: 5,  xp: 1,  sides: 3,  trait: "none",   special: false, max: 999 },
  square:    { hp: 20,  speed: 46,  dmg: 6,  xp: 2,  sides: 4,  trait: "none",   special: false, max: 999 },
  circle:    { hp: 15,  speed: 110, dmg: 5,  xp: 2,  sides: 0,  trait: "none",   special: false, max: 999 },
  penta:     { hp: 45,  speed: 55,  dmg: 8,  xp: 5,  sides: 5,  trait: "charge", special: true,  max: 6 },
  hepta:     { hp: 40,  speed: 50,  dmg: 6,  xp: 5,  sides: 7,  trait: "shoot4", special: true,  max: 6 },
  octa:      { hp: 40,  speed: 38,  dmg: 9,  xp: 4,  sides: 8,  trait: "none",   special: false, max: 999 },
  deca:      { hp: 8,   speed: 220, dmg: 6,  xp: 2,  sides: 10, trait: "none",   special: false, max: 999 },
  hendeca:   { hp: 70,  speed: 30,  dmg: 5,  xp: 10, sides: 11, trait: "summon", special: true,  max: 2 },
  dodeca:    { hp: 22,  speed: 34,  dmg: 30, xp: 5,  sides: 12, trait: "none",   special: false, max: 999 },
  tetradeca: { hp: 260, speed: 22,  dmg: 10, xp: 16, sides: 14, trait: "regen",  special: true,  max: 3 },
};

export const MOB_SPEC = Object.fromEntries(
  (Object.keys(MOB_STAT) as MobKind[]).map((k) => [k, { ...MOB_STAT[k], r: sizeOf(MOB_STAT[k].hp, MOB_STAT[k].speed) }]),
) as Record<MobKind, EnemySpec>;

/** 보스·소환물은 등장할 때 수치를 따로 넣는다 (config 의 보스 블록). 여기엔 모양만 */
const SHAPE_ONLY = { hp: 1, speed: 0, r: 20, dmg: 0, xp: 0, trait: "none", special: true, max: 999 } as const;

export const ENEMY_SPEC: Record<EnemyKind, EnemySpec> = {
  ...MOB_SPEC,
  hexa: { ...SHAPE_ONLY, sides: 6 },
  nona: { ...SHAPE_ONLY, sides: 9 },
  trideca: { ...SHAPE_ONLY, sides: 13 },
  chrono: { ...SHAPE_ONLY, sides: 15 },
  bomb: { ...SHAPE_ONLY, sides: 0 },
  clone: { ...SHAPE_ONLY, sides: 15 },
};

/** 풀 인덱스(Uint8)와 종류를 오가는 순서표 */
export const ENEMY_KINDS = Object.keys(ENEMY_SPEC) as EnemyKind[];
export const MOB_KINDS = Object.keys(MOB_SPEC) as MobKind[];

export type StageDef = {
  id: number;
  /** 이 단계에서 새로 풀리는 몬스터 */
  mob: MobKind | null;
  boss: BossKind | null;
  /** 14단계 — 보스 없이 모든 몬스터가 몰려오는 총력전 */
  allOut?: boolean;
};

/** 기획서 §2 표 (14·15단계는 DECISIONS §5-14: 십오각형을 15단계 최종 보스로) */
export const STAGES: StageDef[] = [
  { id: 1, mob: "tri", boss: null },
  { id: 2, mob: "square", boss: null },
  { id: 3, mob: "circle", boss: null },
  { id: 4, mob: "penta", boss: null },
  { id: 5, mob: null, boss: "hexa" },
  { id: 6, mob: "hepta", boss: null },
  { id: 7, mob: "octa", boss: null },
  { id: 8, mob: null, boss: "nona" },
  { id: 9, mob: "deca", boss: null },
  { id: 10, mob: "hendeca", boss: null },
  { id: 11, mob: "dodeca", boss: null },
  { id: 12, mob: null, boss: "trideca" },
  { id: 13, mob: "tetradeca", boss: null },
  { id: 14, mob: null, boss: null, allOut: true },
  { id: 15, mob: null, boss: "chrono" },
];

export type StageInfo = {
  id: number;
  mob: MobKind | null;
  boss: BossKind | null;
  allOut: boolean;
  endless: boolean;
  /** 이 단계에 나올 수 있는 몬스터 (마지막이 가장 최근에 풀린 것) */
  pool: MobKind[];
};

/** 단계 번호 → 구성. 16 이상은 모든 몬스터 + 4단계마다 십오각형 (§12) */
export function stageInfo(stage: number): StageInfo {
  const s = Math.max(1, Math.floor(stage));
  if (s <= STAGES.length) {
    const def = STAGES[s - 1];
    const pool: MobKind[] = [];
    for (let k = 0; k < s; k++) {
      const m = STAGES[k].mob;
      if (m) pool.push(m);
    }
    return { id: s, mob: def.mob, boss: def.boss, allOut: !!def.allOut, endless: false, pool };
  }
  return { id: s, mob: null, boss: bossOf(s), allOut: false, endless: true, pool: [...MOB_KINDS] };
}
