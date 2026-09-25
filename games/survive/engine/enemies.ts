// 적 스펙·AI (기획서 §7 · §12).
// 추적은 벡터 정규화만 — 경로탐색 없음. update* 안에서는 절대 할당하지 않는다(클로저·리터럴 금지).

import { CFG, zoneAt } from "../config";
import type { EnemyKind } from "../types";
import { ENEMY_KINDS, forEachEnemyNear, spawnEnemy, type EnemySpec, type World } from "./world";
import { WEAPON_INFO } from "./weapons";

/**
 * 적 기본 스펙 (§7 표).
 * HP·XP는 기획서 값 그대로, 속도·반경·접촉 피해는 기획서가 "느림/보통/빠름"만 정해 두어 여기서 확정한다.
 * 스테이지 배율(hpMult·speedMult)은 world.spawnEnemy가 곱한다.
 */
export const ENEMY_SPEC: Record<EnemyKind, EnemySpec> = {
  bug: { hp: 10, speed: 52, r: 9, dmg: 4, xp: 1 },
  worm: { hp: 8, speed: 104, r: 8, dmg: 3, xp: 2 },
  trojan: { hp: 45, speed: 46, r: 15, dmg: 8, xp: 3 },
  botnet: { hp: 6, speed: 74, r: 7, dmg: 3, xp: 1 },
  ransom: { hp: 90, speed: 44, r: 18, dmg: 10, xp: 5 },
  elite: { hp: 400, speed: 78, r: 26, dmg: 16, xp: 25 },
  // 보스 HP는 기획서 6000 → 1500. 15초 창에서 봇 시뮬레이션 16판 중 2판이 잡는 값이다
  // (6000·2600·1800 은 0판 — 아무도 못 잡으면 마지막 구간이 그냥 도망치기가 된다).
  // 보스만 단계 배율을 타지 않는다 (world.spawnEnemy 참고).
  boss: { hp: 1500, speed: 40, r: 54, dmg: 25, xp: 100 },
};

// 핫 루프에서 문자열 비교를 피하려고 kind index를 미리 뽑아 둔다 (§12)
const K_WORM = ENEMY_KINDS.indexOf("worm");
const K_RANSOM = ENEMY_KINDS.indexOf("ransom");
const K_ELITE = ENEMY_KINDS.indexOf("elite");
const K_BOSS = ENEMY_KINDS.indexOf("boss");

/** AI 튜닝 — 기획서에 수치가 없는 것들을 한곳에 모은다 */
const AI = {
  /** 웜 지그재그 (§7) — 진행 방향 수직으로 흔든다 */
  zigzagFreq: 7.5,
  zigzagAmp: 0.6,
  /** 넉백·흡인 임펄스 감쇠 (초당 비율) */
  knockDecay: 6,
  /** 하니팟 유인 반경 (§6 하니팟) */
  lureRadius: 210,
  /** 너무 멀어진 잡몹은 회수한다 — 풀 고갈 방지 (§12) */
  cullDist: 1500,
  /** 겹침 분리: 8프레임마다 근접 2마리만 (§12) */
  separateEvery: 8,
  separatePairs: 2,
  separatePushMax: 20,
  /** 분리 질의 반경에 더할 최대 적 반경 (엘리트 기준) */
  separateNeighborR: 26,
} as const;

/** 🔒 랜섬웨어 피격 효과 (§7) — 이동속도 -20% 2초. 감소는 루프의 플레이어 갱신이 맡는다 */
export const RANSOM_SLOW = { mult: 0.2, sec: 2 } as const;

/** 🐴 트로이목마 분열 (§7) */
const SPLIT = { kind: "bug" as EnemyKind, count: 3, radius: 22 };

/** 💀 엘리트 보물상자 (§7) — 보유 무기 1개 즉시 Lv +2 */
const TREASURE = { levels: 2, bannerSec: 2 };

