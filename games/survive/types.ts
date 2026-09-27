// 🦉 아울 서바이버즈 v2 — 타입 계약 (기획서 §7·§11.3)
// UI·엔진·서버가 공유하는 모양은 전부 여기에 있다.

import type { Msg } from "@/games/core/i18n";
import type { ThemeId } from "./theme";

export type ActiveId =
  | "A01" | "A02" | "A03" | "A04" | "A05" | "A06" | "A07" | "A08" | "A09" | "A10"
  | "A11" | "A12" | "A13" | "A14" | "A15" | "A16" | "A17" | "A18" | "A19" | "A20"
  | "A21" | "A22" | "A23" | "A24" | "A25" | "A26" | "A27" | "A28" | "A29" | "A30"
  | "A31" | "A32" | "A33" | "A34" | "A35";

export type PassiveId =
  | "P01" | "P02" | "P03" | "P04" | "P05" | "P06" | "P07" | "P08" | "P09"
  | "P10" | "P11" | "P12" | "P13" | "P14" | "P15" | "P16" | "P17" | "P18"
  | "P19" | "P20" | "P21" | "P22" | "P23" | "P24" | "P25" | "P26" | "P27" | "P28";

export type EvoId =
  | "E01" | "E02" | "E03" | "E04" | "E05" | "E06" | "E07" | "E08" | "E09" | "E10" | "E11" | "E12"
  | "E13" | "E14" | "E15" | "E16" | "E17" | "E18" | "E19" | "E20" | "E21" | "E22" | "E23" | "E24"
  | "E25" | "E26" | "E27";

export type SkillId = ActiveId | PassiveId | EvoId;

/** 액티브 동작 유형 — 같은 유형은 같은 update 핸들러를 쓴다 (§14 skills/) */
export type Archetype =
  | "homing"    // 추적 투사체
  | "beam"      // 조준 방향 관통 레이저
  | "aura"      // 주변 지속 장판
  | "line"      // 좌우 관통 빔
  | "orbit"     // 궤도 위성
  | "trap"      // 설치·유인 후 폭발
  | "heal"      // 회복 + 주변 피해
  | "spray"     // 무작위 난사
  | "onkill"    // 처치 수 조건 발동
  | "boomerang" // 왕복 투사체
  | "cone"      // 전방 원뿔
  | "chain"     // 연쇄 번개
  | "pull"      // 흡입 장판
  | "drone"     // 소환물
  | "bomb"      // 지연 폭발
  | "stun"      // 행동 정지 장판
  | "melee"     // 주변 베기
  | "wave"      // 링 파동 + 넉백
  | "burn"      // 화염 장판
  | "strike"    // 무작위 낙하 폭격
  | "barrier"   // 주변 적 탄 삭제 + 밀쳐내기
  | "split"     // 맞히면 갈라지는 투사체
  | "snipe"     // 가장 단단한 적(보스 우선) 저격
  | "sweep"     // 주위를 도는 레이저
  | "trail"     // 지나간 자리에 장판
  | "execute"   // 체력이 낮은 적 즉시 처치
  | "cross"     // 십자 방향 연쇄 폭발
  | "turret"    // 제자리 포탑
  | "zap"       // 무작위 적에게 낙뢰
  | "shotgun"   // 전방 산탄
  | "mine"      // 밟으면 터지는 지뢰
  | "disc"      // 천천히 나아가며 갈아내는 원반
  | "pop"       // 처치한 적이 확률로 폭발
  | "emp"       // 주변 기절 파동
  | "whip";     // 앞뒤로 번갈아 긴 베기

/** 피해 태그 — 속성 연계(§6.2) 판정에 쓴다 */
export type DamageTag = "physical" | "electric" | "explosion" | "aoe" | "pierce";

/** 적에게 걸리는 상태이상 */
export type StatusId = "slow" | "burn" | "pull" | "mark" | "stun";

