// 🦉 아울 서바이버즈 — 스킬 90종 (기획서 §7: 액티브 35 · 패시브 28 · 진화 27)
// 효과는 **데이터**로, 동작은 유형(archetype)별 핸들러가 맡는다 (§14).
// 숫자를 바꾸려면 여기만 고치면 된다.

import { CFG } from "../config";
import type {
  ActiveId,
  ActiveSkill,
  EvoId,
  EvolutionSkill,
  PassiveId,
  PassiveSkill,
  PassiveSlot,
  Stats,
} from "../types";

/* ── 🗡️ 액티브 35종 ─────────────────────────────────────────── */

type A = Omit<ActiveSkill, "id">;
const a = (v: Partial<A> & Pick<A, "name" | "emoji" | "arch" | "desc" | "cd" | "dmg">): A => ({
  count: 1,
  radius: 0,
  speed: 0,
  pierce: 0,
  duration: 0,
  tags: ["physical"],
  status: null,
  evo: null,
  evoReq: null,
  ...v,
});

export const ACTIVES: Record<ActiveId, ActiveSkill> = Object.fromEntries(
  (
    [
      ["A01", a({ name: "깃털 표창", emoji: "🪶", arch: "homing", desc: "가장 가까운 적에게 깃털을 날려요", cd: 0.8, dmg: 11, speed: 430, evo: "E01", evoReq: "P03" })],
      ["A02", a({ name: "블래스터", emoji: "🔫", arch: "beam", desc: "조준 방향으로 관통 레이저", cd: 1.6, dmg: 26, speed: 900, pierce: 3, tags: ["pierce", "physical"], evo: "E02", evoReq: "P04" })],
      ["A03", a({ name: "방화벽 오라", emoji: "🛡️", arch: "aura", desc: "주변의 적을 계속 태워요", cd: 0.22, dmg: 13, radius: 70, tags: ["aoe"], evo: "E03", evoReq: "P05" })],
      ["A04", a({ name: "패킷 스니퍼", emoji: "📡", arch: "line", desc: "좌우로 관통 빔을 쏴요", cd: 1.4, dmg: 24, speed: 640, pierce: 99, tags: ["pierce"], evo: "E04", evoReq: "P08" })],
      ["A05", a({ name: "포트 스캐너", emoji: "🛰️", arch: "orbit", desc: "주위를 도는 위성", cd: 0, dmg: 9, count: 2, radius: 88, evo: "E05", evoReq: "P01" })],
      ["A06", a({ name: "하니팟", emoji: "🍯", arch: "trap", desc: "적을 꾀어 모은 뒤 폭발", cd: 3, dmg: 30, radius: 115, duration: 1.5, tags: ["explosion", "aoe"], evo: "E06", evoReq: "P06" })],
      ["A07", a({ name: "백신", emoji: "💉", arch: "heal", desc: "체력 회복 + 주변 피해", cd: 8, dmg: 20, radius: 150, tags: ["aoe"], evo: "E07", evoReq: "P12" })],
      ["A08", a({ name: "DDoS 난사", emoji: "⚡", arch: "spray", desc: "아무 방향으로 마구 쏴요", cd: 0.5, dmg: 8, speed: 380 })],
      ["A09", a({ name: "로그 폭탄", emoji: "🧨", arch: "onkill", desc: "40킬마다 화면 전체 폭발", cd: 0, dmg: 70, count: 40, tags: ["explosion", "aoe"] })],
      ["A10", a({ name: "소켓 루프", emoji: "🌀", arch: "boomerang", desc: "갔다 돌아오며 두 번 때려요", cd: 1.8, dmg: 18, speed: 330, pierce: 99, tags: ["pierce"] })],
      ["A11", a({ name: "쿨링 팬", emoji: "❄️", arch: "cone", desc: "전방을 얼려 둔화", cd: 1.2, dmg: 10, radius: 150, status: "slow" })],
      ["A12", a({ name: "체인 핑", emoji: "🔗", arch: "chain", desc: "적 사이를 튀는 번개", cd: 1.5, dmg: 16, count: 3, radius: 170, tags: ["electric"], evo: "E08", evoReq: "P02" })],
      ["A13", a({ name: "널 포인터", emoji: "🕳️", arch: "pull", desc: "블랙홀로 적을 빨아들여요", cd: 6, dmg: 6, radius: 130, duration: 2.5, status: "pull", tags: ["aoe"], evo: "E09", evoReq: "P09" })],
      ["A14", a({ name: "프록시 드론", emoji: "🧱", arch: "drone", desc: "따라다니며 대신 쏴주는 드론", cd: 1, dmg: 12, count: 1, speed: 420, evo: "E10", evoReq: "P17" })],
      ["A15", a({ name: "커널 봄", emoji: "💣", arch: "bomb", desc: "던져서 터지는 대형 폭탄", cd: 2.6, dmg: 55, radius: 120, duration: 1, speed: 260, tags: ["explosion", "aoe"] })],
      ["A16", a({ name: "샌드박스", emoji: "🔇", arch: "stun", desc: "장판 안의 적을 멈춰요", cd: 7, dmg: 0, radius: 120, duration: 1.5, status: "stun" })],
      ["A17", a({ name: "루트 권한", emoji: "⚔️", arch: "melee", desc: "주변을 크게 베어요", cd: 1.1, dmg: 34, radius: 95, tags: ["aoe"], evo: "E11", evoReq: "P07" })],
      ["A18", a({ name: "브로드캐스트", emoji: "🌐", arch: "wave", desc: "링 파동으로 밀어내요", cd: 2.2, dmg: 22, radius: 220, tags: ["aoe"] })],
      ["A19", a({ name: "페이로드 화염", emoji: "🔥", arch: "burn", desc: "바닥을 태우는 화염 장판", cd: 2.4, dmg: 7, radius: 105, duration: 3, status: "burn", tags: ["aoe"] })],
      ["A20", a({ name: "캐시 미스", emoji: "🧊", arch: "strike", desc: "무작위 지점에 폭격", cd: 1.6, dmg: 32, count: 2, radius: 70, tags: ["explosion", "aoe"] })],
      // ── 추가 15종 (A21~A35) — 전부 짝 패시브가 있는 진화를 갖는다 ──
      ["A21", a({ name: "암호화 실드", emoji: "🔐", arch: "barrier", desc: "주변 적 탄을 지우고 적을 밀쳐내요", cd: 3.5, dmg: 16, radius: 120, tags: ["aoe"], evo: "E13", evoReq: "P18" })],
      ["A22", a({ name: "웜", emoji: "🐛", arch: "split", desc: "맞히면 두 마리로 복제되는 벌레", cd: 1.2, dmg: 14, speed: 360, tags: ["physical"], evo: "E14", evoReq: "P28" })],
      ["A23", a({ name: "원격 저격", emoji: "🔭", arch: "snipe", desc: "가장 단단한 적(보스 우선)을 저격", cd: 2.2, dmg: 85, radius: 700, tags: ["pierce", "physical"], evo: "E15", evoReq: "P20" })],
      ["A24", a({ name: "레이더 스윕", emoji: "🧭", arch: "sweep", desc: "주위를 빙글 도는 레이저", cd: 3.5, dmg: 20, radius: 170, duration: 2, tags: ["pierce"], evo: "E16", evoReq: "P19" })],
      ["A25", a({ name: "트래킹 쿠키", emoji: "🍪", arch: "trail", desc: "지나간 자리에 쿠키를 흘려 밟은 적에게 피해", cd: 0.4, dmg: 6, radius: 28, duration: 2.5, tags: ["aoe"], evo: "E17", evoReq: "P10" })],
      ["A26", a({ name: "킬 스위치", emoji: "🔪", arch: "execute", desc: "체력 15% 이하인 적을 즉시 처치 (없으면 일격)", cd: 1.6, dmg: 40, count: 3, radius: 320, tags: ["physical"], evo: "E18", evoReq: "P11" })],
      ["A27", a({ name: "크래시 덤프", emoji: "✳️", arch: "cross", desc: "십자 방향으로 폭발이 뻗어 나가요", cd: 2.4, dmg: 26, count: 4, radius: 38, speed: 55, tags: ["explosion", "aoe"], evo: "E19", evoReq: "P22" })],
      ["A28", a({ name: "방화벽 포탑", emoji: "🗼", arch: "turret", desc: "제자리에 포탑을 세워 자동 사격", cd: 7, dmg: 10, speed: 480, radius: 420, duration: 6, tags: ["physical"], evo: "E20", evoReq: "P23" })],
      ["A29", a({ name: "전력 서지", emoji: "⛈️", arch: "zap", desc: "무작위 적에게 번개를 떨어뜨려요", cd: 1.3, dmg: 22, count: 2, radius: 360, tags: ["electric"], evo: "E21", evoReq: "P16" })],
      ["A30", a({ name: "버스트 전송", emoji: "💨", arch: "shotgun", desc: "앞쪽으로 산탄을 흩뿌려요", cd: 1.1, dmg: 9, count: 5, speed: 540, duration: 0.42, tags: ["physical"], evo: "E22", evoReq: "P21" })],
      ["A31", a({ name: "트립와이어", emoji: "🪤", arch: "mine", desc: "지뢰를 깔아 밟은 적을 폭발시켜요", cd: 1.8, dmg: 42, radius: 72, duration: 9, tags: ["explosion", "aoe"], evo: "E23", evoReq: "P25" })],
      ["A32", a({ name: "디스크 조각 모음", emoji: "💿", arch: "disc", desc: "천천히 나아가며 닿는 적을 계속 갈아요", cd: 2.6, dmg: 9, radius: 30, speed: 110, duration: 2.6, tags: ["physical"], evo: "E24", evoReq: "P27" })],
      ["A33", a({ name: "포크 밤", emoji: "🍴", arch: "pop", desc: "처치한 적이 12% 확률로 폭발해요", cd: 0, dmg: 26, count: 12, radius: 64, tags: ["explosion", "aoe"], evo: "E25", evoReq: "P15" })],
      ["A34", a({ name: "EMP", emoji: "📴", arch: "emp", desc: "주변 적을 감전시켜 잠깐 멈춰요", cd: 8, dmg: 18, radius: 190, duration: 1.1, status: "stun", tags: ["electric", "aoe"], evo: "E26", evoReq: "P26" })],
      ["A35", a({ name: "커맨드 라인", emoji: "⌨️", arch: "whip", desc: "앞뒤로 번갈아 긴 채찍을 휘둘러요", cd: 1, dmg: 24, radius: 190, tags: ["physical"], evo: "E27", evoReq: "P24" })],
    ] as [ActiveId, A][]
  ).map(([id, v]) => [id, { id, ...v }]),
) as Record<ActiveId, ActiveSkill>;

