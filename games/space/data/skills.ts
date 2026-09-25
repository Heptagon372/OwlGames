// 🚀 아울스페이스 — 스킬 30종 (기획서 §5.2)
//
// 서바이버즈(50종·진화)와 **의도적으로 다르게** 단순하다.
// 탄막 게임은 화면을 읽는 데 인지 자원을 써야 해서, 빌드까지 복잡하면 둘 다 망한다.

import { CFG } from "../config";
import type {
  MainId,
  MainSkill,
  PassiveId,
  PassiveSkill,
  PassiveSlot,
  Stats,
  SubId,
  SubSkill,
  SubSlot,
} from "../types";

/* ── 🔫 메인샷 6종 ──────────────────────────────────────────── */

export const MAINS: Record<MainId, MainSkill> = {
  M1: { id: "M1", name: "기본 볼트", emoji: "🔹", desc: "전방 집중. 레벨마다 탄 +1", cd: 0.16, dmg: 12, count: 2, speed: 780, pierce: 0 },
  M2: { id: "M2", name: "와이드 스프레드", emoji: "🌊", desc: "넓게 퍼지는 확산탄. 잡몹 최강", cd: 0.24, dmg: 8, count: 5, speed: 620, pierce: 0 },
  M3: { id: "M3", name: "피어싱 레이저", emoji: "🔴", desc: "관통 지속 빔. 보스전 최강", cd: 0.1, dmg: 7, count: 1, speed: 1100, pierce: 99 },
  M4: { id: "M4", name: "호밍 미사일", emoji: "🎯", desc: "자동 유도. 편하지만 화력은 낮아요", cd: 0.3, dmg: 14, count: 2, speed: 460, pierce: 0 },
  M5: { id: "M5", name: "리플렉트 샷", emoji: "🪃", desc: "벽에 튕겨요. 구석에서 강력", cd: 0.26, dmg: 13, count: 2, speed: 640, pierce: 0 },
  M6: { id: "M6", name: "스플릿 캐논", emoji: "💥", desc: "명중하면 4갈래로 갈라져요", cd: 0.42, dmg: 18, count: 1, speed: 560, pierce: 0 },
};

export const MAIN_IDS = Object.keys(MAINS) as MainId[];
export const STARTER_MAIN: MainId = "M1";

/* ── 🛰️ 서브 12종 ──────────────────────────────────────────── */

export const SUBS: Record<SubId, SubSkill> = {
  S1: { id: "S1", name: "드론 윙맨", emoji: "🐝", desc: "양옆 드론이 같이 쏴요" },
  S2: { id: "S2", name: "오빗 실드", emoji: "🛡️", desc: "회전 위성이 적 탄을 하나씩 지워요" },
  S3: { id: "S3", name: "백 미사일", emoji: "🚀", desc: "뒤쪽으로 유도탄을 쏴요" },
  S4: { id: "S4", name: "체인 스파크", emoji: "⚡", desc: "가까운 적에게 연쇄 전격" },
  S5: { id: "S5", name: "드롭 기뢰", emoji: "💣", desc: "뒤에 기뢰를 흘려요" },
  S6: { id: "S6", name: "칩 마그넷", emoji: "🧲", desc: "칩 흡수 반경 2배" },
  S7: { id: "S7", name: "타임 디스토션", emoji: "⏱️", desc: "8초마다 3초간 적 탄 속도 절반" },
  S8: { id: "S8", name: "포인트 배리어", emoji: "🧱", desc: "앞쪽 방벽이 탄 3발을 막아요" },
  S9: { id: "S9", name: "카운터 버스트", emoji: "🔆", desc: "그레이즈 20회마다 주변 탄 소거" },
  S10: { id: "S10", name: "스캐너", emoji: "📡", desc: "보스 다음 패턴을 미리 알려줘요" },
  S11: { id: "S11", name: "볼텍스", emoji: "🌀", desc: "주변 칩과 작은 탄을 빨아들여요" },
  S12: { id: "S12", name: "페이크 아울", emoji: "🦉", desc: "분신이 유도탄을 대신 끌어요" },
};

export const SUB_IDS = Object.keys(SUBS) as SubId[];

/* ── 🧠 패시브 12종 ─────────────────────────────────────────── */

export const PASSIVES: Record<PassiveId, PassiveSkill> = {
  P1: { id: "P1", name: "출력 증폭", emoji: "🔥", desc: "피해 +15%" },
  P2: { id: "P2", name: "연사 회로", emoji: "⏩", desc: "발사 속도 +12%" },
  P3: { id: "P3", name: "스러스터", emoji: "👟", desc: "이동속도 +10%" },
  P4: { id: "P4", name: "마이크로 코어", emoji: "🎯", desc: "판정점 -0.7px" },
  P5: { id: "P5", name: "봄 확장", emoji: "💣", desc: "봄 최대 +1, 시작 봄 +1" },
  P6: { id: "P6", name: "그레이즈 마스터", emoji: "✨", desc: "그레이즈 점수 +40%, 판정 반경 +4px" },
  P7: { id: "P7", name: "칩 효율", emoji: "💠", desc: "칩 획득량 +25%" },
  P8: { id: "P8", name: "나노 실드", emoji: "🛡️", desc: "10초마다 피격 1회 무효" },
  P9: { id: "P9", name: "리커버리", emoji: "⏳", desc: "피격 후 무적 +1초" },
  P10: { id: "P10", name: "리로드", emoji: "🔁", desc: "봄을 30% 확률로 소모하지 않아요" },
  P11: { id: "P11", name: "관통 강화", emoji: "🩸", desc: "모든 탄에 관통 +1" },
  P12: { id: "P12", name: "크리티컬", emoji: "💫", desc: "치명타 +8%, 피해 ×1.8" },
};

