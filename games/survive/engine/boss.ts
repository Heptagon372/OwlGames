// 👹 루트킷 오버로드 (기획서 §3 · §7) — 165초에 등장하는 3페이즈 보스.
// 보스 이동은 여기서만 한다 (enemies.updateEnemies는 boss를 건너뛴다).

import type { World } from "./world";
import { burst, spawnEnemy, spawnHazard } from "./world";
import { ENEMY_SPEC } from "./enemies";

/** 보스 튜닝 — HP·속도는 ENEMY_SPEC.boss, 패턴 수치는 여기 */
const BOSS = {
  /** 등장 위치 (플레이어 중심 링) */
  ring: 520,
  /** 페이즈 길이 — 소환 → 장판 → 돌진 순환 (15초면 정확히 한 바퀴) */
  phaseSec: 5,
  bannerSec: 2.5,

  /** 1페이즈 소환 */
  summonCd: 1.2,
  summonCount: 2,
  summonRing: 90,

  /** 2페이즈 장판 — 플레이어 진행 방향을 살짝 앞질러 깐다 */
  hazardCd: 1,
  hazardR: 95,
  hazardLife: 3,
  hazardDps: 14,
  hazardLead: 0.35,

  /** 3페이즈 돌진 */
  dashCd: 2,
  dashSpeed: 540,
  dashDecay: 2.2,
  dashShake: 0.35,
} as const;

/** 페이즈 배너 (§7 3페이즈) */
const PHASE_TEXT = ["🐛 소환", "☣️ 장판", "💥 돌진"] as const;

/** 1페이즈에서 부르는 잡몹 */
const SUMMON_KINDS = ["bug", "botnet"] as const;

/** 파티클 색 슬롯 (render.ts 팔레트 index) */
const COLOR_BOSS = 5;

export function spawnBoss(w: World): void {
  if (w.bossIndex >= 0 || w.run.bossKilled) return;
  const a = w.rand() * Math.PI * 2;
  const i = spawnEnemy(w, "boss", w.player.x + Math.cos(a) * BOSS.ring, w.player.y + Math.sin(a) * BOSS.ring, ENEMY_SPEC.boss);
  if (i < 0) return; // 풀이 가득 찼으면 다음 프레임에 다시 시도한다
  const e = w.enemies;
  e.phase[i] = 0;
  e.vx[i] = 0;
  e.vy[i] = 0;
  w.bossIndex = i;
  w.banner = { text: "👹 루트킷 오버로드", sub: "서버를 지켜라!", until: w.t + BOSS.bannerSec };
  w.shake = 0.6;
  w.flash = 1;
  burst(w, e.x[i], e.y[i], 30, COLOR_BOSS, 240);
}

/** prev→now 사이에 period의 배수를 넘었는가 (별도 타이머 없이 주기 판정) */
function crossed(prev: number, now: number, period: number): boolean {
  return Math.floor(prev / period) !== Math.floor(now / period);
}

/** 3페이즈: 소환 → 장판 → 돌진 (§7) */
export function updateBoss(w: World, dt: number): void {
  const i = w.bossIndex;
  if (i < 0) return;
  const e = w.enemies;
  if (!e.alive[i]) {
    w.bossIndex = -1;
    return;
  }
  if (e.flash[i] > 0) e.flash[i] = Math.max(0, e.flash[i] - dt);

  const prev = e.phase[i];
  const now = prev + dt;
  e.phase[i] = now;
  const phase = Math.floor(now / BOSS.phaseSec) % PHASE_TEXT.length;
  if (crossed(prev, now, BOSS.phaseSec)) {
    w.banner = { text: "👹 루트킷 오버로드", sub: PHASE_TEXT[phase], until: w.t + BOSS.bannerSec };
  }

  // 느린 추적 + 돌진 임펄스
  let dx = w.player.x - e.x[i];
  let dy = w.player.y - e.y[i];
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  dx /= d;
  dy /= d;
  e.x[i] += (dx * e.speed[i] + e.vx[i]) * dt;
  e.y[i] += (dy * e.speed[i] + e.vy[i]) * dt;
  const decay = Math.max(0, 1 - BOSS.dashDecay * dt);
  e.vx[i] *= decay;
  e.vy[i] *= decay;

  if (phase === 0) {
    if (!crossed(prev, now, BOSS.summonCd)) return;
    for (let k = 0; k < BOSS.summonCount; k++) {
      const a = w.rand() * Math.PI * 2;
      const kind = SUMMON_KINDS[Math.floor(w.rand() * SUMMON_KINDS.length)];
      spawnEnemy(w, kind, e.x[i] + Math.cos(a) * BOSS.summonRing, e.y[i] + Math.sin(a) * BOSS.summonRing, ENEMY_SPEC[kind]);
    }
    return;
  }

  if (phase === 1) {
    if (!crossed(prev, now, BOSS.hazardCd)) return;
    spawnHazard(
      w,
      w.player.x + w.player.vx * BOSS.hazardLead,
      w.player.y + w.player.vy * BOSS.hazardLead,
      BOSS.hazardR,
      BOSS.hazardLife,
      BOSS.hazardDps,
      1,
    );
    return;
  }

  if (!crossed(prev, now, BOSS.dashCd)) return;
  e.vx[i] = dx * BOSS.dashSpeed;
  e.vy[i] = dy * BOSS.dashSpeed;
  w.shake = BOSS.dashShake;
  burst(w, e.x[i], e.y[i], 14, COLOR_BOSS, 200);
}
