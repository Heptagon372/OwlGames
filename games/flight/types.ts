// 아울러닝 청크·엔티티 스키마 (기획서 §8 + 2.0 세트피스)
import type { Color, SizeKey } from "./config";

export type ItemKind =
  | "feather" // 🪶 에너지 +20
  | "bigFeather" // ⭐ 에너지 +50
  | "grow" // 🟢 크기 +1
  | "shrink" // 🔵 크기 -1
  | "shield" // 🛡️ 물리 충돌 1회 방어
  | "efficiency" // ⚡ 8초간 소비 50%
  | "rainbow" // 🌈 5초간 색 판정 무시
  | "gem" // 💎 점수 +150 (위험 위치)
  | "star" // 🎯 점수 +50
  | "owlEnergy" // 🦉 아울 에너지 (P3+ 저확률, 서버가 최종 지급 판정)
  // ── 2.0 ──
  | "magnet" // 🧲 주변 아이템 자동 흡수 (희귀)
  | "double" // ✖2 점수 2배 (희귀)
  | "rage" // 🔥 5초간 장애물 파괴 (전설)
  | "phantom" // 💜 짧은 무적 (전설)
  | "crown" // 👑 즉시 OWL FEVER (전설)
  | "golden"; // 🟡 황금 부엉이 +500 (좁은 틈)

export type ItemTier = "common" | "rare" | "legendary";

export type LaserPattern = "single" | "double" | "diag" | "cross" | "event";

/** 세트피스 입구에 놓여 부엉이가 지나가는 순간 발동하는 사건 */
export type TriggerEvent =
  | { k: "laser"; pattern: LaserPattern; ys: number[] }
  | { k: "barrage"; order: number[] }
  | { k: "missile"; count: number }
  | { k: "featherRain" }
  | { k: "storm" }
  | { k: "phantomWorld" }
  | { k: "turbo" }
  | { k: "colorChaos" }
  | { k: "glitch" }
  | { k: "golden" };

export type ZoneKind = "wave" | "flip" | "gravityChaos";

export type Entity =
  /** 상하 기둥 쌍 — gapY 중심, gapH 높이의 통로 */
  | { t: "pillar"; x: number; gapY: number; gapH: number }
  /** 수평 전깃줄 */
  | { t: "wire"; x: number; y: number; w: number }
  /**
   * 색 게이트 — y부터 h만큼의 색 면 (충돌 아님, 색 판정만).
   * `fake`: 글리치 게이트가 겉으로 보여주는 색 · `chain`: 색 체인 세트피스 안의 순번
   */
  | { t: "gate"; x: number; y: number; h: number; color: Color; fake?: Color; chain?: { id: number; idx: number; n: number } }
  /** S 전용 통로 — y부터 h만큼만 열려 있고, S가 아니면 막힌다 */
  | { t: "narrow"; x: number; y: number; h: number; w: number; size: "S" }
  /** L 전용 파괴 벽 — L이면 부수고 통과(+점수), 아니면 즉사 */
  | { t: "wall"; x: number; y: number; h: number; breakBy: "L" }
  /** 상하 이동 몬스터 (청크 등장 시점을 위상 0으로 본다) */
  | { t: "bug"; x: number; y0: number; y1: number; period: number }
  | { t: "item"; x: number; y: number; kind: ItemKind }
  // ── 2.0 세트피스 전용 (JSON 청크에는 쓰지 않는다) ──
  /** 움직이는 벽 — 통로 중심이 gapY0~gapY1 사이를 오간다 */
  | { t: "mover"; x: number; gapY0: number; gapY1: number; gapH: number; period: number; phase: number }
  /** 가짜 틈 — 청크 진행 시간 `switchT`초에 통로가 gapA → gapB 로 옮겨 간다 (도착 약 1초 전) */
  | { t: "shifter"; x: number; gapA: number; gapB: number; gapH: number; switchT: number }
  /** 효과 구역 (충돌 없음) — 부엉이가 x ~ x+w 안에 있는 동안 적용 */
  | { t: "zone"; x: number; w: number; kind: ZoneKind }
  /** 발동 지점 (충돌 없음) */
  | { t: "trigger"; x: number; ev: TriggerEvent }
  /** 세로 레이저 기둥 — 경고선으로 다가오다가 부엉이 앞에서 켜진다. y0~y1 을 막는다 */
  | { t: "beam"; x: number; y0: number; y1: number };

export type ChunkTag = "gate" | "narrow" | "moving" | "item" | "breather" | "set";

export type Chunk = {
  id: string;
  /** px, 보통 720~1440 */
  width: number;
  /** 최소 등장 페이즈 */
  phase: 0 | 1 | 2 | 3 | 4;
  difficulty: 1 | 2 | 3 | 4 | 5;
  tags: ChunkTag[];
  /** 청크 진입 시 부엉이가 있어야 하는 y (통로 중심) */
  entryY: number;
  /** 청크 종료 시 도달 가능한 y — 다음 청크의 entryY와 ±120px 이내로 이어붙인다 */
  exitY: number;
  /** x는 청크 로컬 좌표 */
  entities: Entity[];
};

export type FlightStats = {
  distance_m: number;
  duration_s: number;
  pass_count: number;
  near_miss: number;
  combo_max: number;
  combo_mult_avg: number;
  items: number;
  item_score: number;
  energy_left: number;
  phase_max: number;
  /** 2.0: 도달 단계 (16 이상 = ∞) */
  stage_max: number;
  /** 색 게이트 PERFECT 수 */
  perfect_count: number;
  /** 발동한 OWL FEVER 수 */
  fever_count: number;
  /** 발동한 COLOR POWER 수 */
  power_count: number;
  /** 겪은 랜덤 이벤트 수 */
  special_cleared: number;
  /** 배율·보너스로 더 번 점수 (FEVER·SCORE×2·OVERDRIVE·체인·단계 보너스 …) — 서버가 상한을 건다 */
  bonus_score: number;
  /** 아울 에너지를 주웠는지 (서버가 스테이지·거리와 함께 검증) */
  owl_energy_found: boolean;
  size_end: SizeKey;
  build: string;
};

/** time = 한 판 상한(CFG.platform.maxSessionSec) — 서버 max_sec 전에 끝낸다 */
export type DeathCause = "wall" | "energy" | "time" | null;