export type ActiveSkill = {
  id: ActiveId;
  name: string;
  emoji: string;
  arch: Archetype;
  /** 카드 한 줄 설명 */
  desc: string;
  /** Lv1 기준 값 */
  cd: number;
  dmg: number;
  count: number;
  radius: number;
  speed: number;
  pierce: number;
  duration: number;
  tags: DamageTag[];
  status: StatusId | null;
  /** 진화체와 조건 패시브 */
  evo: EvoId | null;
  evoReq: PassiveId | null;
};

export type PassiveSkill = {
  id: PassiveId;
  name: string;
  emoji: string;
  /** 레벨당 설명 */
  desc: string;
};

export type EvolutionSkill = {
  id: EvoId;
  name: string;
  emoji: string;
  desc: string;
  /** 진화 재료 (액티브 MAX + 패시브 Lv3) — E12 만 패시브 기반이다 */
  base: ActiveId | PassiveId;
  req: PassiveId;
};

/** 런 중 플레이어 스탯 (패시브가 누적으로 바꾼다) */
export type Stats = {
  damage: number;
  cooldown: number;
  projectiles: number;
  projSpeed: number;
  maxHp: number;
  damageTaken: number;
  pickup: number;
  speed: number;
  critRate: number;
  critDamage: number;
  duration: number;
  xpGain: number;
  iFrame: number;
  /** 처치 시 회복 확률·양 (P11) */
  lifestealRate: number;
  /** 초당 회복 (P12) */
  regen: number;
  /** 쿨다운 즉시 초기화 확률 (P16) */
  resetChance: number;
  /** 추가 타격 (P17) */
  extraStrike: number;
  /** 무피격 유지 시 쉴드 (P18) */
  shieldSec: number;
  /** 부활 횟수·무적 (P13/E12) */
  revives: number;
  reviveIFrame: number;
  reviveHeal: number;
  reviveBlast: boolean;
  /** 스킬 범위 배율 (P19) */
  area: number;
  /** 보스·특수 몬스터에게 주는 피해 배율 (P20) */
  bossDamage: number;
  /** 투사체 관통 추가 (P21) */
  pierce: number;
  /** 상태이상(둔화·화상·기절·표식) 지속 배율 (P22) */
  statusDur: number;
  /** 레벨업할 때마다 회복 (P24) */
  levelHeal: number;
  /** 피격 시 주변 반격 피해 (P25) */
  thorns: number;
  /** 피격 회피 확률 (P26) */
  dodge: number;
  /** 체력이 낮을 때 피해 배율 (P27) */
  lowHpDamage: number;
  /** 액티브가 한 번 더 발동할 확률 (P28) */
  doubleCast: number;
};

export type SkillSlot = { id: ActiveId; lv: number; evo: EvoId | null; cd: number };
export type PassiveSlot = { id: PassiveId; lv: number };

export type CardKind = "evolution" | "new-active" | "up-active" | "new-passive" | "up-passive";
export type Card = {
  kind: CardKind;
  id: SkillId;
  name: string;
  emoji: string;
  desc: string;
  /** "신규" / "Lv2 → 3" / "진화" */
  level: string;
};

export type LogTag = "INFO" | "WARN" | "CRIT" | "DROP" | "EVO" | "ALERT" | "FATAL";
/** 엔진은 문구 대신 메시지 키를 담는다 (`games/core/i18n.ts`) */
export type LogLine = { tag: LogTag; m: Msg; t: number };

/** 서버 검증용 meta (§11.3) — 키 구성이 서버와 1:1이라 마음대로 늘리면 안 된다 */
export type SurviveMeta = {
  /** 도달한 단계 (1~) */
  stage: number;
  /** 십오각형(최종 보스)을 한 번이라도 잡았는가 */
  cleared: boolean;
  /** 잡은 보스 수 — 보스를 잡아야 다음 단계로 가므로 도달 단계와 짝이 맞는다 */
  bosses: number;
  duration_s: number;
  kills: number;
  level: number;
  evolutions: number;
  obstacles: number;
  damage_taken: number;
  revives_used: number;
  theme: ThemeId;
  /** ["E01","A02:5","P03:4"] — 결과 화면의 빌드 요약 */
  build: string[];
  device: "mobile" | "desktop";
  owl_energy_found: boolean;
  v: string;
};
