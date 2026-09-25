// 🦉 아울 서바이버즈 v2 — 스테이지 1~15 + 무한 스테이지 (기획서 §4·§5)

import { CFG } from "../config";

export type EnemyKind =
  | "bug" | "worm" | "spark" | "frost" | "wire" | "trojan" | "botnet" | "ransom"
  | "spyware" | "mimic" | "rootkit" | "miner" | "exploit" | "warp" | "elite";

export type EnemySpec = {
  hp: number;
  speed: number;
  r: number;
  dmg: number;
  xp: number;
  /** 다각형 변 수 (§10.3 — 등급이 올라갈수록 변이 많아진다) */
  sides: number;
  /** 특수 행동 */
  trait?: "zigzag" | "split" | "slow" | "heal" | "blink" | "stealth" | "shoot";
};

/** 적 스펙 — HP·XP 는 기획서 기준, 속도·반경·접촉 피해는 "느림/보통/빠름" 서술을 수치화한 값 */
export const ENEMY_SPEC: Record<EnemyKind, EnemySpec> = {
  bug:     { hp: 10,  speed: 52,  r: 9,  dmg: 4,  xp: 1, sides: 3 },
  worm:    { hp: 8,   speed: 104, r: 8,  dmg: 3,  xp: 2, sides: 4, trait: "zigzag" },
  spark:   { hp: 14,  speed: 88,  r: 9,  dmg: 6,  xp: 2, sides: 4 },
  frost:   { hp: 26,  speed: 62,  r: 12, dmg: 6,  xp: 3, sides: 5, trait: "slow" },
  wire:    { hp: 20,  speed: 96,  r: 10, dmg: 5,  xp: 3, sides: 4, trait: "zigzag" },
  trojan:  { hp: 45,  speed: 46,  r: 15, dmg: 8,  xp: 3, sides: 5, trait: "split" },
  botnet:  { hp: 6,   speed: 74,  r: 7,  dmg: 3,  xp: 1, sides: 3 },
  ransom:  { hp: 90,  speed: 44,  r: 18, dmg: 10, xp: 5, sides: 6, trait: "slow" },
  spyware: { hp: 34,  speed: 70,  r: 12, dmg: 7,  xp: 4, sides: 5, trait: "shoot" },
  mimic:   { hp: 60,  speed: 40,  r: 16, dmg: 12, xp: 6, sides: 5, trait: "stealth" },
  rootkit: { hp: 70,  speed: 80,  r: 14, dmg: 9,  xp: 6, sides: 6, trait: "blink" },
  miner:   { hp: 80,  speed: 50,  r: 15, dmg: 8,  xp: 6, sides: 6, trait: "heal" },
  exploit: { hp: 55,  speed: 92,  r: 13, dmg: 10, xp: 5, sides: 5, trait: "shoot" },
  warp:    { hp: 48,  speed: 86,  r: 12, dmg: 9,  xp: 5, sides: 5, trait: "blink" },
  elite:   { hp: 400, speed: 78,  r: 26, dmg: 16, xp: 25, sides: 6 },
};

export const ENEMY_KINDS = Object.keys(ENEMY_SPEC) as EnemyKind[];

/** 보스·중간보스 패턴 (engine/boss.ts 가 구현한다) */
export type PatternId =
  | "summon" | "radial" | "field" | "charge" | "sweep"
  | "rain" | "clones" | "stealth" | "drain" | "blackhole" | "whip" | "random";

export type BossDef = {
  emoji: string;
  name: string;
  hp: number;
  /** 페이즈가 올라갈수록 patterns[0..n] 이 같이 돈다 */
  patterns: PatternId[];
};

export type StageDef = {
  id: number;
  name: string;
  enemies: EnemyKind[];
  midboss: { name: string; pattern: PatternId };
  boss: BossDef;
};