export const ACTIVE_IDS = Object.keys(ACTIVES) as ActiveId[];

/** 시작 스킬 (§7 A01) */
export const STARTER: ActiveId = "A01";

/* ── 🧠 패시브 28종 ─────────────────────────────────────────── */

export const PASSIVES: Record<PassiveId, PassiveSkill> = {
  P01: { id: "P01", name: "코어", emoji: "🧠", desc: "피해 +12%" },
  P02: { id: "P02", name: "CPU 클럭", emoji: "⏱️", desc: "쿨다운 -8%" },
  P03: { id: "P03", name: "RAM", emoji: "💾", desc: "2레벨마다 투사체 +1" },
  P04: { id: "P04", name: "대역폭", emoji: "📶", desc: "투사체 속도·사거리 +15%" },
  P05: { id: "P05", name: "방화벽 두께", emoji: "🧱", desc: "최대 체력 +20, 받는 피해 -4%" },
  P06: { id: "P06", name: "자석", emoji: "🧲", desc: "XP 획득 반경 +30%" },
  P07: { id: "P07", name: "부츠", emoji: "👟", desc: "이동속도 +9%" },
  P08: { id: "P08", name: "정밀 조준", emoji: "🎯", desc: "치명타 확률 +6%" },
  P09: { id: "P09", name: "오버플로우", emoji: "💥", desc: "치명타 피해 +25%" },
  P10: { id: "P10", name: "배터리", emoji: "🔋", desc: "액티브 지속시간 +15%" },
  P11: { id: "P11", name: "가비지 컬렉터", emoji: "♻️", desc: "처치 시 4% 확률로 체력 +2" },
  P12: { id: "P12", name: "오토 힐", emoji: "🩹", desc: "초당 체력 +0.4" },
  P13: { id: "P13", name: "리스폰 프로토콜", emoji: "❤️‍🩹", desc: "사망 시 1회 부활 + 무적 1초" },
  P14: { id: "P14", name: "타임아웃", emoji: "⏳", desc: "피격 무적시간 +0.15초" },
  P15: { id: "P15", name: "러닝 레이트", emoji: "📈", desc: "획득 XP +12%" },
  P16: { id: "P16", name: "리트라이", emoji: "🔁", desc: "8% 확률로 쿨다운 초기화" },
  P17: { id: "P17", name: "로드밸런서", emoji: "⚖️", desc: "액티브 1개가 추가 타격" },
  P18: { id: "P18", name: "스텔스 캐시", emoji: "🌑", desc: "5초 무피격 시 피격 1회 무효" },
  // ── 추가 10종 (P19~P28) ──
  P19: { id: "P19", name: "서브넷 확장", emoji: "📐", desc: "스킬 범위 +10%" },
  P20: { id: "P20", name: "취약점 분석", emoji: "🔍", desc: "보스·특수 몬스터에게 피해 +15%" },
  P21: { id: "P21", name: "터널링", emoji: "🚇", desc: "투사체 관통 +1" },
  P22: { id: "P22", name: "익스플로잇", emoji: "🧪", desc: "둔화·화상·기절·표식 지속 +20%" },
  P23: { id: "P23", name: "백업 서버", emoji: "🗄️", desc: "리롤 +1 (얻거나 올릴 때마다)" },
  P24: { id: "P24", name: "핫픽스", emoji: "🩺", desc: "레벨업할 때마다 체력 +5" },
  P25: { id: "P25", name: "역추적", emoji: "↩️", desc: "맞으면 주변 적에게 반격 피해 18" },
  P26: { id: "P26", name: "패킷 손실", emoji: "📉", desc: "5% 확률로 공격을 흘려요" },
  P27: { id: "P27", name: "페일세이프", emoji: "🚨", desc: "체력 40% 이하일 때 피해 +12%" },
  P28: { id: "P28", name: "멀티스레드", emoji: "🧵", desc: "6% 확률로 액티브가 한 번 더 발동" },
};