export const PASSIVE_IDS = Object.keys(PASSIVES) as PassiveId[];

/* ── 스탯 ───────────────────────────────────────────────────── */

export function baseStats(): Stats {
  return {
    damage: 1,
    fireRate: 1,
    speed: CFG.player.speed,
    hitboxR: CFG.player.hitboxR,
    bombMax: CFG.bomb.max,
    grazeScore: 1,
    grazeRadius: CFG.graze.radius,
    chipGain: 1,
    shieldSec: 0,
    iFrame: CFG.player.iFrameSec,
    bombKeepRate: 0,
    pierce: 0,
    critRate: 0,
    critDamage: 1.8,
    magnet: CFG.chip.magnetR,
  };
}

/** 패시브·서브 목록 → 스탯 (순수 함수라 테스트로 고정할 수 있다) */
export function applyStats(passives: PassiveSlot[], subs: SubSlot[] = []): Stats {
  const s = baseStats();
  for (const p of passives) {
    const lv = Math.max(0, p.lv);
    if (lv <= 0) continue;
    switch (p.id) {
      case "P1": s.damage += 0.15 * lv; break;
      case "P2": s.fireRate += 0.12 * lv; break;
      case "P3": s.speed *= 1 + 0.1 * lv; break;
      // 판정점은 최대 -2.8px (§5.2)
      case "P4": s.hitboxR = Math.max(1.2, CFG.player.hitboxR - 0.7 * lv); break;
      case "P5": s.bombMax += lv; break;
      case "P6": s.grazeScore += 0.4 * lv; s.grazeRadius += 4 * lv; break;
      case "P7": s.chipGain += 0.25 * lv; break;
      case "P8": s.shieldSec = 10; break;
      case "P9": s.iFrame += 1 * lv; break;
      case "P10": s.bombKeepRate += 0.3 * lv; break;
      case "P11": s.pierce += lv; break;
      case "P12": s.critRate += 0.08 * lv; break;
    }
  }
  // 🧲 칩 마그넷
  if (subs.some((x) => x.id === "S6")) s.magnet *= 2;
  return s;
}

/** 시너지 6종 (§5.3) — 조건을 만족하면 true */
export type Synergy = { id: string; name: string; desc: string; has: (main: MainId, subs: SubId[], passives: PassiveSlot[]) => boolean };

const lv = (passives: PassiveSlot[], id: PassiveId) => passives.find((p) => p.id === id)?.lv ?? 0;

export const SYNERGIES: Synergy[] = [
  {
    id: "Y1", name: "관통 레이저", desc: "레이저가 화면 전체를 뚫고 폭이 2배",
    has: (m, _s, p) => m === "M3" && lv(p, "P11") > 0,
  },
  {
    id: "Y2", name: "탄막 벽", desc: "와이드 스프레드가 적 탄 일부를 상쇄",
    has: (m, _s, p) => m === "M2" && lv(p, "P2") > 0,
  },
  {
    id: "Y3", name: "실드 재충전", desc: "카운터 버스트가 오빗 실드를 즉시 채워요",
    has: (_m, s) => s.includes("S2") && s.includes("S9"),
  },
  {
    id: "Y4", name: "감속 그레이즈", desc: "타임 디스토션 중 그레이즈 점수 ×2",
    has: (_m, s, p) => s.includes("S7") && lv(p, "P6") > 0,
  },
  {
    id: "Y5", name: "정밀 스캔", desc: "예고선이 1초 전에 뜨고 판정점 추가 -1px",
    has: (_m, s, p) => s.includes("S10") && lv(p, "P4") > 0,
  },
  {
    id: "Y6", name: "무한 봄", desc: "봄 최대 5개",
    has: (_m, _s, p) => lv(p, "P5") > 0 && lv(p, "P10") > 0,
  },
];

export function activeSynergies(main: MainId, subs: SubId[], passives: PassiveSlot[]): Synergy[] {
  return SYNERGIES.filter((y) => y.has(main, subs, passives));
}

/** 메인샷 레벨 → 실제 값 */
export function mainDamage(id: MainId, lvl: number, stats: Stats): number {
  return MAINS[id].dmg * (1 + 0.3 * (lvl - 1)) * stats.damage;
}

export function mainCooldown(id: MainId, lvl: number, stats: Stats): number {
  return Math.max(0.05, (MAINS[id].cd * (1 - 0.07 * (lvl - 1))) / stats.fireRate);
}

export function mainCount(id: MainId, lvl: number): number {
  const base = MAINS[id].count;
  if (id === "M1") return base + (lvl - 1);
  if (id === "M2") return base + (lvl - 1) * 1;
  return base;
}

export function levelLabel(lvl: number): string {
  return lvl <= 0 ? "신규" : lvl >= CFG.slots.maxLv ? "MAX" : `Lv${lvl} → ${lvl + 1}`;
}