export const STAGES: StageDef[] = [
  { id: 1,  name: "서버실 B1",      enemies: ["bug", "worm"],
    midboss: { name: "버그 알파", pattern: "charge" },
    boss: { emoji: "🐛", name: "버그 퀸", hp: 1500, patterns: ["summon", "field"] } },
  { id: 2,  name: "전력 분전실",    enemies: ["bug", "worm", "spark"],
    midboss: { name: "스파크 코어", pattern: "radial" },
    boss: { emoji: "⚡", name: "과부하 코어", hp: 1750, patterns: ["radial", "field"] } },
  { id: 3,  name: "냉각탑",         enemies: ["worm", "spark", "frost"],
    midboss: { name: "아이스 웜", pattern: "field" },
    boss: { emoji: "❄️", name: "프로즌 데몬", hp: 2000, patterns: ["field", "rain"] } },
  { id: 4,  name: "배선 미로",      enemies: ["spark", "frost", "wire"],
    midboss: { name: "케이블 헤드", pattern: "whip" },
    boss: { emoji: "🕸️", name: "케이블 나가", hp: 2200, patterns: ["whip", "field", "summon"] } },
  { id: 5,  name: "데이터 아카이브", enemies: ["wire", "bug", "trojan"],
    midboss: { name: "목마 유닛", pattern: "summon" },
    boss: { emoji: "🐴", name: "트로이 킹", hp: 2400, patterns: ["summon", "clones"] } },
  { id: 6,  name: "통신 중계실",    enemies: ["trojan", "botnet", "worm"],
    midboss: { name: "노드 마스터", pattern: "rain" },
    boss: { emoji: "📡", name: "봇넷 마스터", hp: 2600, patterns: ["summon", "sweep", "rain"] } },
  { id: 7,  name: "폐기물 처리장",  enemies: ["botnet", "ransom", "wire"],
    midboss: { name: "락 유닛", pattern: "field" },
    boss: { emoji: "🔒", name: "랜섬 락", hp: 2900, patterns: ["field", "drain", "charge"] } },
  { id: 8,  name: "보안 관제실",    enemies: ["ransom", "spyware", "spark"],
    midboss: { name: "아이 드론", pattern: "sweep" },
    boss: { emoji: "👁️", name: "스파이웨어 아이", hp: 3100, patterns: ["sweep", "radial", "field"] } },
  { id: 9,  name: "백업 볼트",      enemies: ["spyware", "mimic", "trojan"],
    midboss: { name: "미믹 상자", pattern: "charge" },
    boss: { emoji: "🧿", name: "미믹 로드", hp: 3300, patterns: ["clones", "charge", "summon"] } },
  { id: 10, name: "루트 코어",      enemies: ["mimic", "rootkit", "botnet"],
    midboss: { name: "섀도 유닛", pattern: "stealth" },
    boss: { emoji: "🌑", name: "루트킷", hp: 3600, patterns: ["stealth", "charge", "radial"] } },
  { id: 11, name: "채굴장",         enemies: ["rootkit", "miner", "bug"],
    midboss: { name: "해시 유닛", pattern: "drain" },
    boss: { emoji: "💰", name: "크립토 마이너", hp: 3800, patterns: ["drain", "field", "summon"] } },
  { id: 12, name: "제로데이 랩",    enemies: ["miner", "exploit", "spark"],
    midboss: { name: "페이로드", pattern: "random" },
    boss: { emoji: "💥", name: "제로데이", hp: 4000, patterns: ["random", "random", "random"] } },
  { id: 13, name: "웜홀 게이트",    enemies: ["exploit", "warp", "worm"],
    midboss: { name: "게이트 유닛", pattern: "blackhole" },
    boss: { emoji: "🕳️", name: "웜홀", hp: 4300, patterns: ["blackhole", "charge", "rain"] } },
  { id: 14, name: "APT 요새",       enemies: ["warp", "elite", "ransom"],
    midboss: { name: "정찰 대장", pattern: "sweep" },
    boss: { emoji: "🎯", name: "APT 핸들러", hp: 4600, patterns: ["sweep", "summon", "charge"] } },
  { id: 15, name: "루트 오버로드",  enemies: ["elite", "rootkit", "exploit", "mimic"],
    midboss: { name: "가디언", pattern: "radial" },
    boss: { emoji: "👹", name: "루트 오버로드", hp: 5200, patterns: ["sweep", "charge", "field"] } },
];

/** 무한 구간 특수 규칙 (§5) */
export type EndlessRule = "dark" | "halfheal" | "fast" | "elite";
export const ENDLESS_RULES: { id: EndlessRule; label: string; emoji: string }[] = [
  { id: "dark", label: "시야 제한", emoji: "🌑" },
  { id: "halfheal", label: "회복 반감", emoji: "🩸" },
  { id: "fast", label: "적 이동속도 +30%", emoji: "💨" },
  { id: "elite", label: "엘리트 2배", emoji: "🎯" },
];

export type StageInfo = StageDef & { endless: boolean; rule: EndlessRule | null };

/** 스테이지 번호 → 구성. 16 이상은 15개를 돌려 쓰되 보스·규칙이 달라진다 (§5) */
export function stageInfo(stage: number): StageInfo {
  const s = Math.max(1, Math.floor(stage));
  if (s <= CFG.stage.count) {
    return { ...STAGES[s - 1], endless: false, rule: null };
  }

  const base = STAGES[(s - 1) % CFG.stage.count];
  const rule =
    s % CFG.stage.endlessRuleEvery === 0
      ? ENDLESS_RULES[Math.floor(s / CFG.stage.endlessRuleEvery) % ENDLESS_RULES.length].id
      : null;

  // 5스테이지마다 "강화판" — 패턴이 2개 더 붙는다
  const boosted = s % CFG.stage.endlessBossEvery === 0;
  const extra: PatternId[] = boosted ? ["summon", "radial"] : [];

  return {
    ...base,
    id: s,
    name: `${base.name} +${s - CFG.stage.count}`,
    endless: true,
    rule,
    boss: {
      ...base.boss,
      name: boosted ? `${base.boss.name} MK-${Math.floor(s / CFG.stage.endlessBossEvery)}` : base.boss.name,
      patterns: [...base.boss.patterns, ...extra],
    },
  };
}
