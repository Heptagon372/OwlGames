// 🚀 아울스페이스 — 타입 계약 (기획서 §5 · §10.3 · §13)

import type { ThemeId } from "./theme";

export type MainId = "M1" | "M2" | "M3" | "M4" | "M5" | "M6";
export type SubId =
  | "S1" | "S2" | "S3" | "S4" | "S5" | "S6"
  | "S7" | "S8" | "S9" | "S10" | "S11" | "S12";
export type PassiveId =
  | "P1" | "P2" | "P3" | "P4" | "P5" | "P6"
  | "P7" | "P8" | "P9" | "P10" | "P11" | "P12";
export type SkillId = MainId | SubId | PassiveId;

export type MainSkill = {
  id: MainId;
  name: string;
  emoji: string;
  desc: string;
  /** 발사 간격(초) · 피해 · 탄 수 */
  cd: number;
  dmg: number;
  count: number;
  speed: number;
  pierce: number;
};

export type SubSkill = { id: SubId; name: string; emoji: string; desc: string };
export type PassiveSkill = { id: PassiveId; name: string; emoji: string; desc: string };

/** 탄막 패턴 DSL (§13) — 보스 패턴은 전부 데이터다. 하드코딩 0 */
export type ShotType = "fan" | "ring" | "aimed" | "spiral" | "laser" | "random";

export type Shot = {
  /** 페이즈(루프) 시작 후 몇 초에 쏘는가 */
  at: number;
  type: ShotType;
  count: number;
  /** px/s */
  speed: number;
  /** 부채꼴 각도(도) */
  spread?: number;
  /** 시작 각도(도, 0 = 아래쪽) */
  angle?: number;
  repeat?: { times: number; intervalSec: number; rotateDeg?: number };
  /** 레이저 예고선 시간 — 레이저는 반드시 예고선이 먼저다 (§14-4) */
  warnSec?: number;
  /** 탄 크기 */
  r?: number;
};

export type Pattern = {
  id: string;
  shots: Shot[];
  loopSec: number;
};

export type Stats = {
  damage: number;
  fireRate: number;
  speed: number;
  hitboxR: number;
  bombMax: number;
  grazeScore: number;
  grazeRadius: number;
  chipGain: number;
  shieldSec: number;
  iFrame: number;
  bombKeepRate: number;
  pierce: number;
  critRate: number;
  critDamage: number;
  magnet: number;
};

export type MainSlot = { id: MainId; lv: number };
export type SubSlot = { id: SubId; lv: number };
export type PassiveSlot = { id: PassiveId; lv: number };

export type CardKind = "main" | "sub" | "passive";
export type Card = {
  kind: CardKind;
  id: SkillId;
  name: string;
  emoji: string;
  desc: string;
  level: string;
};

export type LogTag = "GRAZE" | "SKILL" | "ALERT" | "FATAL" | "INFO" | "DROP";
export type LogLine = { tag: LogTag; text: string; t: number };

/** 서버 검증용 meta (§10.3) — 키 구성이 서버와 1:1이라 마음대로 늘리면 안 된다 */
export type SpaceMeta = {
  stage: number;
  cleared: boolean;
  duration_s: number;
  kills: number;
  graze: number;
  chips: number;
  lives_left: number;
  bombs_unused: number;
  damage_taken: number;
  boss_killed: boolean;
  skills: string[];
  theme: ThemeId;
  device: "mobile" | "desktop";
  owl_energy_found: boolean;
  v: string;
};