export const PASSIVE_IDS = Object.keys(PASSIVES) as PassiveId[];

/** 체력 30% 이하에서 가중치가 2배가 되는 구제 패시브 (§7 추첨 규칙 5) */
export const RESCUE_PASSIVES: PassiveId[] = ["P05", "P12", "P13"];

/* ── ⭐ 진화 27종 ───────────────────────────────────────────── */

export const EVOLUTIONS: Record<EvoId, EvolutionSkill> = {
  E01: { id: "E01", name: "깃털 폭풍", emoji: "🌪️", base: "A01", req: "P03", desc: "8방향 난사 + 사거리 2배" },
  E02: { id: "E02", name: "오비탈 블래스터", emoji: "🌠", base: "A02", req: "P04", desc: "화면 전체 관통, 관통할수록 강해져요" },
  E03: { id: "E03", name: "제로 트러스트", emoji: "🔰", base: "A03", req: "P05", desc: "반경 2배 + 넉백" },
  E04: { id: "E04", name: "백본 레이저", emoji: "🔦", base: "A04", req: "P08", desc: "3줄기 빔, 치명타 시 화상" },
  E05: { id: "E05", name: "봇넷 오비탈", emoji: "🛸", base: "A05", req: "P01", desc: "위성 8개 + XP 자동 흡수" },
  E06: { id: "E06", name: "허니 클러스터", emoji: "🍯", base: "A06", req: "P06", desc: "연쇄 폭발 최대 5회" },
  E07: { id: "E07", name: "자동 면역", emoji: "🧬", base: "A07", req: "P12", desc: "회복 2배 + 발동 시 무적 0.6초" },
  E08: { id: "E08", name: "뇌우 프로토콜", emoji: "🌩️", base: "A12", req: "P02", desc: "연쇄 무제한, 둔화된 적에게 ×3" },
  E09: { id: "E09", name: "싱귤래리티", emoji: "🌌", base: "A13", req: "P09", desc: "블랙홀 2배 + 흡입 중 피해 +100%" },
  E10: { id: "E10", name: "드론 스웜", emoji: "🐝", base: "A14", req: "P17", desc: "드론 3기 + 자동 표식" },
  E11: { id: "E11", name: "커널 러시", emoji: "⚡", base: "A17", req: "P07", desc: "돌진 베기, 돌진 중 무적" },
  E12: { id: "E12", name: "페일오버 클러스터", emoji: "🔄", base: "P13", req: "P14", desc: "부활 2회 + 부활 시 화면 폭발" },
  // ── 추가 15종 (E13~E27) — 새 액티브마다 하나, 짝 패시브는 전부 다르다 ──
  E13: { id: "E13", name: "종단간 암호화", emoji: "🔏", base: "A21", req: "P18", desc: "지운 적 탄을 되쏘고, 반경 1.5배" },
  E14: { id: "E14", name: "자가 복제", emoji: "🦠", base: "A22", req: "P28", desc: "세 갈래로 복제되고, 복제 세대 +1" },
  E15: { id: "E15", name: "제로데이", emoji: "🧿", base: "A23", req: "P20", desc: "일직선 관통 저격 + 치명타 확정" },
  E16: { id: "E16", name: "딥 스캔", emoji: "🔬", base: "A24", req: "P19", desc: "레이저 2줄기 + 길이 1.5배" },
  E17: { id: "E17", name: "슈퍼쿠키", emoji: "🥠", base: "A25", req: "P10", desc: "쿠키 지속 2배 + 밟은 적 둔화" },
  E18: { id: "E18", name: "셧다운", emoji: "☠️", base: "A26", req: "P11", desc: "처치 기준 체력 30% + 처치할 때마다 체력 +1" },
  E19: { id: "E19", name: "블루스크린", emoji: "🟦", base: "A27", req: "P22", desc: "8방향 폭발 + 맞은 적 화상" },
  E20: { id: "E20", name: "DMZ 요새", emoji: "🏰", base: "A28", req: "P23", desc: "포탑 2기 + 지속 2배" },
  E21: { id: "E21", name: "블랙아웃", emoji: "🔌", base: "A29", req: "P16", desc: "낙뢰 2배 + 맞은 적 둔화 (감전 증폭)" },
  E22: { id: "E22", name: "UDP 플러드", emoji: "🌊", base: "A30", req: "P21", desc: "산탄 12발 + 전부 관통" },
  E23: { id: "E23", name: "침입 탐지망", emoji: "🕸️", base: "A31", req: "P25", desc: "터지면 작은 지뢰 3개로 갈라져요" },
  E24: { id: "E24", name: "RAID 디스크", emoji: "📀", base: "A32", req: "P27", desc: "원반 3개 + 크기 1.5배" },
  E25: { id: "E25", name: "지수 폭발", emoji: "🎆", base: "A33", req: "P15", desc: "폭발 확률 2배 + 반경 1.5배" },
  E26: { id: "E26", name: "절전 모드", emoji: "💤", base: "A34", req: "P26", desc: "기절 2배 + 반경 1.5배 + 둔화까지" },
  E27: { id: "E27", name: "슈퍼유저", emoji: "🧙", base: "A35", req: "P24", desc: "앞뒤 동시에 + 길이 1.5배 + 표식" },
};

