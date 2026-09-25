// 🚀 아울스페이스 — 스테이지 1~15 + 엔드리스 (기획서 §6)

import { CFG } from "../config";

export type EnemyKind = "scout" | "drone" | "turret" | "swarm" | "bomber" | "mine" | "elite";

export type EnemySpec = {
  hp: number;
  speed: number;
  r: number;
  /** 다각형 변 수 (도형 기반 미니멀, §9) */
  sides: number;
  /** 쓰는 패턴 id (data/patterns.ts) */
  pattern: string;
  /** 처치 시 칩 수 */
  chips: number;
  /** 자폭형인가 */
  suicide?: boolean;
};

export const ENEMY_SPEC: Record<EnemyKind, EnemySpec> = {
  scout:  { hp: 14, speed: 120, r: 13, sides: 3, pattern: "mob.single", chips: 1 },
  drone:  { hp: 22, speed: 90,  r: 15, sides: 4, pattern: "mob.triple", chips: 1 },
  turret: { hp: 40, speed: 40,  r: 18, sides: 5, pattern: "mob.ring",   chips: 2 },
  swarm:  { hp: 8,  speed: 180, r: 10, sides: 3, pattern: "mob.single", chips: 1 },
  bomber: { hp: 30, speed: 150, r: 16, sides: 4, pattern: "mob.homing", chips: 2, suicide: true },
  mine:   { hp: 18, speed: 60,  r: 12, sides: 6, pattern: "mob.ring",   chips: 2 },
  elite:  { hp: 120, speed: 70, r: 22, sides: 6, pattern: "mob.homing", chips: 5 },
};

export const ENEMY_KINDS = Object.keys(ENEMY_SPEC) as EnemyKind[];

export type BossDef = {
  emoji: string;
  name: string;
  hp: number;
  /** 페이즈별 패턴 id. 체력이 줄면 다음 페이즈로 넘어간다 */
  phases: string[];
  /** 페이즈 전환 시 한 줄 팁 (실패 화면에 쓴다) */
  tip: string;
};

export type StageDef = {
  id: number;
  name: string;
  enemies: EnemyKind[];
  boss: BossDef;
  /** 신규 요소 안내 */
  note: string;
};

