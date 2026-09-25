// 웨이브 스포너 (기획서 §3 표 · §12).
// 규칙 두 가지를 동시에 지킨다 — 초당 스폰 예산(CFG.spawnBudgetPerSec)과 동시 적 상한(enemyCapAt).

import { CFG, enemyCapAt, zoneAt } from "../config";
import type { EnemyKind } from "../types";
import { aliveEnemies, spawnEnemy, type World } from "./world";
import { ENEMY_SPEC } from "./enemies";
import { spawnBoss } from "./boss";

// 구역별 등장 종류와 가중치 (§3 표).
// 🐴 트로이목마는 죽을 때 버그 3마리를 더 만들어 예산 밖으로 킬 수를 늘리므로 비중을 낮게 잡는다
// (§9.3 서버 거부 규칙: 초당 8킬 초과 불가).
const WAVES: { kinds: EnemyKind[]; weights: number[] }[] = [
  // ZONE 1 서버실 — 버그, 웜
  { kinds: ["bug", "worm"], weights: [70, 30] },
  // ZONE 2 캠퍼스망 — + 트로이목마
  { kinds: ["bug", "worm", "trojan"], weights: [50, 36, 14] },
  // ZONE 3 다크웹 — + 봇넷 무리, 랜섬웨어
  { kinds: ["bug", "worm", "trojan", "botnet", "ransom"], weights: [24, 26, 10, 22, 18] },
  // BOSS — 물량은 줄고 단단한 적 위주
  { kinds: ["bug", "worm", "trojan", "ransom"], weights: [24, 30, 10, 36] },
];

const SPAWN = {
  /** 화면 밖 링에서 등장 (§3) */
  ring: 620,
  ringJitter: 60,
  /** 🕸️ 봇넷 무리 8~12마리 (§7) */
  swarmMin: 8,
  swarmMax: 12,
  swarmArc: 0.5,
  swarmDepth: 90,
  /** 무리는 예산이 가득 찼을 때만 터뜨리고 남은 만큼 빚을 진다 */
  swarmCost: CFG.spawnBudgetPerSec,
  /** 💀 엘리트 — ZONE 2부터 30초마다 1마리 (§7) */
  eliteInterval: 30,
  eliteFromZone: 1,
  /** 한 프레임에 처리할 최대 스폰 횟수 (안전장치) */
  maxPerFrame: 4,
} as const;

/** 예산 버킷 상한 = 1초치. 누적 스폰 수는 항상 budget × t + 이 값 이하가 된다 */
const BUCKET_MAX = CFG.spawnBudgetPerSec;

/** 플레이어 중심 링 위의 좌표로 한 마리 소환 */
function spawnAtRing(w: World, kind: EnemyKind, angle: number, dist: number): number {
  return spawnEnemy(w, kind, w.player.x + Math.cos(angle) * dist, w.player.y + Math.sin(angle) * dist, ENEMY_SPEC[kind]);
}

function ringDist(w: World): number {
  return SPAWN.ring + w.rand() * SPAWN.ringJitter;
}

/** 구역 가중치로 종류 하나를 뽑는다 */
function pickKind(w: World, zone: number): EnemyKind {
  const wave = WAVES[zone] ?? WAVES[0];
  let total = 0;
  for (let i = 0; i < wave.weights.length; i++) total += wave.weights[i];
  let r = w.rand() * total;
  for (let i = 0; i < wave.kinds.length; i++) {
    r -= wave.weights[i];
    if (r <= 0) return wave.kinds[i];
  }
  return wave.kinds[wave.kinds.length - 1];
}

/** 🕸️ 봇넷 무리 — 한 방향에서 뭉쳐서 밀려온다 */
function spawnSwarm(w: World, count: number): number {
  const base = w.rand() * Math.PI * 2;
  const dist = ringDist(w);
  let made = 0;
  for (let i = 0; i < count; i++) {
    const a = base + (w.rand() - 0.5) * SPAWN.swarmArc;
    if (spawnAtRing(w, "botnet", a, dist + (w.rand() - 0.5) * SPAWN.swarmDepth) >= 0) made++;
  }
  return made;
}

/** 웨이브 테이블 + 스폰 예산(초당 최대 CFG.spawnBudgetPerSec) + 동시 상한(enemyCapAt) */
export function updateSpawner(w: World, dt: number): void {
  const zone = zoneAt(w.t);

  // 👹 보스 — 165초에 1마리 (§3)
  if (w.t >= CFG.zones[CFG.zones.length - 1].from && w.bossIndex < 0 && !w.run.bossKilled) {
    spawnBoss(w);
    if (w.bossIndex >= 0) w.spawnAcc -= 1;
  }

  // 💀 엘리트 — ZONE 2부터 30초마다 (§7)
  if (w.eliteTimer > 0) w.eliteTimer -= dt;
  if (w.eliteTimer <= 0 && zone >= SPAWN.eliteFromZone) {
    if (spawnAtRing(w, "elite", w.rand() * Math.PI * 2, ringDist(w)) >= 0) {
      w.eliteTimer = SPAWN.eliteInterval;
      w.spawnAcc -= 1;
    }
  }

  // 일반 웨이브 — 예산 토큰을 채우고 상한까지만 쓴다
  w.spawnAcc = Math.min(BUCKET_MAX, w.spawnAcc + CFG.spawnBudgetPerSec * dt);
  const cap = w.lowSpec ? Math.min(CFG.enemyCapLow, enemyCapAt(w.t)) : enemyCapAt(w.t);
  let alive = aliveEnemies(w);
  let guard = 0;

  while (w.spawnAcc >= 1 && alive < cap && guard++ < SPAWN.maxPerFrame) {
    const kind = pickKind(w, zone);
    if (kind === "botnet") {
      const count = SPAWN.swarmMin + Math.floor(w.rand() * (SPAWN.swarmMax - SPAWN.swarmMin + 1));
      // 예산이 덜 찼거나 상한에 걸리면 무리 대신 한 마리만 보낸다
      if (w.spawnAcc >= SPAWN.swarmCost && alive + count <= cap) {
        const made = spawnSwarm(w, count);
        w.spawnAcc -= made;
        alive += made;
        continue;
      }
    }
    if (spawnAtRing(w, kind, w.rand() * Math.PI * 2, ringDist(w)) < 0) break; // 풀이 가득
    w.spawnAcc -= 1;
    alive += 1;
  }
}
