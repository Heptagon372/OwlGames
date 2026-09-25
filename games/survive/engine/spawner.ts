// 🦉 아울 서바이버즈 v2 — 스폰 (기획서 §3 · §14)
// 스폰 예산 초당 6마리를 절대 넘지 않는다. 넘기면 기기가 아니라 게임이 먼저 무너진다.

import { CFG, hpMult } from "../config";
import type { EnemyKind } from "../data/stages";
import { aliveEnemies, clampToArena, enemyCap, spawnEnemy, type World } from "./world";

export type SpawnState = {
  budget: number;
  eliteAt: number;
};

export function createSpawnState(): SpawnState {
  return { budget: 0, eliteAt: 70 };
}

/** 구간별 스폰 강도 — 중간보스·보스 구간에는 잡몹을 줄인다 */
function waveMultiplier(w: World): number {
  switch (w.phase) {
    case "wave1": return 0.75 + Math.min(0.35, w.t / CFG.wave.w1End) * 0.5;
    case "midboss": return 0.35;
    case "wave2": return 1;
    case "boss": return 0.45;
    default: return 0;
  }
}

/** 플레이어 주변 링 위의 한 점 — 화면 밖이면서 아레나 안 */
function ringPoint(w: World): { x: number; y: number } | null {
  for (let k = 0; k < 8; k++) {
    const a = w.rand() * Math.PI * 2;
    const r = CFG.spawn.ringMin + w.rand() * (CFG.spawn.ringMax - CFG.spawn.ringMin);
    const x = w.player.x + Math.cos(a) * r;
    const y = w.player.y + Math.sin(a) * r;
    if (x > 20 && x < CFG.arena.w - 20 && y > 20 && y < CFG.arena.h - 20) return { x, y };
  }
  // 아레나가 좁아 링을 못 잡으면 가장자리에 붙여서라도 화면 밖에서 낸다
  const p = clampToArena(w.player.x + (w.rand() < 0.5 ? -1 : 1) * 520, w.player.y + (w.rand() - 0.5) * 520, 24);
  return Math.hypot(p.x - w.player.x, p.y - w.player.y) > 300 ? p : null;
}

/** 이 구간에서 나올 수 있는 적 */
function pickKind(w: World): EnemyKind {
  const list = w.info.enemies;
  const pool = w.phase === "wave1" ? list.slice(0, Math.max(1, list.length - 1)) : list;
  return pool[Math.floor(w.rand() * pool.length)];
}

export function updateSpawner(w: World, st: SpawnState, dt: number): void {
  if (w.over) return;

  const cap = enemyCap(w);
  // 스테이지가 올라가면 적은 **더 세지되 더 적게** 나온다.
  // 체력이 2배인데 수까지 그대로면 시작 장비로는 길을 뚫을 수가 없어서 S7 이 27초 만에 끝난다.
  st.budget += (CFG.spawn.budgetPerSec * waveMultiplier(w) * dt) / Math.sqrt(hpMult(w.stage));

  while (st.budget >= 1) {
    st.budget -= 1;
    if (aliveEnemies(w) >= cap) break;
    const at = ringPoint(w);
    if (!at) break;
    spawnEnemy(w, pickKind(w), at.x, at.y);
  }

  // 💀 엘리트 — 웨이브 2부터 30초마다 (무한 구간 '엘리트 2배' 규칙이면 2마리)
  if (w.phase === "wave2" && w.t >= st.eliteAt && aliveEnemies(w) < cap) {
    st.eliteAt += 30;
    const n = w.info.rule === "elite" ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const at = ringPoint(w);
      if (at) spawnEnemy(w, "elite", at.x, at.y, 1);
    }
  }
}
