// 🦉 아울 서바이버즈 v3 — 스폰 (기획서 §2 · §14)
// 단계가 오를수록 생성 속도가 붙는다. 그래도 초당 상한(CFG.spawn.maxPerSec)은 넘지 않는다.

import { CFG, spawnPerSec } from "../config";
import { MOB_SPEC, type MobKind } from "../data/stages";
import { aliveEnemies, countKind, enemyCap, spawnEnemy, type World } from "./world";

export type SpawnState = { budget: number };

export function createSpawnState(): SpawnState {
  return { budget: 0 };
}

/** 지금 구간의 스폰 배율 — 보스전은 줄이고, 십삼각형 콜로세움에서는 멈춘다 */
function spawnScale(w: World): number {
  if (w.over || w.frozen > 0) return 0;
  if (w.boss.active || w.boss.intro > 0) {
    if (w.boss.kind === "trideca") return 0;
    // 🔵 구각형은 먹을 게 있어야 한다
    if (w.boss.kind === "nona") return CFG.nona.spawnMult;
    if (w.boss.kind === "chrono" && w.boss.chTimeout >= 0) return 0;
    return CFG.spawn.bossMult;
  }
  if (w.info.allOut) return CFG.spawn.allOutMult;
  // 단계 첫 몇 초는 살짝 느슨하게
  return 0.7 + Math.min(1, w.stageT / 8) * 0.3;
}

/** 플레이어 주변 링 위의 한 점 — 늘 화면 밖 */
function ringPoint(w: World): { x: number; y: number } {
  const a = w.rand() * Math.PI * 2;
  const r = CFG.spawn.ringMin + w.rand() * (CFG.spawn.ringMax - CFG.spawn.ringMin);
  return { x: w.player.x + Math.cos(a) * r, y: w.player.y + Math.sin(a) * r };
}

/** 이 단계에서 나올 몬스터 — 가장 최근에 풀린 몬스터가 더 자주 나온다 */
export function pickKind(w: World): MobKind | null {
  const pool = w.info.pool;
  if (pool.length === 0) return null;
  const newest = w.info.mob;
  let total = 0;
  for (const k of pool) total += k === newest ? CFG.spawn.newestWeight : 1;
  for (let tries = 0; tries < 4; tries++) {
    let r = w.rand() * total;
    let pick: MobKind = pool[pool.length - 1];
    for (const k of pool) {
      r -= k === newest ? CFG.spawn.newestWeight : 1;
      if (r < 0) { pick = k; break; }
    }
    // 특수 몬스터는 동시에 몇 마리까지만
    if (countKind(w, pick) < MOB_SPEC[pick].max) return pick;
  }
  return pool[0];
}

export function updateSpawner(w: World, st: SpawnState, dt: number): void {
  const scale = spawnScale(w);
  if (scale <= 0) return;

  const cap = enemyCap(w);
  st.budget += spawnPerSec(w.stage) * scale * dt;

  while (st.budget >= 1) {
    st.budget -= 1;
    if (aliveEnemies(w) >= cap) break;
    const kind = pickKind(w);
    if (!kind) break;
    const at = ringPoint(w);
    spawnEnemy(w, kind, at.x, at.y);
  }
}