export const EVO_IDS = Object.keys(EVOLUTIONS) as EvoId[];

/* ── 스탯 계산 ──────────────────────────────────────────────── */

export function baseStats(): Stats {
  return {
    damage: 1,
    cooldown: 1,
    projectiles: 0,
    projSpeed: 1,
    maxHp: CFG.player.hp,
    damageTaken: 1,
    pickup: CFG.player.pickupRadius,
    speed: CFG.player.speed,
    critRate: 0.05,
    critDamage: 1.5,
    duration: 1,
    xpGain: 1,
    iFrame: CFG.player.iFrameSec,
    lifestealRate: 0,
    regen: 0,
    resetChance: 0,
    extraStrike: 0,
    shieldSec: 0,
    revives: 0,
    reviveIFrame: 0,
    reviveHeal: 0,
    reviveBlast: false,
    area: 1,
    bossDamage: 1,
    pierce: 0,
    statusDur: 1,
    levelHeal: 0,
    thorns: 0,
    dodge: 0,
    lowHpDamage: 1,
    doubleCast: 0,
  };
}

/** 페일세이프(P27)가 켜지는 체력 비율 */
export const LOW_HP_RATIO = 0.4;

/**
 * 패시브 목록 → 스탯. 순수 함수라 테스트로 고정할 수 있다.
 * `hasE12` 는 진화 E12(페일오버 클러스터) 보유 여부.
 */