/* ── 이동 (§12) ──────────────────────────────────────── */

// 프레임마다 재사용하는 스크래치 — 여기서만 쓰고 함수 안에서 새로 만들지 않는다
let lureOn = false;
let lureX = 0;
let lureY = 0;

/** 플레이어에게 가장 가까운 하니팟 장판(owner 0)을 이번 프레임의 유인 지점으로 삼는다 */
function findLure(w: World): void {
  const h = w.hazards;
  let bestD = Infinity;
  lureOn = false;
  for (let i = 0; i < h.cap; i++) {
    if (!h.alive[i] || h.owner[i] !== 0) continue;
    const dx = h.x[i] - w.player.x;
    const dy = h.y[i] - w.player.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) {
      bestD = d2;
      lureX = h.x[i];
      lureY = h.y[i];
      lureOn = true;
    }
  }
}

/** 적 이동·행동 AI. 플레이어 추적은 벡터 정규화만 (경로탐색 없음, §12) */
export function updateEnemies(w: World, dt: number): void {
  const e = w.enemies;
  const px = w.player.x;
  const py = w.player.y;
  const pr = CFG.player.radius;
  findLure(w);
  const decay = Math.max(0, 1 - AI.knockDecay * dt);
  const cull2 = AI.cullDist * AI.cullDist;
  const lure2 = AI.lureRadius * AI.lureRadius;

  for (let i = 0; i < e.cap; i++) {
    if (!e.alive[i]) continue;
    if (e.flash[i] > 0) e.flash[i] = Math.max(0, e.flash[i] - dt);
    const kind = e.kind[i];
    if (kind === K_BOSS) continue; // 보스 이동은 boss.ts가 맡는다

    const pdx = px - e.x[i];
    const pdy = py - e.y[i];
    const pd2 = pdx * pdx + pdy * pdy;

    // 멀리 벗어난 잡몹은 조용히 회수 (킬·XP 없음)
    if (pd2 > cull2 && kind !== K_ELITE) {
      e.alive[i] = 0;
      continue;
    }

    // 🔒 랜섬웨어 접촉 = 둔화 (§7). 피해 판정은 루프가 따로 한다
    if (kind === K_RANSOM) {
      const touch = e.r[i] + pr;
      if (pd2 <= touch * touch) w.player.slow = RANSOM_SLOW.sec;
    }

    // 하니팟이 깔려 있으면 잡몹은 그쪽으로 유인된다 (엘리트는 면역)
    let tx = px;
    let ty = py;
    if (lureOn && kind !== K_ELITE) {
      const lx = lureX - e.x[i];
      const ly = lureY - e.y[i];
      if (lx * lx + ly * ly < lure2) {
        tx = lureX;
        ty = lureY;
      }
    }

    let dx = tx - e.x[i];
    let dy = ty - e.y[i];
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= d;
    dy /= d;

    if (kind === K_WORM) {
      // 지그재그: 진행 방향의 법선 성분을 사인으로 흔든 뒤 다시 정규화
      e.phase[i] += dt * AI.zigzagFreq;
      const s = Math.sin(e.phase[i]) * AI.zigzagAmp;
      const zx = dx - dy * s;
      const zy = dy + dx * s;
      const zn = Math.sqrt(zx * zx + zy * zy) || 1;
      dx = zx / zn;
      dy = zy / zn;
    }

    const sp = e.speed[i];
    e.x[i] += (dx * sp + e.vx[i]) * dt;
    e.y[i] += (dy * sp + e.vy[i]) * dt;
    e.vx[i] *= decay;
    e.vy[i] *= decay;
  }
}

/* ── 처치 후처리 ─────────────────────────────────────── */

/** 🦉 아울 에너지 — ZONE 3 이상에서 엘리트를 잡으면 낮은 확률로 (플랫폼 규칙) */
function rollOwlEnergy(w: World): boolean {
  if (w.run.owlEnergyFound || !CFG.owlEnergy.fromElite) return false;
  if (zoneAt(w.t) < CFG.owlEnergy.minZone) return false;
  if (w.rand() >= CFG.owlEnergy.chance) return false;
  w.run.owlEnergyFound = true;
  return true;
}

