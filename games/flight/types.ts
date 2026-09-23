// 아울러닝 청크·엔티티 스키마 (기획서 §8)
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
  | "owlEnergy"; // 🦉 아울 에너지 (P3+ 저확률, 서버가 최종 지급 판정)

export type Entity =
  /** 상하 기둥 쌍 — gapY 중심, gapH 높이의 통로 */
  | { t: "pillar"; x: number; gapY: number; gapH: number }
  /** 수평 전깃줄 */
  | { t: "wire"; x: number; y: number; w: number }
  /** 색 게이트 — y부터 h만큼의 색 면 (충돌 아님, 색 판정만) */
  | { t: "gate"; x: number; y: number; h: number; color: Color }
  /** S 전용 통로 — y부터 h만큼만 열려 있고, S가 아니면 막힌다 */
  | { t: "narrow"; x: number; y: number; h: number; w: number; size: "S" }
  /** L 전용 파괴 벽 — L이면 부수고 통과(+점수), 아니면 즉사 */
  | { t: "wall"; x: number; y: number; h: number; breakBy: "L" }
  /** 상하 이동 몬스터 (청크 등장 시점을 위상 0으로 본다) */
  | { t: "bug"; x: number; y0: number; y1: number; period: number }
  | { t: "item"; x: number; y: number; kind: ItemKind };

export type ChunkTag = "gate" | "narrow" | "moving" | "item" | "breather";

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

/** 런타임 인스턴스 (월드 좌표) */
export type Spawned = {
  entity: Entity;
  /** 월드 x (엔티티 좌측) */
  x: number;
  /** 청크가 스폰된 시점 기준 경과 시간 (bug 위상용) */
  bornAt: number;
  /** 통과 점수를 이미 준 엔티티인지 */
  passed?: boolean;
  /** 색 게이트를 이미 판정했는지 */
  judged?: boolean;
  /** 먹었거나 부서졌는지 */
  gone?: boolean;
  /** 니어미스를 이미 준 엔티티인지 */
  nearCounted?: boolean;
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
  special_cleared: number;
  /** 특수 구간 배율로 얻은 추가 점수 (서버 재계산용) */
  special_bonus_score: number;
  /** 아울 에너지를 주웠는지 (서버가 스테이지·거리와 함께 검증) */
  owl_energy_found: boolean;
  size_end: SizeKey;
  build: string;
};

export type DeathCause = "wall" | "energy" | null;