export function applyPassives(passives: PassiveSlot[], hasE12 = false): Stats {
  const s = baseStats();
  for (const p of passives) {
    const lv = Math.max(0, p.lv);
    if (lv <= 0) continue;
    switch (p.id) {
      case "P01": s.damage += 0.12 * lv; break;
      case "P02": s.cooldown = Math.max(0.4, s.cooldown - 0.08 * lv); break;
      case "P03": s.projectiles += Math.floor(lv / 2); break;
      case "P04": s.projSpeed += 0.15 * lv; break;
      case "P05":
        s.maxHp += 20 * lv;
        s.damageTaken = Math.max(0.5, s.damageTaken - 0.04 * lv);
        break;
      case "P06": s.pickup *= 1 + 0.3 * lv; break;
      case "P07": s.speed *= 1 + 0.09 * lv; break;
      case "P08": s.critRate += 0.06 * lv; break;
      case "P09": s.critDamage += 0.25 * lv; break;
      case "P10": s.duration += 0.15 * lv; break;
      case "P11": s.lifestealRate += 0.04 * lv; break;
      case "P12": s.regen += 0.4 * lv; break;
      case "P13":
        s.revives = Math.max(s.revives, 1);
        s.reviveIFrame = 1 + 0.4 * (lv - 1);
        s.reviveHeal = lv >= 5 ? 0.6 : 0;
        break;
      case "P14": s.iFrame += 0.15 * lv; break;
      case "P15": s.xpGain += 0.12 * lv; break;
      case "P16": s.resetChance += 0.08 * lv; break;
      case "P17": s.extraStrike += 1; break;
      case "P18": s.shieldSec = 5; break;
      case "P19": s.area += 0.1 * lv; break;
      case "P20": s.bossDamage += 0.15 * lv; break;
      case "P21": s.pierce += lv; break;
      case "P22": s.statusDur += 0.2 * lv; break;
      case "P23": break; // 리롤은 소모품이라 스탯이 아니다 — game.ts 가 카드를 고를 때 더해 준다
      case "P24": s.levelHeal += 5 * lv; break;
      case "P25": s.thorns += 18 * lv; break;
      case "P26": s.dodge = Math.min(0.3, s.dodge + 0.05 * lv); break;
      case "P27": s.lowHpDamage += 0.12 * lv; break;
      case "P28": s.doubleCast = Math.min(0.4, s.doubleCast + 0.06 * lv); break;
    }
  }
  if (hasE12) {
    // 🔄 페일오버 클러스터 — 부활 2회 + 3초 무적 + 부활 시 화면 전체 폭발
    s.revives = 2;
    s.reviveIFrame = Math.max(3, s.reviveIFrame);
    s.reviveBlast = true;
  }
  return s;
}