/** 💎 보물상자 — 보유 무기 하나를 즉시 Lv +2 (§7 엘리트) */
function openTreasure(w: World): void {
  const list = w.weapons;
  if (list.length === 0) return;
  // 이미 MAX인 무기를 피해서 고른다 (전부 MAX면 아무거나)
  let picked = -1;
  let seen = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i].level >= CFG.levelup.maxWeaponLevel) continue;
    seen++;
    if (w.rand() < 1 / seen) picked = i; // 균등 저수지 추출 (할당 없음)
  }
  if (picked < 0) picked = Math.floor(w.rand() * list.length);
  const ws = list[picked];
  ws.level = Math.min(CFG.levelup.maxWeaponLevel, ws.level + TREASURE.levels);
  const info = WEAPON_INFO[ws.id];
  const energy = rollOwlEnergy(w);
  w.banner = {
    text: "💎 보물상자",
    sub: energy
      ? `${info.emoji} ${info.label} Lv.${ws.level} · 🦉 아울 에너지 발견!`
      : `${info.emoji} ${info.label} Lv.${ws.level}`,
    until: w.t + TREASURE.bannerSec,
  };
}

/** 적이 죽은 직후 호출 — 트로이목마 분열 등 (damageEnemy가 true를 돌려준 뒤) */
export function onEnemyDeath(w: World, kind: EnemyKind, x: number, y: number): void {
  if (kind === "trojan") {
    for (let k = 0; k < SPLIT.count; k++) {
      const a = (Math.PI * 2 * k) / SPLIT.count + w.rand();
      spawnEnemy(w, SPLIT.kind, x + Math.cos(a) * SPLIT.radius, y + Math.sin(a) * SPLIT.radius, ENEMY_SPEC[SPLIT.kind]);
    }
    return;
  }
  if (kind === "elite") {
    openTreasure(w);
    return;
  }
}

/* ── 겹침 분리 (§12) ─────────────────────────────────── */

let sepW: World | null = null;
let sepSelf = -1;
let sepHits = 0;

// 모듈 로드 때 한 번만 만드는 방문자 — forEachEnemyNear에 프레임마다 클로저를 넘기지 않기 위함
const separateVisit = (j: number, dist: number): void => {
  const w = sepW;
  if (!w || sepHits >= AI.separatePairs || j === sepSelf) return;
  const e = w.enemies;
  if (!e.alive[j] || e.kind[j] === K_BOSS) return;
  const min = e.r[sepSelf] + e.r[j];
  if (dist >= min) return;
  const push = Math.min(AI.separatePushMax, (min - dist) * 0.5);
  let nx = 1;
  let ny = 0;
  if (dist > 0.001) {
    nx = (e.x[j] - e.x[sepSelf]) / dist;
    ny = (e.y[j] - e.y[sepSelf]) / dist;
  }
  e.x[j] += nx * push;
  e.y[j] += ny * push;
  e.x[sepSelf] -= nx * push;
  e.y[sepSelf] -= ny * push;
  sepHits++;
};

/** 겹침 방지: 8프레임마다 근접 2마리만 밀어낸다 (§12) */
export function separateEnemies(w: World, frame: number): void {
  if (frame % AI.separateEvery !== 0) return;
  const e = w.enemies;
  sepW = w;
  for (let i = 0; i < e.cap; i++) {
    if (!e.alive[i] || e.kind[i] === K_BOSS) continue;
    sepSelf = i;
    sepHits = 0;
    forEachEnemyNear(w, e.x[i], e.y[i], e.r[i] + AI.separateNeighborR, separateVisit);
  }
  sepW = null;
  sepSelf = -1;
}
