// 🚀 아울스페이스 — 편대 스폰 · 장애물 (기획서 §6 · §7)

import { CFG, hpMult } from "../config";
import { ENEMY_KINDS, ENEMY_SPEC, type EnemyKind } from "../data/stages";
import { setPattern } from "./emitter";
import { aliveEnemies, type World } from "./world";

export type SpawnState = {
  next: number;
  obstacleNext: number;
  wave: number;
};

export function createSpawnState(): SpawnState {
  return { next: 1.2, obstacleNext: 4, wave: 0 };
}

const OBSTACLES = [
  { name: "잔해", hp: 25, w: 54, h: 40 },
  { name: "화물 컨테이너", hp: 15, w: 46, h: 46 },
  { name: "광물", hp: 30, w: 40, h: 40, chips: true },
];

function spawnOne(w: World, kind: EnemyKind, x: number, y: number, rank = 0): number {
  const e = w.enemies;
  let i = -1;
  for (let k = 0; k < e.cap; k++) if (!e.alive[k]) { i = k; break; }
  if (i < 0) return -1;

  const spec = ENEMY_SPEC[kind];
  e.alive[i] = 1;
  e.kind[i] = ENEMY_KINDS.indexOf(kind);
  e.x[i] = x; e.y[i] = y;
  e.vx[i] = 0; e.vy[i] = spec.speed;
  e.hp[i] = spec.hp * hpMult(w.stage);
  e.maxHp[i] = e.hp[i];
  e.r[i] = spec.r;
  e.sides[i] = spec.sides;
  e.flash[i] = 0;
  e.chips[i] = spec.chips;
  e.rank[i] = rank;
  e.phase[i] = w.rand() * Math.PI * 2;
  setPattern(w, i, spec.pattern);
  return i;
}

/** 편대 — 한 줄·V자·양옆 중 하나 */
function spawnFormation(w: World, kind: EnemyKind): void {
  const n = 3 + Math.floor(w.rand() * 3);
  const shape = Math.floor(w.rand() * 3);
  const cx = 70 + w.rand() * (CFG.screen.w - 140);

  for (let k = 0; k < n; k++) {
    if (aliveEnemies(w) >= CFG.perf.maxEnemies - 2) break;
    if (shape === 0) {
      spawnOne(w, kind, cx + (k - (n - 1) / 2) * 56, -40);
    } else if (shape === 1) {
      spawnOne(w, kind, cx + (k - (n - 1) / 2) * 50, -40 - Math.abs(k - (n - 1) / 2) * 40);
    } else {
      const side = k % 2 === 0 ? 60 : CFG.screen.w - 60;
      spawnOne(w, kind, side, -40 - Math.floor(k / 2) * 60);
    }
  }
}

export function updateSpawner(w: World, st: SpawnState, dt: number): void {
  if (w.over || w.phase === "boss") return;

  st.next -= dt;
  if (st.next <= 0) {
    st.wave += 1;
    // 스테이지가 올라가면 편대가 더 자주 온다
    st.next = Math.max(1, 2.6 - w.stage * 0.06 - Math.min(0.8, w.t / 80));
    const list = w.info.enemies;
    spawnFormation(w, list[Math.floor(w.rand() * list.length)]);

    // 정예는 가끔
    if (st.wave % 6 === 0 && w.stage >= 3) {
      spawnOne(w, "elite", 60 + w.rand() * (CFG.screen.w - 120), -50, 1);
    }
  }

  // 장애물 (§7) — 화면당 최대 4개
  st.obstacleNext -= dt;
  if (st.obstacleNext <= 0 && w.stage >= 2) {
    st.obstacleNext = CFG.obstacle.spawnEvery;
    const o = w.obstacles;
    let live = 0;
    for (let i = 0; i < o.cap; i++) if (o.alive[i]) live++;
    if (live < CFG.obstacle.maxOnScreen) {
      let i = -1;
      for (let k = 0; k < o.cap; k++) if (!o.alive[k]) { i = k; break; }
      if (i >= 0) {
        const kind = Math.floor(w.rand() * OBSTACLES.length);
        const spec = OBSTACLES[kind];
        o.alive[i] = 1;
        o.x[i] = spec.w / 2 + w.rand() * (CFG.screen.w - spec.w);
        o.y[i] = -spec.h;
        o.w[i] = spec.w; o.h[i] = spec.h;
        o.hp[i] = spec.hp * hpMult(w.stage);
        o.maxHp[i] = o.hp[i];
        o.kind[i] = kind;
        o.flash[i] = 0;
      }
    }
  }
}

/** 적 이동 — 내려오다 일정 높이에서 좌우로 흔들린다. 자폭형은 돌진 */
export function updateEnemies(w: World, dt: number): void {
  const e = w.enemies;
  const p = w.player;

  for (let i = 0; i < e.cap; i++) {
    if (!e.alive[i]) continue;
    if (e.flash[i] > 0) e.flash[i] -= dt;

    if (e.rank[i] === 2) continue; // 보스는 boss.ts

    const kind = ENEMY_KINDS[e.kind[i]];
    const spec = ENEMY_SPEC[kind];
    const holdY = 120 + (i % 5) * 46;

    if (spec.suicide) {
      // 자폭형은 플레이어에게 돌진
      const dx = p.x - e.x[i];
      const dy = p.y - e.y[i];
      const d = Math.hypot(dx, dy) || 1;
      e.x[i] += (dx / d) * spec.speed * dt;
      e.y[i] += (dy / d) * spec.speed * dt;
    } else if (e.y[i] < holdY) {
      e.y[i] += spec.speed * dt;
    } else {
      e.x[i] += Math.sin(w.t * 1.4 + e.phase[i]) * 60 * dt;
      e.y[i] += Math.sin(w.t * 0.7 + e.phase[i]) * 18 * dt;
    }

    // 화면 밖으로 너무 내려가면 회수
    if (e.y[i] > CFG.screen.h + 60) { e.alive[i] = 0; continue; }
    e.x[i] = Math.max(16, Math.min(CFG.screen.w - 16, e.x[i]));

    // 자폭형 접촉
    if (spec.suicide && Math.hypot(e.x[i] - p.x, e.y[i] - p.y) < e.r[i] + w.stats.hitboxR) {
      e.hp[i] = 0;
    }
  }
}