/** 스킬 레벨 → 실제 쿨다운 (레벨당 -8%, 바닥 0.06초) */
export function skillCooldown(base: number, lv: number, stats: Stats): number {
  if (base <= 0) return 0;
  return Math.max(0.06, base * (1 - 0.08 * (lv - 1)) * stats.cooldown);
}

/** 스킬 레벨 → 실제 피해 (레벨당 +25%) */
export function skillDamage(base: number, lv: number, stats: Stats): number {
  return base * (1 + 0.25 * (lv - 1)) * stats.damage;
}

/**
 * RAM(투사체 +1)을 받지 않는 유형 — count 가 투사체 수가 아니라
 * 대상 수(킬 스위치)·폭발 칸 수(크래시 덤프)·확률(포크 밤) 같은 다른 뜻이다.
 */
const NO_EXTRA_PROJECTILES = new Set<ActiveSkill["arch"]>([
  "orbit", "drone", "barrier", "sweep", "trail", "execute", "cross", "turret", "disc", "pop", "emp", "whip",
]);

/** 스킬 레벨 → 투사체 수 (RAM 패시브 포함) */
export function skillCount(skill: ActiveSkill, lv: number, stats: Stats, evolved: boolean): number {
  let n = skill.count;
  if (skill.arch === "homing" || skill.arch === "spray") n += Math.floor((lv - 1) / 2);
  if (skill.arch === "orbit") n += Math.floor((lv - 1) * 0.75);
  if (skill.arch === "zap" || skill.arch === "mine") n += Math.floor((lv - 1) / 2);
  if (skill.arch === "shotgun" || skill.arch === "execute") n += lv - 1;
  if (evolved && skill.evo === "E01") n = 8;
  if (evolved && skill.evo === "E05") n = 8;
  if (evolved && skill.evo === "E10") n = 3;
  if (evolved && skill.evo === "E16") n = 2;
  if (evolved && skill.evo === "E20") n = 2;
  if (evolved && skill.evo === "E21") n *= 2;
  if (evolved && skill.evo === "E22") n = 12;
  if (evolved && skill.evo === "E24") n = 3;
  if (!NO_EXTRA_PROJECTILES.has(skill.arch)) n += stats.projectiles;
  return Math.max(1, Math.round(n));
}

/** 범위(반경·길이)에 서브넷 확장(P19)을 곱한다 */
export function areaOf(r: number, stats: Stats): number {
  return r * stats.area;
}

/** 🛡️ 방화벽 오라 반경 — 판정(skills.ts)과 그림(render.ts)이 같은 값을 쓴다 */
export function auraRadius(skill: ActiveSkill, lv: number, evolved: boolean, stats: Stats): number {
  return areaOf((skill.radius + lv * 14) * (evolved ? 2 : 1), stats);
}

/** 카드에 보여줄 레벨 표기 */
export function levelLabel(lv: number): string {
  return lv <= 0 ? "신규" : lv >= CFG.evolution.maxSkillLv ? "MAX" : `Lv${lv} → ${lv + 1}`;
}
