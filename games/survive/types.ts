// 아울 서바이버즈 타입 계약 — 엔진 모듈들이 공유한다.

export type WeaponId =
  | "feather" // 🪶 깃털 표창 (시작 무기)
  | "firewall" // 🛡️ 방화벽
  | "sniffer" // 📡 패킷 스니퍼
  | "portscan" // 🛰️ 포트 스캐너
  | "honeypot" // 🍯 하니팟
  | "vaccine" // 💉 백신
  | "ddos" // ⚡ 디도스
  | "logbomb"; // 🧨 로그 폭탄

export type EvolvedId =
  | "feather_storm"
  | "zero_trust"
  | "backbone"
  | "botnet_orbital"
  | "honey_cluster"
  | "auto_immune"
  | "volumetric"
  | "kernel_panic";

export type PassiveId =
  | "core" // 🧠 피해 +12%
  | "cpu" // ⏱️ 쿨다운 -8%
  | "ram" // 💾 투사체 +1 (3레벨마다)
  | "bandwidth" // 📶 투사체 속도·사거리 +15%
  | "firewall_thick" // 🧱 최대 체력 +20, 받는 피해 -5%
  | "magnet" // 🧲 XP 획득 반경 +30%
  | "boots"; // 👟 이동속도 +10%

export type EnemyKind = "bug" | "worm" | "trojan" | "botnet" | "ransom" | "elite" | "boss";

/** 투사체 종류 — 렌더와 충돌 처리가 갈린다 */
export type BulletKind =
  | "feather"
  | "laser"
  | "orbit"
  | "ddos"
  | "explosion"
  | "spike";

export type WeaponState = { id: WeaponId; level: number; cd: number; evolved: EvolvedId | null; ammo: number };

export type PlayerState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  xpNext: number;
  iframe: number;
  /** 랜섬웨어 둔화 (초) */
  slow: number;
  invuln: number;
};

/** 누적 스탯 — 패시브에서 계산 (§6 패시브 표) */
export type Stats = {
  damage: number;
  cooldown: number;
  projSpeed: number;
  projExtra: number;
  magnet: number;
  speed: number;
  dmgTaken: number;
};

export type RunStats = {
  kills: number;
  eliteKills: number;
  bossKilled: boolean;
  damageTaken: number;
  evolutions: number;
  zonesCleared: number;
  owlEnergyFound: boolean;
};

export type SurviveMeta = {
  duration_s: number;
  kills: number;
  level: number;
  evolutions: number;
  elite_kills: number;
  boss_killed: boolean;
  zones_cleared: number;
  stage: number;
  damage_taken: number;
  build: string[];
  owl_energy_found: boolean;
  v: string;
};

/** 레벨업 카드 */
export type Card =
  | { kind: "weapon"; id: WeaponId; level: number; label: string; desc: string; emoji: string }
  | { kind: "passive"; id: PassiveId; level: number; label: string; desc: string; emoji: string }
  | { kind: "evolve"; id: WeaponId; evolved: EvolvedId; label: string; desc: string; emoji: string };