export const STAGES: StageDef[] = [
  { id: 1, name: "궤도 정거장", enemies: ["scout"], note: "저속 직선탄",
    boss: { emoji: "🛸", name: "스카우트 드론", hp: 900, phases: ["b1.spread", "b1.aimed"], tip: "확산탄은 가운데가 제일 안전해요" } },
  { id: 2, name: "위성 잔해대", enemies: ["scout", "drone"], note: "장애물(잔해) 등장",
    boss: { emoji: "🪨", name: "잔해 골렘", hp: 1100, phases: ["b2.shrapnel", "b1.spread"], tip: "산탄은 쏜 직후에 파고들면 빈틈이 있어요" } },
  { id: 3, name: "데이터 성운", enemies: ["drone", "scout"], note: "유도탄",
    boss: { emoji: "📡", name: "시그널 이터", hp: 1300, phases: ["b3.ringburst", "b1.aimed"], tip: "링은 벌어지기 전에 가까이 붙어 빠져나가세요" } },
  { id: 4, name: "방화벽 지대", enemies: ["turret", "drone"], note: "레이저 벽 (예고선 후 발사)",
    boss: { emoji: "🧱", name: "월 가디언", hp: 1500, phases: ["b4.laser3", "b3.ringburst"], tip: "예고선이 뜨면 선 사이로 미리 이동하세요" } },
  { id: 5, name: "봇넷 항로", enemies: ["swarm", "bomber"], note: "무리 편대·자폭 적",
    boss: { emoji: "🕸️", name: "스웜 퀸", hp: 1700, phases: ["b5.cross", "b2.shrapnel", "b3.ringburst"], tip: "소환된 소형기를 먼저 정리하세요" } },
  { id: 6, name: "냉각 링", enemies: ["mine", "drone"], note: "감속 장판",
    boss: { emoji: "❄️", name: "프로스트 링", hp: 1900, phases: ["b6.spiral", "b5.cross"], tip: "나선은 회전 방향과 같은 쪽으로 돌면 편해요" } },
  { id: 7, name: "채굴 벨트", enemies: ["turret", "mine"], note: "파괴 가능 광물 다수",
    boss: { emoji: "⛏️", name: "드릴 헤드", hp: 2100, phases: ["b7.drill", "b2.shrapnel"], tip: "돌진 직전에 옆으로 한 칸만 비켜도 됩니다" } },
  { id: 8, name: "감시망", enemies: ["turret", "elite"], note: "시야 레이저",
    boss: { emoji: "👁️", name: "옵저버", hp: 2300, phases: ["b8.trackLaser", "b6.spiral", "b3.ringburst"], tip: "추적 레이저는 예고선을 보고 크게 돌아가세요" } },
  { id: 9, name: "미러 필드", enemies: ["drone", "mine"], note: "반사탄",
    boss: { emoji: "🪞", name: "미러 코어", hp: 2500, phases: ["b9.bounce", "b5.cross"], tip: "벽에 붙지 마세요 — 반사탄이 되돌아옵니다" } },
  { id: 10, name: "다크 섹터", enemies: ["swarm", "bomber", "elite"], note: "시야 제한",
    boss: { emoji: "🌑", name: "보이드", hp: 2700, phases: ["b10.ambush", "b9.bounce"], tip: "사라지면 화면 가운데를 피해 대기하세요" } },
  { id: 11, name: "제로데이 필드", enemies: ["elite", "drone"], note: "랜덤 패턴 적",
    boss: { emoji: "💥", name: "익스플로잇", hp: 2900, phases: ["b11.random", "b7.drill", "b5.cross"], tip: "패턴이 매번 달라요. 판정점만 보세요" } },
  { id: 12, name: "웜홀 회랑", enemies: ["swarm", "turret"], note: "순간이동 적",
    boss: { emoji: "🕳️", name: "웜홀 코어", hp: 3100, phases: ["b12.vortex", "b3.ringburst"], tip: "흡입 중에는 반대로 밀지 말고 옆으로 도세요" } },
  { id: 13, name: "크립토 광맥", enemies: ["mine", "elite"], note: "자가회복 적",
    boss: { emoji: "💰", name: "마이너 로드", hp: 3300, phases: ["b13.dense", "b6.spiral"], tip: "밀집 산탄은 쏘는 순간 옆으로 크게 빠지세요" } },
  { id: 14, name: "APT 요새", enemies: ["elite", "bomber", "turret"], note: "정예 혼합",
    boss: { emoji: "🎯", name: "APT 핸들러", hp: 3600, phases: ["b14.mix", "b8.trackLaser", "b9.bounce"], tip: "패턴 3종이 섞여요. 예고선을 우선으로 보세요" } },
  { id: 15, name: "루트 스타", enemies: ["elite", "swarm", "turret", "bomber"], note: "최종전",
    boss: { emoji: "👹", name: "루트 스타", hp: 4200, phases: ["b15.p1", "b15.p2", "b15.p3"], tip: "3페이즈는 밀집탄이에요. 봄을 아끼지 마세요" } },
];

/** 엔드리스 특수 규칙 (§6) */
export type EndlessRule = "dark" | "fast" | "dense";
export const ENDLESS_RULES: { id: EndlessRule; label: string; emoji: string }[] = [
  { id: "dark", label: "시야 제한", emoji: "🌑" },
  { id: "fast", label: "탄 속도 +20%", emoji: "💨" },
  { id: "dense", label: "탄 밀도 +30%", emoji: "🎯" },
];

export type StageInfo = StageDef & { endless: boolean; rule: EndlessRule | null };

/** 스테이지 번호 → 구성. 16 이상은 15개를 돌려 쓰되 보스·규칙이 달라진다 */
export function stageInfo(stage: number): StageInfo {
  const s = Math.max(1, Math.floor(stage));
  if (s <= CFG.stage.count) return { ...STAGES[s - 1], endless: false, rule: null };

  const base = STAGES[(s - 1) % CFG.stage.count];
  const rule =
    s % CFG.stage.endlessRuleEvery === 0
      ? ENDLESS_RULES[Math.floor(s / CFG.stage.endlessRuleEvery) % ENDLESS_RULES.length].id
      : null;
  const boosted = s % CFG.stage.endlessBossEvery === 0;

  return {
    ...base,
    id: s,
    name: `${base.name} +${s - CFG.stage.count}`,
    endless: true,
    rule,
    boss: {
      ...base.boss,
      name: boosted ? `${base.boss.name} MK-${Math.floor(s / CFG.stage.endlessBossEvery)}` : base.boss.name,
      // 강화판은 페이즈가 하나 더 붙는다
      phases: boosted ? [...base.boss.phases, "b15.p3"] : base.boss.phases,
    },
  };
}
