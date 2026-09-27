// 🦉 아울 서바이버즈 v3 엔진 검증 (기획서 §15 수용 기준 + v3 패치)
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import ko from "../messages/ko.json";
import {
  CFG,
  atkMult,
  bossesBefore,
  bossOf,
  chronoLoop,
  hpMult,
  spawnPerSec,
  xpToNext,
} from "@/games/survive/config";
import {
  ACTIVE_IDS,
  ACTIVES,
  applyPassives,
  auraRadius,
  baseStats,
  EVOLUTIONS,
  EVO_IDS,
  PASSIVE_IDS,
  PASSIVES,
  skillCooldown,
  skillDamage,
} from "@/games/survive/data/skills";
import { ENEMY_KINDS, MOB_KINDS, MOB_SPEC, STAGES, stageInfo } from "@/games/survive/data/stages";
import { OBSTACLE_ART } from "@/games/survive/engine/assets";
import { applyCard, drawCards, pendingEvolution } from "@/games/survive/engine/levelup";
import {
  cellCenter,
  clearArea,
  COL_STEP,
  densityIn,
  loadedObstacles,
  obstacleAt,
  OBSTACLE_KINDS,
  passable,
  restoreObstacles,
  ROW_STEP,
  streamObstacles,
  damageObstacle,
} from "@/games/survive/engine/obstacles";
import { createSpawnState, updateSpawner } from "@/games/survive/engine/spawner";
import { endBoss, spawnBoss, updateBoss } from "@/games/survive/engine/boss";
import { chronoTimeLeft } from "@/games/survive/engine/bosses/chrono";
import { nearPenalty } from "@/games/survive/engine/bosses/trideca";
import { updateEnemies, updateHostileBullets } from "@/games/survive/engine/enemies";
import { buildMeta, rawScore } from "@/games/survive/engine/score";
import { LOOK, updateBullets, updateSkills } from "@/games/survive/engine/skills";
import {
  aliveEnemies,
  BEAM,
  countKind,
  CUE,
  createWorld,
  damageEnemy,
  hurtPlayer,
  HZ,
  killEnemy,
  recalcStats,
  refreshGrid,
  spawnBullet,
  spawnEnemy,
  spawnHazard,
  spawnOrb,
  TAG,
  type World,
} from "@/games/survive/engine/world";
import { chooseCard, createRun, update, type Run } from "@/games/survive/engine/game";
import type { PassiveId, PassiveSlot } from "@/games/survive/types";

const DT = 1 / 60;

function world(seed = 12345): World {
  const w = createWorld(seed, "dark", true);
  refreshGrid(w);
  return w;
}

/** 단계 s 의 월드 (보스 단계 테스트용) */
function worldAt(stage: number, seed = 12345): World {
  const w = world(seed);
  w.stage = stage;
  w.info = stageInfo(stage);
  return w;
}

function passives(list: [PassiveId, number][]): PassiveSlot[] {
  return list.map(([id, lv]) => ({ id, lv }));
}

/** 보스를 등장시키고 등장 연출(무적)을 건너뛴다 */
function bossReady(w: World, kind: Parameters<typeof spawnBoss>[1]): number {
  spawnBoss(w, kind);
  w.boss.intro = 0;
  refreshGrid(w);
  return w.boss.idx;
}

/** 월드를 n 초 돌린다 (보스·적·탄만 — 플레이어 스킬은 끈다) */
function tick(w: World, sec: number): void {
  for (let i = 0; i < Math.round(sec / DT); i++) {
    w.t += DT;
    w.frame++;
    if (w.frozen > 0) w.frozen = Math.max(0, w.frozen - DT);
    refreshGrid(w);
    updateEnemies(w, DT);
    updateBoss(w, DT);
    updateHostileBullets(w, DT);
  }
}

/* ── 1. 스킬 90종 ───────────────────────────────────────────── */

describe("스킬 데이터 (§7)", () => {
  it("액티브 35 · 패시브 28 · 진화 27 = 90종", () => {
    expect(ACTIVE_IDS).toHaveLength(35);
    expect(PASSIVE_IDS).toHaveLength(28);
    expect(EVO_IDS).toHaveLength(27);
    expect(ACTIVE_IDS.length + PASSIVE_IDS.length + EVO_IDS.length).toBe(90);
  });

  it("모든 스킬이 이름·이모지·설명을 갖는다", () => {
    for (const id of ACTIVE_IDS) {
      const s = ACTIVES[id];
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.emoji.length).toBeGreaterThan(0);
      expect(s.desc.length).toBeGreaterThan(0);
      expect(s.cd).toBeGreaterThanOrEqual(0);
      expect(s.dmg).toBeGreaterThanOrEqual(0);
    }
    for (const id of PASSIVE_IDS) {
      expect(PASSIVES[id].desc.length).toBeGreaterThan(0);
    }
  });

  it("진화 27종이 전부 유효한 재료를 가리킨다", () => {
    for (const id of EVO_IDS) {
      const e = EVOLUTIONS[id];
      const isActiveBase = (ACTIVE_IDS as string[]).includes(e.base);
      const isPassiveBase = (PASSIVE_IDS as string[]).includes(e.base);
      expect(isActiveBase || isPassiveBase).toBe(true);
      expect((PASSIVE_IDS as string[]).includes(e.req)).toBe(true);
      if (isActiveBase) {
        // 액티브 쪽에도 같은 진화가 연결돼 있어야 한다
        expect(ACTIVES[e.base as (typeof ACTIVE_IDS)[number]].evo).toBe(id);
      }
    }
  });

  it("레벨이 오르면 피해는 커지고 쿨다운은 줄어든다", () => {
    const st = baseStats();
    expect(skillDamage(10, 5, st)).toBeGreaterThan(skillDamage(10, 1, st));
    expect(skillCooldown(1, 5, st)).toBeLessThan(skillCooldown(1, 1, st));
    expect(skillCooldown(1, 5, st)).toBeGreaterThanOrEqual(0.06);
  });
});

/* ── 2. 패시브 → 스탯 ───────────────────────────────────────── */

describe("패시브 18종 (§7)", () => {
  it("없으면 기본값 그대로", () => {
    const s = applyPassives([]);
    expect(s.damage).toBe(1);
    expect(s.maxHp).toBe(CFG.player.hp);
    expect(s.revives).toBe(0);
  });

  it("🧠 코어 = 레벨당 피해 +12%", () => {
    expect(applyPassives(passives([["P01", 3]])).damage).toBeCloseTo(1.36, 5);
  });

  it("⏱️ CPU 클럭 = 레벨당 쿨다운 -8% (바닥 0.4)", () => {
    expect(applyPassives(passives([["P02", 2]])).cooldown).toBeCloseTo(0.84, 5);
    expect(applyPassives(passives([["P02", 5]])).cooldown).toBeGreaterThanOrEqual(0.4);
  });

  it("💾 RAM = 2레벨마다 투사체 +1", () => {
    expect(applyPassives(passives([["P03", 1]])).projectiles).toBe(0);
    expect(applyPassives(passives([["P03", 2]])).projectiles).toBe(1);
    expect(applyPassives(passives([["P03", 5]])).projectiles).toBe(2);
  });

  it("🧱 방화벽 두께 = 최대 체력 +20 / 받는 피해 -4%", () => {
    const s = applyPassives(passives([["P05", 2]]));
    expect(s.maxHp).toBe(CFG.player.hp + 40);
    expect(s.damageTaken).toBeCloseTo(0.92, 5);
  });

  it("❤️‍🩹 리스폰 프로토콜 = 부활 1회 + 무적 1초 (Lv당 +0.4초, Lv5는 60% 회복)", () => {
    expect(applyPassives(passives([["P13", 1]])).reviveIFrame).toBeCloseTo(1, 5);
    expect(applyPassives(passives([["P13", 3]])).reviveIFrame).toBeCloseTo(1.8, 5);
    const max = applyPassives(passives([["P13", 5]]));
    expect(max.revives).toBe(1);
    expect(max.reviveHeal).toBeCloseTo(0.6, 5);
  });

  it("🔄 페일오버 클러스터(E12) = 부활 2회 + 3초 무적 + 폭발", () => {
    const s = applyPassives(passives([["P13", 5], ["P14", 3]]), true);
    expect(s.revives).toBe(2);
    expect(s.reviveIFrame).toBeGreaterThanOrEqual(3);
    expect(s.reviveBlast).toBe(true);
  });

  it("추가 패시브 P19~P28 — 레벨당 수치", () => {
    const s = applyPassives(passives([
      ["P19", 2], ["P20", 2], ["P21", 3], ["P22", 1], ["P24", 2], ["P25", 1], ["P26", 5], ["P27", 1], ["P28", 5],
    ]));
    expect(s.area).toBeCloseTo(1.2, 5);
    expect(s.bossDamage).toBeCloseTo(1.3, 5);
    expect(s.pierce).toBe(3);
    expect(s.statusDur).toBeCloseTo(1.2, 5);
    expect(s.levelHeal).toBe(10);
    expect(s.thorns).toBe(18);
    expect(s.dodge).toBeCloseTo(0.25, 5);
    expect(s.lowHpDamage).toBeCloseTo(1.12, 5);
    expect(s.doubleCast).toBeCloseTo(0.3, 5);
  });
});

/* ── 2-1. 추가 스킬 (액티브 A21~A35 · 패시브 P19~P28 · 진화 E13~E27) ── */

describe("추가 스킬 — 액티브 15 · 패시브 10 · 진화 15", () => {
  const NEW_ACTIVES = ACTIVE_IDS.slice(20);

  /** 적 떼 한가운데에서 시작하는 런 (카드는 매 프레임 치워서 멈추지 않게) */
  function crowd(seed: number): Run {
    const run = createRun(seed, "dark", true);
    const w = run.world;
    w.player.invuln = 9999;
    for (let k = 0; k < 40; k++) {
      const a = (Math.PI * 2 * k) / 40;
      const d = 50 + (k % 4) * 45;
      const j = spawnEnemy(w, k % 5 === 0 ? "tetradeca" : "square", w.player.x + Math.cos(a) * d, w.player.y + Math.sin(a) * d);
      w.enemies.speed[j] = 0;
    }
    refreshGrid(w);
    return run;
  }

  function play(run: Run, frames: number): void {
    for (let f = 0; f < frames; f++) {
      run.cards = [];
      run.world.player.invuln = 9999;
      update(run, DT, { mx: 0, my: 0 });
    }
  }

  it("새 액티브 15종은 전부 진화가 있고, 짝 패시브가 서로 다르다", () => {
    expect(NEW_ACTIVES).toHaveLength(15);
    const reqs = NEW_ACTIVES.map((id) => ACTIVES[id].evoReq);
    expect(reqs.every(Boolean)).toBe(true);
    expect(new Set(reqs).size).toBe(15);
  });

  it("이제 모든 패시브가 어떤 진화의 재료다", () => {
    for (const id of PASSIVE_IDS) {
      expect(EVO_IDS.some((e) => EVOLUTIONS[e].req === id || EVOLUTIONS[e].base === id), id).toBe(true);
    }
  });

  it("새 진화도 액티브 MAX + 짝 패시브 Lv3 으로 열린다", () => {
    for (const id of NEW_ACTIVES) {
      const w = world();
      const sk = ACTIVES[id];
      w.actives = [{ id, lv: 5, evo: null, cd: 0 }];
      w.passives = passives([[sk.evoReq as PassiveId, 3]]);
      expect(pendingEvolution(w), id).toBe(sk.evo);
    }
  });

  for (const evolved of [false, true]) {
    it(`${evolved ? "진화" : "기본"} — 액티브 35종이 모두 예외·NaN 없이 동작한다`, () => {
      for (const id of ACTIVE_IDS) {
        const sk = ACTIVES[id];
        const run = crowd(500);
        const w = run.world;
        w.actives = [{ id, lv: 5, evo: evolved ? sk.evo : null, cd: 0 }];
        const hp0 = new Float32Array(w.enemies.hp);
        play(run, 180);
        const e = w.enemies;
        for (let i = 0; i < e.cap; i++) {
          if (!e.alive[i]) continue;
          expect(Number.isFinite(e.hp[i]) && Number.isFinite(e.x[i]) && Number.isFinite(e.y[i]), id).toBe(true);
        }
        expect(Number.isFinite(w.player.x) && Number.isFinite(w.player.hp), id).toBe(true);
        // 혼자서는 피해가 없는 유형(로그 폭탄·포크 밤은 처치가, 샌드박스는 기절이 할 일)을 빼면 전부 적을 깎는다
        if (sk.arch === "onkill" || sk.arch === "pop" || sk.arch === "stun") continue;
        let hurt = w.run.kills > 0;
        for (let i = 0; i < 40 && !hurt; i++) if (!e.alive[i] || e.hp[i] < hp0[i]) hurt = true;
        expect(hurt, `${id} ${sk.name}`).toBe(true);
      }
    });
  }

  it("🔐 암호화 실드 — 주변 적 탄을 지우고, 🔏 진화하면 내 탄으로 되쏜다", () => {
    for (const evo of [null, "E13"] as const) {
      const run = createRun(31, "dark", true);
      const w = run.world;
      w.actives = [{ id: "A21", lv: 1, evo, cd: 0 }];
      spawnEnemy(w, "square", w.player.x + 400, w.player.y);
      const b = spawnBullet(w, w.player.x + 40, w.player.y, -100, 0, 10, 3, 6, 7, TAG.physical, { hostile: true });
      refreshGrid(w);
      updateSkills(w, DT);
      if (evo) {
        expect(w.bullets.alive[b]).toBe(1);
        expect(w.bullets.hostile[b]).toBe(0);
        expect(w.bullets.vx[b]).toBeGreaterThan(0); // 적 쪽으로 되돌아간다
      } else {
        expect(w.bullets.alive[b]).toBe(0);
      }
    }
  });

  it("🐛 웜 — 맞히면 두 마리로 갈라진다", () => {
    const w = world(41);
    w.actives = [{ id: "A22", lv: 1, evo: null, cd: 0 }];
    const i = spawnEnemy(w, "tetradeca", w.player.x + 40, w.player.y);
    w.enemies.hp[i] = 99999;
    refreshGrid(w);
    spawnBullet(w, w.player.x + 40, w.player.y, 360, 0, 14, 1, 6, LOOK.worm, TAG.physical, { owner: 0, aux: 2 });
    updateBullets(w, DT);
    let worms = 0;
    for (let k = 0; k < w.bullets.cap; k++) if (w.bullets.alive[k] && w.bullets.look[k] === LOOK.worm) worms++;
    expect(worms).toBe(2);
  });

  it("🔭 원격 저격 — 보스가 있으면 보스, 없으면 체력이 가장 많은 적", () => {
    const w = worldAt(5);
    const small = spawnEnemy(w, "tri", w.player.x + 100, w.player.y);
    const big = spawnEnemy(w, "tetradeca", w.player.x + 300, w.player.y);
    refreshGrid(w);
    w.actives = [{ id: "A23", lv: 1, evo: null, cd: 0 }];
    const smallHp = w.enemies.hp[small];
    const bigHp = w.enemies.hp[big];
    updateSkills(w, DT);
    expect(w.enemies.hp[big]).toBeLessThan(bigHp);
    expect(w.enemies.hp[small]).toBe(smallHp);

    const bi = bossReady(w, "hexa");
    w.enemies.x[bi] = w.player.x - 250;
    w.enemies.y[bi] = w.player.y;
    refreshGrid(w);
    const bossHp = w.enemies.hp[bi];
    const big2 = w.enemies.hp[big];
    w.actives[0].cd = 0;
    updateSkills(w, DT);
    expect(w.enemies.hp[bi]).toBeLessThan(bossHp);
    expect(w.enemies.hp[big]).toBe(big2);
  });

  it("🔪 킬 스위치 — 체력이 기준 아래인 잡몹만 즉시 처치한다", () => {
    const w = world(51);
    w.actives = [{ id: "A26", lv: 1, evo: null, cd: 0 }];
    const low = spawnEnemy(w, "square", w.player.x + 100, w.player.y);
    w.enemies.hp[low] = w.enemies.maxHp[low] * 0.1;
    const full = spawnEnemy(w, "square", w.player.x + 140, w.player.y);
    const fullHp = w.enemies.hp[full];
    refreshGrid(w);
    updateSkills(w, DT);
    expect(w.enemies.alive[low]).toBe(0);
    expect(w.enemies.hp[full]).toBe(fullHp);
  });

  it("🪤 트립와이어 — 밟으면 터지고, 🕸️ 진화하면 작은 지뢰 3개로 갈라진다", () => {
    const w = world(61);
    const x = w.player.x + 200;
    const y = w.player.y;
    spawnBullet(w, x, y, 0, 0, 40, 9, 10, LOOK.mine, TAG.explosion | TAG.aoe, { owner: 0, aux: 72, pierce: 1 });
    const j = spawnEnemy(w, "tetradeca", x + 5, y);
    w.enemies.hp[j] = 99999;
    refreshGrid(w);
    updateBullets(w, DT);
    expect(w.enemies.hp[j]).toBeLessThan(99999);
    // 원래 자리의 지뢰는 사라지고 (풀 칸은 작은 지뢰가 다시 쓸 수 있다) 둘레에 작은 지뢰 3개
    let mines = 0;
    for (let k = 0; k < w.bullets.cap; k++) {
      if (!w.bullets.alive[k] || w.bullets.look[k] !== LOOK.mine) continue;
      mines++;
      expect(Math.hypot(w.bullets.x[k] - x, w.bullets.y[k] - y)).toBeGreaterThan(30);
      expect(w.bullets.pierce[k]).toBe(0); // 작은 지뢰는 다시 갈라지지 않는다
    }
    expect(mines).toBe(3);
  });

  it("🍴 포크 밤 — 처치한 잡몹이 다음 프레임에 터진다 (없으면 쌓이지 않는다)", () => {
    const none = world(70);
    updateSkills(none, DT);
    killEnemy(none, spawnEnemy(none, "tri", none.player.x + 100, none.player.y));
    expect(none.pops.n).toBe(0);

    const w = world(71);
    w.actives = [{ id: "A33", lv: 5, evo: "E25", cd: 0 }];
    updateSkills(w, DT);
    expect(w.pops.chance).toBeCloseTo((0.12 + 0.03 * 4) * 2, 5);
    w.pops.chance = 1;
    const victim = spawnEnemy(w, "tri", w.player.x + 100, w.player.y);
    const near = spawnEnemy(w, "tetradeca", w.player.x + 110, w.player.y);
    w.enemies.hp[near] = 99999;
    refreshGrid(w);
    killEnemy(w, victim);
    expect(w.pops.n).toBe(1);
    updateSkills(w, DT);
    expect(w.enemies.hp[near]).toBeLessThan(99999);
    expect(w.pops.n).toBe(0);
  });

  it("🧵 멀티스레드 — 확률이 1이면 산탄이 두 번 나간다", () => {
    const shots = (doubleCast: number) => {
      const w = world(85);
      w.stats.doubleCast = doubleCast;
      w.actives = [{ id: "A30", lv: 1, evo: null, cd: 0 }];
      spawnEnemy(w, "square", w.player.x + 200, w.player.y);
      refreshGrid(w);
      updateSkills(w, DT);
      let n = 0;
      for (let k = 0; k < w.bullets.cap; k++) if (w.bullets.alive[k] && !w.bullets.hostile[k]) n++;
      return n;
    };
    expect(shots(1)).toBe(shots(0) * 2);
  });

  it("🚇 터널링 — 깃털 표창이 관통한다", () => {
    const w = world(86);
    w.passives = passives([["P21", 2]]);
    recalcStats(w);
    spawnEnemy(w, "square", w.player.x + 200, w.player.y);
    refreshGrid(w);
    updateSkills(w, DT);
    let found = false;
    for (let k = 0; k < w.bullets.cap; k++) if (w.bullets.alive[k] && w.bullets.look[k] === 0) found = w.bullets.pierce[k] === 2;
    expect(found).toBe(true);
  });

  it("📐 서브넷 확장 — 오라 반경이 늘고, 🧪 익스플로잇 — 둔화가 길어진다", () => {
    const s0 = applyPassives([]);
    const s5 = applyPassives(passives([["P19", 5]]));
    expect(auraRadius(ACTIVES.A03, 1, false, s5)).toBeCloseTo(auraRadius(ACTIVES.A03, 1, false, s0) * 1.5, 5);

    const w = world(87);
    w.passives = passives([["P22", 1]]);
    recalcStats(w);
    w.actives = [{ id: "A11", lv: 1, evo: null, cd: 0 }];
    const j = spawnEnemy(w, "tetradeca", w.player.x + 80, w.player.y);
    refreshGrid(w);
    updateSkills(w, DT);
    expect(w.enemies.slowT[j]).toBeCloseTo(2.4, 5);
  });

  it("🔍 취약점 분석 — 보스·특수 몬스터에게만 더 아프다", () => {
    const w = world(88);
    w.passives = passives([["P20", 2]]);
    recalcStats(w);
    const normal = spawnEnemy(w, "square", w.player.x + 300, w.player.y);
    const special = spawnEnemy(w, "tetradeca", w.player.x - 300, w.player.y);
    w.enemies.hp[normal] = 1000;
    w.enemies.hp[special] = 1000;
    damageEnemy(w, normal, 100, TAG.physical, false);
    damageEnemy(w, special, 100, TAG.physical, false);
    expect(1000 - w.enemies.hp[normal]).toBeCloseTo(100, 3);
    expect(1000 - w.enemies.hp[special]).toBeCloseTo(130, 3);
  });

  it("🚨 페일세이프 — 체력 40% 이하에서만 피해가 오른다", () => {
    const hit = (hpRatio: number) => {
      const w = world(89);
      w.passives = passives([["P27", 2]]);
      recalcStats(w);
      w.player.hp = w.player.maxHp * hpRatio;
      const j = spawnEnemy(w, "square", w.player.x + 300, w.player.y);
      w.enemies.hp[j] = 1000;
      damageEnemy(w, j, 100, TAG.physical, false);
      return 1000 - w.enemies.hp[j];
    };
    expect(hit(1)).toBeCloseTo(100, 3);
    expect(hit(0.3)).toBeCloseTo(124, 3);
  });

  it("📉 패킷 손실 — 흘리면 체력이 줄지 않는다", () => {
    const w = world(90);
    w.stats.dodge = 1;
    const hp = w.player.hp;
    hurtPlayer(w, 30);
    expect(w.player.hp).toBe(hp);
    expect(w.log.some((l) => l.m.k === "dodged")).toBe(true);
  });

  it("↩️ 역추적 — 맞으면 주변 적이 피해를 입는다", () => {
    const w = world(91);
    w.passives = passives([["P25", 2]]);
    recalcStats(w);
    const j = spawnEnemy(w, "square", w.player.x + 60, w.player.y);
    w.enemies.hp[j] = 1000;
    refreshGrid(w);
    hurtPlayer(w, 5);
    expect(1000 - w.enemies.hp[j]).toBeCloseTo(36, 3);
  });

  it("🗄️ 백업 서버 — 고를 때마다 리롤 +1", () => {
    const run = createRun(92, "dark", true);
    const before = run.rerolls;
    run.cards = [{ kind: "new-passive", id: "P23", name: "x", emoji: "x", desc: "x", level: "신규" }];
    chooseCard(run, 0);
    expect(run.rerolls).toBe(before + 1);
  });

  it("🩺 핫픽스 — 레벨업할 때마다 체력을 회복한다", () => {
    const run = createRun(93, "dark", true);
    const w = run.world;
    w.passives = passives([["P24", 2]]);
    recalcStats(w);
    w.player.invuln = 9999;
    w.player.hp = 40;
    w.player.xp = w.player.xpNext - 0.5;
    spawnOrb(w, w.player.x, w.player.y, 5);
    const lv = w.player.level;
    for (let f = 0; f < 60 && w.player.level === lv; f++) {
      run.cards = [];
      update(run, DT, { mx: 0, my: 0 });
    }
    expect(w.player.level).toBe(lv + 1);
    expect(w.player.hp).toBeGreaterThanOrEqual(50);
  });
});

/* ── 3. 진화 조건 ───────────────────────────────────────────── */

describe("진화 (§6.1)", () => {
  it("액티브 MAX + 짝 패시브 Lv3 이면 진화할 수 있다", () => {
    const w = world();
    w.actives = [{ id: "A01", lv: 5, evo: null, cd: 0 }];
    w.passives = passives([["P03", 3]]);
    expect(pendingEvolution(w)).toBe("E01");
  });

  it("하나라도 모자라면 진화하지 않는다", () => {
    const w = world();
    w.actives = [{ id: "A01", lv: 4, evo: null, cd: 0 }];
    w.passives = passives([["P03", 3]]);
    expect(pendingEvolution(w)).toBeNull();
    w.actives = [{ id: "A01", lv: 5, evo: null, cd: 0 }];
    w.passives = passives([["P03", 2]]);
    expect(pendingEvolution(w)).toBeNull();
  });

  it("E12 는 패시브 두 개(P13 MAX + P14 Lv3)로 열린다", () => {
    const w = world();
    w.passives = passives([["P13", 5], ["P14", 3]]);
    expect(pendingEvolution(w)).toBe("E12");
  });

  it("진화 카드는 1번 슬롯에 고정으로 나온다 (§7 추첨 규칙 1)", () => {
    const w = world();
    w.actives = [{ id: "A01", lv: 5, evo: null, cd: 0 }];
    w.passives = passives([["P03", 3]]);
    for (let i = 0; i < 20; i++) {
      const cards = drawCards(w);
      expect(cards[0].kind).toBe("evolution");
      expect(cards[0].id).toBe("E01");
    }
  });

  it("진화를 적용하면 슬롯에 붙고 통계가 오른다", () => {
    const w = world();
    w.actives = [{ id: "A01", lv: 5, evo: null, cd: 0 }];
    w.passives = passives([["P03", 3]]);
    applyCard(w, drawCards(w)[0]);
    expect(w.actives[0].evo).toBe("E01");
    expect(w.evolutions).toContain("E01");
    expect(w.run.evolutions).toBe(1);
    expect(w.freeze).toBeGreaterThan(0);
  });
});

/* ── 4. 카드 추첨 ───────────────────────────────────────────── */

describe("레벨업 카드 (§7 추첨 규칙)", () => {
  it("항상 서로 다른 3장", () => {
    const w = world();
    for (let i = 0; i < 40; i++) {
      const cards = drawCards(w);
      expect(cards).toHaveLength(3);
      expect(new Set(cards.map((c) => c.id)).size).toBe(3);
    }
  });

  it("Lv6 이전에는 신규 액티브가 최소 1장 나온다", () => {
    const w = world();
    w.player.level = 3;
    for (let i = 0; i < 30; i++) {
      expect(drawCards(w).some((c) => c.kind === "new-active")).toBe(true);
    }
  });

  it("슬롯이 가득 차면 보유 스킬 강화만 나온다 (§6.1)", () => {
    const w = world();
    w.actives = ACTIVE_IDS.slice(0, CFG.slots.active).map((id) => ({ id, lv: 1, evo: null, cd: 0 }));
    w.passives = PASSIVE_IDS.slice(0, CFG.slots.passive).map((id) => ({ id, lv: 1 }));
    for (let i = 0; i < 30; i++) {
      for (const c of drawCards(w)) {
        expect(c.kind === "up-active" || c.kind === "up-passive").toBe(true);
      }
    }
  });

  it("체력 30% 이하면 구제 패시브가 더 자주 나온다 (§7 추첨 규칙 5)", () => {
    const rescue = new Set(["P05", "P12", "P13"]);
    const count = (hpRatio: number) => {
      const w = world(777);
      w.player.level = 12;
      w.player.hp = w.player.maxHp * hpRatio;
      let n = 0;
      for (let i = 0; i < 300; i++) for (const c of drawCards(w)) if (rescue.has(c.id)) n++;
      return n;
    };
    expect(count(0.2)).toBeGreaterThan(count(1));
  });

  it("같은 카드가 3회 연속으로는 안 나온다 (§7 추첨 규칙 4)", () => {
    const w = world();
    const history = [["A02"], ["A02"]] as never;
    for (let i = 0; i < 30; i++) {
      expect(drawCards(w, history).some((c) => c.id === "A02")).toBe(false);
    }
  });

  it("카드를 적용하면 레벨이 오르거나 새로 들어온다", () => {
    const w = world();
    const before = w.actives.length;
    applyCard(w, { kind: "new-active", id: "A08", name: "x", emoji: "x", desc: "x", level: "신규" });
    expect(w.actives).toHaveLength(before + 1);
    applyCard(w, { kind: "up-active", id: "A08", name: "x", emoji: "x", desc: "x", level: "Lv1 → 2" });
    expect(w.actives.find((s) => s.id === "A08")?.lv).toBe(2);
    applyCard(w, { kind: "new-passive", id: "P01", name: "x", emoji: "x", desc: "x", level: "신규" });
    expect(w.stats.damage).toBeCloseTo(1.12, 5);
  });
});


/* ── 5. 장애물 — 무한 맵 (§3) ───────────────────────────────── */

describe("장애물 (무한 맵)", () => {
  it("어느 넓은 영역을 재도 밀도가 6~9% 안에 든다", () => {
    for (const seed of [1, 77, 4242, 31337, 99991]) {
      for (const [x, y] of [[-3000, -3000], [5000, 800], [-12000, 9000]]) {
        const d = densityIn(seed, x, y, x + 3200, y + 2400);
        expect(d, `seed ${seed} @ ${x},${y}`).toBeGreaterThanOrEqual(CFG.obstacle.densityMin);
        expect(d, `seed ${seed} @ ${x},${y}`).toBeLessThanOrEqual(CFG.obstacle.densityMax);
      }
    }
  });

  it("이웃한 어떤 두 장애물 사이에도 140px 통로가 남는다", () => {
    const seed = 4242;
    for (let cy = -8; cy <= 8; cy++) {
      for (let cx = -8; cx <= 8; cx++) {
        const a = obstacleAt(seed, cx, cy);
        if (a < 0) continue;
        for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
          const b = obstacleAt(seed, cx + dx, cy + dy);
          if (b < 0) continue;
          const pa = cellCenter(cx, cy);
          const pb = cellCenter(cx + dx, cy + dy);
          const ka = OBSTACLE_KINDS[a];
          const kb = OBSTACLE_KINDS[b];
          expect(passable(pa.x, pa.y, ka.w, ka.h, pb.x, pb.y, kb.w, kb.h, CFG.obstacle.minCorridorPx)).toBe(true);
        }
      }
    }
    expect(COL_STEP - Math.max(...OBSTACLE_KINDS.map((k) => k.w))).toBeGreaterThanOrEqual(CFG.obstacle.minCorridorPx);
    expect(ROW_STEP - Math.max(...OBSTACLE_KINDS.map((k) => k.h))).toBeGreaterThanOrEqual(CFG.obstacle.minCorridorPx);
  });

  it("시작 지점 200px 안에는 두지 않는다", () => {
    for (const seed of [1, 2, 3, 99]) {
      const w = createWorld(seed, "dark", true);
      streamObstacles(w, true);
      const o = w.obstacles;
      for (let i = 0; i < o.cap; i++) {
        if (!o.alive[i]) continue;
        expect(Math.hypot(o.x[i], o.y[i])).toBeGreaterThanOrEqual(CFG.obstacle.spawnClearRadius);
      }
    }
  });

  it("카메라를 따라 흘려 깔고, 멀어진 건 회수한다 (풀 상한 안에서)", () => {
    const w = world(9);
    streamObstacles(w, true);
    const first = loadedObstacles(w);
    expect(first).toBeGreaterThan(10);
    for (let k = 1; k <= 40; k++) {
      w.cam.x = k * 400;
      w.cam.y = -k * 260;
      streamObstacles(w);
      expect(loadedObstacles(w)).toBeLessThanOrEqual(CFG.perf.maxObstacles);
      const o = w.obstacles;
      for (let i = 0; i < o.cap; i++) {
        if (!o.alive[i]) continue;
        expect(Math.abs(o.x[i] - w.cam.x)).toBeLessThan(CFG.view.w / 2 + CFG.obstacle.streamMargin + COL_STEP * 2);
      }
    }
    expect(loadedObstacles(w)).toBeGreaterThan(10);
  });

  it("같은 자리로 돌아오면 같은 배치 — 부순 칸은 비어 있다", () => {
    const w = world(21);
    w.cam.x = 2000;
    w.cam.y = 2000;
    streamObstacles(w, true);
    const o = w.obstacles;
    let target = -1;
    for (let i = 0; i < o.cap; i++) if (o.alive[i]) { target = i; break; }
    const tx = o.x[target];
    const ty = o.y[target];
    const before = loadedObstacles(w);
    while (!damageObstacle(w, target, 999)) { /* 부술 때까지 */ }
    expect(w.run.obstacles).toBe(1);
    // 멀리 갔다가 돌아온다
    w.cam.x = 20000;
    streamObstacles(w);
    w.cam.x = 2000;
    streamObstacles(w);
    expect(loadedObstacles(w)).toBe(before - 1);
    let found = false;
    for (let i = 0; i < o.cap; i++) if (o.alive[i] && o.x[i] === tx && o.y[i] === ty) found = true;
    expect(found).toBe(false);
    // ⏪ 시간 역주행이 되살린다
    expect(restoreObstacles(w, 1)).toBe(1);
    expect(loadedObstacles(w)).toBe(before);
  });

  it("보스가 싸울 자리는 치워진다", () => {
    const w = world(31337);
    w.cam.x = 1500;
    w.cam.y = 0;
    streamObstacles(w, true);
    clearArea(w, 1500, 0, 5000);
    expect(loadedObstacles(w)).toBe(0);
  });

  it("장애물 종류 5종이 모두 정의돼 있다 (가중치·그림도 같은 수)", () => {
    expect(OBSTACLE_KINDS).toHaveLength(5);
    for (const k of OBSTACLE_KINDS) expect(k.hp).toBeGreaterThan(0);
    expect(CFG.obstacle.kindWeights).toHaveLength(OBSTACLE_KINDS.length);
    // 그림 비율(engine/assets.ts)이 빠진 종류가 없어야 판정 사각형과 그림이 맞는다
    for (const k of OBSTACLE_KINDS) expect(OBSTACLE_ART[k.id]).toBeDefined();
  });
});

/* ── 6. 단계 15 + 무한 (§2) ──────────────────────────────────── */

describe("단계 (§2)", () => {
  it("보스는 5·8·12·15단계, 14단계는 총력전", () => {
    expect(STAGES).toHaveLength(15);
    const bosses = STAGES.filter((s) => s.boss).map((s) => [s.id, s.boss]);
    expect(bosses).toEqual([[5, "hexa"], [8, "nona"], [12, "trideca"], [15, "chrono"]]);
    expect(STAGES[13].allOut).toBe(true);
    for (const s of STAGES) expect(bossOf(s.id)).toBe(s.boss);
  });

  it("도형이 기획서 순서대로 하나씩 풀린다", () => {
    const order = STAGES.filter((s) => s.mob).map((s) => s.mob);
    expect(order).toEqual(["tri", "square", "circle", "penta", "hepta", "octa", "deca", "hendeca", "dodeca", "tetradeca"]);
    // 앞 단계 도형은 계속 섞여 나온다
    expect(stageInfo(1).pool).toEqual(["tri"]);
    expect(stageInfo(7).pool).toEqual(["tri", "square", "circle", "penta", "hepta", "octa"]);
    expect(stageInfo(14).pool).toHaveLength(10);
    expect(stageInfo(22).pool).toHaveLength(10);
  });

  it("몬스터 수치가 기획서의 관계를 지킨다", () => {
    const s = MOB_SPEC;
    // 삼각형은 시작 스킬 한 방
    expect(s.tri.hp).toBeLessThanOrEqual(ACTIVES.A01.dmg);
    expect(s.square.hp).toBe(s.tri.hp * 2);
    expect(s.octa.hp).toBe(s.square.hp * 2);
    expect(s.octa.speed).toBeLessThan(s.square.speed);
    expect(s.circle.speed).toBeGreaterThan(s.square.speed);
    expect(s.circle.hp).toBeGreaterThan(s.tri.hp);
    expect(s.circle.hp).toBeLessThan(s.square.hp);
    expect(s.deca.speed).toBe(s.circle.speed * 2);
    expect(s.deca.hp).toBeLessThan(s.tri.hp);
    // 십이각형 — 느리고 약하지만 한 대가 아프다
    expect(s.dodeca.dmg).toBe(Math.max(...MOB_KINDS.map((k) => s[k].dmg)));
    expect(s.dodeca.speed).toBeLessThan(s.tri.speed);
    // 십사각형 — 체력 최고, 속도 최저
    expect(s.tetradeca.hp).toBe(Math.max(...MOB_KINDS.map((k) => s[k].hp)));
    expect(s.tetradeca.speed).toBe(Math.min(...MOB_KINDS.map((k) => s[k].speed)));
    expect(s.circle.sides).toBe(0);
  });

  it("16단계부터 무한 — 십오각형은 19·23·27… 에 다시 온다", () => {
    expect(bossOf(16)).toBeNull();
    expect(bossOf(19)).toBe("chrono");
    expect(bossOf(23)).toBe("chrono");
    expect(bossOf(20)).toBeNull();
    expect(chronoLoop(15)).toBe(1);
    expect(chronoLoop(19)).toBe(2);
    expect(chronoLoop(27)).toBe(4);
    expect(stageInfo(19).endless).toBe(true);
  });

  it("도달 단계로 잡은 보스 수가 정해진다 (서버 검증과 같은 규칙)", () => {
    expect(bossesBefore(1)).toBe(0);
    expect(bossesBefore(5)).toBe(0);
    expect(bossesBefore(6)).toBe(1);
    expect(bossesBefore(16)).toBe(4);
    expect(bossesBefore(20)).toBe(5);
  });

  it("서버(survive_bosses_before)의 닫힌 식과 같은 규칙이다", () => {
    // supabase/migrations/20261001000000_survive_v3.sql 과 한 글자도 다르면 안 된다
    const sql = (s: number) =>
      (s > 5 ? 1 : 0) + (s > 8 ? 1 : 0) + (s > 12 ? 1 : 0) + (s > 15 ? Math.floor((s - 16) / 4) + 1 : 0);
    for (let s = 1; s <= 80; s++) expect(bossesBefore(s), `stage ${s}`).toBe(sql(s));
  });

  it("체력·공격력·스폰 배율이 단계마다 오른다", () => {
    expect(hpMult(1)).toBeCloseTo(1, 5);
    expect(hpMult(7)).toBeCloseTo(1 + 0.18 * 6, 5);
    expect(atkMult(7)).toBeCloseTo(1 + 0.12 * 6, 5);
    expect(spawnPerSec(10)).toBeGreaterThan(spawnPerSec(1));
    expect(spawnPerSec(99)).toBeLessThanOrEqual(CFG.spawn.maxPerSec);
  });

  it("XP 곡선은 10 + 7L", () => {
    expect(xpToNext(1)).toBe(17);
    expect(xpToNext(10)).toBe(80);
  });

  it("시간이 지나면 다음 단계, 보스 단계는 보스를 잡아야 넘어간다", () => {
    const run = createRun(1, "dark", true);
    const w = run.world;
    w.player.invuln = 9999;
    expect(w.stage).toBe(1);
    w.stageT = CFG.stage.normalSec;
    update(run, DT, { mx: 0, my: 0 });
    expect(w.stage).toBe(2);

    // 5단계로 건너뛰어 보스를 부른다
    w.stage = 4;
    w.info = stageInfo(4);
    w.stageT = CFG.stage.normalSec;
    update(run, DT, { mx: 0, my: 0 });
    expect(w.stage).toBe(5);
    for (let i = 0; i < 60 * (CFG.boss.spawnDelay + 0.2); i++) update(run, DT, { mx: 0, my: 0 });
    expect(w.boss.active).toBe(true);
    expect(w.boss.kind).toBe("hexa");
    // 시간이 아무리 흘러도 보스를 잡기 전엔 그대로
    w.stageT = 999;
    update(run, DT, { mx: 0, my: 0 });
    expect(w.stage).toBe(5);
    killEnemy(w, w.boss.idx);
    update(run, DT, { mx: 0, my: 0 });
    expect(w.stage).toBe(6);
    expect(w.run.bosses).toBe(1);
    expect(w.boss.active).toBe(false);
  });

  it("십오각형을 잡으면 cleared 가 되고 16단계로 간다", () => {
    const run = createRun(2, "dark", true);
    const w = run.world;
    w.player.invuln = 9999;
    w.stage = 15;
    w.info = stageInfo(15);
    w.stageT = CFG.boss.spawnDelay;
    update(run, DT, { mx: 0, my: 0 });
    expect(w.boss.kind).toBe("chrono");
    killEnemy(w, w.boss.idx);
    update(run, DT, { mx: 0, my: 0 });
    expect(w.cleared).toBe(true);
    expect(w.stage).toBe(16);
    expect(w.info.endless).toBe(true);
  });
});

/* ── 7. 스폰 ────────────────────────────────────────────────── */

describe("스포너", () => {
  it("초당 예산을 넘지 않는다", () => {
    const w = world(555);
    const st = createSpawnState();
    for (let i = 0; i < 60; i++) updateSpawner(w, st, DT);
    expect(aliveEnemies(w)).toBeLessThanOrEqual(Math.ceil(spawnPerSec(1)) + 1);
  });

  it("동시 적 상한을 넘기지 않는다", () => {
    const w = worldAt(14, 556);
    const st = createSpawnState();
    for (let i = 0; i < 60 * 120; i++) {
      updateSpawner(w, st, DT);
      w.t += DT;
      w.stageT += DT;
    }
    expect(aliveEnemies(w)).toBeLessThanOrEqual(CFG.perf.maxEnemies);
  });

  it("특수 몬스터는 동시 수 제한을 지킨다", () => {
    const w = worldAt(14, 559);
    const st = createSpawnState();
    for (let i = 0; i < 60 * 60; i++) {
      updateSpawner(w, st, DT);
      w.stageT += DT;
    }
    expect(countKind(w, "hendeca")).toBeLessThanOrEqual(MOB_SPEC.hendeca.max);
    expect(countKind(w, "tetradeca")).toBeLessThanOrEqual(MOB_SPEC.tetradeca.max);
  });

  it("적은 항상 화면 밖(플레이어에서 300px 이상)에서 나온다", () => {
    const w = world(557);
    const st = createSpawnState();
    for (let i = 0; i < 600; i++) updateSpawner(w, st, DT);
    const e = w.enemies;
    for (let i = 0; i < e.cap; i++) {
      if (!e.alive[i]) continue;
      expect(Math.hypot(e.x[i] - w.player.x, e.y[i] - w.player.y)).toBeGreaterThan(299);
    }
  });

  it("1단계에는 삼각형만 나온다", () => {
    const w = world(558);
    const st = createSpawnState();
    for (let i = 0; i < 600; i++) updateSpawner(w, st, DT);
    const tri = ENEMY_KINDS.indexOf("tri");
    for (let i = 0; i < w.enemies.cap; i++) if (w.enemies.alive[i]) expect(w.enemies.kind[i]).toBe(tri);
  });
});

/* ── 8. 특수 몬스터 (§5) ────────────────────────────────────── */

describe("특수 몬스터 (§5)", () => {
  it("🔶 오각형 — 조준 후 돌진하고, 돌진 경로의 장애물을 부순다", () => {
    const w = worldAt(4, 1);
    const i = spawnEnemy(w, "penta", w.player.x + 300, w.player.y);
    w.enemies.shootCd[i] = 0;
    let windup = false;
    let dashed = false;
    for (let k = 0; k < 60 * 3; k++) {
      refreshGrid(w);
      updateEnemies(w, DT);
      if (w.enemies.dashT[i] > 0) windup = true;
      if (w.enemies.dashT[i] < 0) dashed = true;
    }
    expect(windup).toBe(true);
    expect(dashed).toBe(true);
    expect(w.enemies.shootCd[i]).toBeGreaterThan(0);
  });

  it("🟨 칠각형 — 4방향 탄, 맞으면 이동속도가 준다", () => {
    const w = worldAt(6, 2);
    const i = spawnEnemy(w, "hepta", w.player.x + 150, w.player.y);
    w.enemies.shootCd[i] = 0;
    refreshGrid(w);
    updateEnemies(w, DT);
    let shots = 0;
    for (let k = 0; k < w.bullets.cap; k++) if (w.bullets.alive[k] && w.bullets.hostile[k]) shots++;
    expect(shots).toBe(4);
    for (let k = 0; k < 60 && w.player.slow <= 0; k++) updateHostileBullets(w, DT);
    expect(w.player.slow).toBeGreaterThan(0);
    expect(w.player.slowMult).toBeLessThan(1);
  });

  it("⬡ 십일각형 — 삼각형·사각형·원형을 소환한다", () => {
    const w = worldAt(10, 3);
    const i = spawnEnemy(w, "hendeca", w.player.x + 400, w.player.y);
    w.enemies.shootCd[i] = 0;
    refreshGrid(w);
    updateEnemies(w, DT);
    const ok = new Set(["tri", "square", "circle"].map((k) => ENEMY_KINDS.indexOf(k as never)));
    let summoned = 0;
    for (let k = 0; k < w.enemies.cap; k++) {
      if (!w.enemies.alive[k] || k === i) continue;
      expect(ok.has(w.enemies.kind[k])).toBe(true);
      summoned++;
    }
    expect(summoned).toBe(CFG.ai.summon.count);
  });

  it("⬢ 십사각형 — 체력을 스스로 회복한다", () => {
    const w = worldAt(13, 4);
    const i = spawnEnemy(w, "tetradeca", w.player.x + 600, w.player.y);
    w.enemies.hp[i] = w.enemies.maxHp[i] * 0.5;
    const before = w.enemies.hp[i];
    for (let k = 0; k < 60 * 4; k++) {
      refreshGrid(w);
      updateEnemies(w, DT);
    }
    expect(w.enemies.hp[i]).toBeGreaterThan(before);
  });
});

/* ── 9. 속성 연계 (§6.2) ────────────────────────────────────── */

describe("속성 연계 (§6.2)", () => {
  function target(w: World): number {
    const i = spawnEnemy(w, "tetradeca", w.player.x + 200, w.player.y);
    w.enemies.hp[i] = 100000;
    w.enemies.maxHp[i] = 100000;
    refreshGrid(w);
    return i;
  }

  it("❄️ 둔화 + ⚡ 전기 = 피해 ×2", () => {
    const a = world(10);
    const b = world(10);
    const ia = target(a);
    const ib = target(b);
    b.enemies.slowT[ib] = 2;
    damageEnemy(a, ia, 100, TAG.electric, false);
    damageEnemy(b, ib, 100, TAG.electric, false);
    expect(a.enemies.hp[ia] - b.enemies.hp[ib]).toBeCloseTo(100, 3);
  });

  it("🕳️ 흡입 + 광역 = 피해 +50%", () => {
    const a = world(11);
    const b = world(11);
    const ia = target(a);
    const ib = target(b);
    b.enemies.pullT[ib] = 1;
    damageEnemy(a, ia, 100, TAG.aoe, false);
    damageEnemy(b, ib, 100, TAG.aoe, false);
    expect(a.enemies.hp[ia] - b.enemies.hp[ib]).toBeCloseTo(50, 3);
  });

  it("🎯 표식 + 관통 = 치명타 확정", () => {
    const w = world(12);
    const i = target(w);
    w.enemies.markT[i] = 2;
    const before = w.enemies.hp[i];
    damageEnemy(w, i, 100, TAG.pierce, false);
    expect(before - w.enemies.hp[i]).toBeCloseTo(100 * w.stats.critDamage, 3);
  });

  it("🔥 화상 + 💥 폭발 = 주변 3체로 번진다", () => {
    const w = world(13);
    const i = target(w);
    w.enemies.burnT[i] = 3;
    w.enemies.burnDps[i] = 10;
    const others: number[] = [];
    for (let k = 0; k < 3; k++) {
      const j = spawnEnemy(w, "tri", w.enemies.x[i] + 20 * (k + 1), w.enemies.y[i]);
      w.enemies.hp[j] = 9999;
      others.push(j);
    }
    refreshGrid(w);
    damageEnemy(w, i, 10, TAG.explosion, false);
    expect(others.some((j) => w.enemies.burnT[j] > 0)).toBe(true);
  });
});

/* ── 10. 피격·부활·즉사 (§9.1) ──────────────────────────────── */

describe("피격과 부활 (§9.1)", () => {
  it("피격하면 흔들림과 로그가 함께 남는다", () => {
    const w = world();
    hurtPlayer(w, 10);
    expect(w.shake).toBeGreaterThan(0);
    expect(w.log.some((l) => l.tag === "WARN")).toBe(true);
    expect(w.run.damageTaken).toBe(1);
  });

  it("무적 중에는 맞지 않는다", () => {
    const w = world();
    hurtPlayer(w, 10);
    const hp = w.player.hp;
    hurtPlayer(w, 10);
    expect(w.player.hp).toBe(hp);
  });

  it("🌑 스텔스 캐시 쉴드는 피격 1회를 무효로 한다", () => {
    const w = world();
    w.passives = passives([["P18", 1]]);
    recalcStats(w);
    w.player.shield = true;
    const hp = w.player.hp;
    hurtPlayer(w, 30);
    expect(w.player.hp).toBe(hp);
    expect(w.player.shield).toBe(false);
  });

  it("부활은 정확히 1초(+Lv당 0.4초) 무적을 준다", () => {
    const w = world();
    w.passives = passives([["P13", 2]]);
    recalcStats(w);
    w.player.hp = 1;
    hurtPlayer(w, 999);
    expect(w.player.alive).toBe(true);
    expect(w.run.revivesUsed).toBe(1);
    expect(w.player.invuln).toBeCloseTo(1.4, 5);
    expect(w.log.some((l) => l.tag === "FATAL")).toBe(true);
  });

  it("부활이 없으면 죽는다", () => {
    const w = world();
    w.player.hp = 1;
    hurtPlayer(w, 999);
    expect(w.player.alive).toBe(false);
    expect(w.over).toBe(true);
  });
});

/* ── 11. 보스 4종 (§6·§7·§11·§12) ───────────────────────────── */

function hazards(w: World, kind: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < w.hazards.cap; i++) if (w.hazards.alive[i] && w.hazards.kind[i] === kind) out.push(i);
  return out;
}

function beams(w: World, kind?: number): number {
  let n = 0;
  for (let i = 0; i < w.beams.cap; i++) if (w.beams.alive[i] && (kind === undefined || w.beams.kind[i] === kind)) n++;
  return n;
}

describe("🔷 육각형 — 레이저 (§6)", () => {
  it("꼭짓점 6곳에서 경고 후 레이저를 쏜다 (발사 순간 흔들림)", () => {
    const w = worldAt(5);
    bossReady(w, "hexa");
    w.player.invuln = 999;
    tick(w, 1.1);
    expect(beams(w, BEAM.damage)).toBe(6);
    w.shake = 0;
    tick(w, CFG.hexa.laserWarn);
    expect(w.shake).toBeGreaterThan(0);
  });

  it("레이저 위에 서 있으면 맞는다", () => {
    const w = worldAt(5);
    const i = bossReady(w, "hexa");
    // 꼭짓점 0 방향 레이저 위에 플레이어를 둔다
    tick(w, 1.05);
    const a = w.enemies.phase[i];
    w.player.x = w.enemies.x[i] + Math.cos(a) * 200;
    w.player.y = w.enemies.y[i] + Math.sin(a) * 200;
    const hp = w.player.hp;
    tick(w, CFG.hexa.laserWarn + 0.1);
    expect(w.player.hp).toBeLessThan(hp);
  });

  it("폭격은 발밑에 떨어지고, 맞으면 즉사한다 (부활이 없으면)", () => {
    const w = worldAt(5);
    bossReady(w, "hexa");
    w.boss.step = 1;
    w.boss.timer = 0;
    tick(w, DT);
    const list = hazards(w, HZ.warn);
    expect(list.length).toBeGreaterThanOrEqual(CFG.hexa.bombCount);
    const onMe = list.some((h) => Math.hypot(w.hazards.x[h] - w.player.x, w.hazards.y[h] - w.player.y) < 1);
    expect(onMe).toBe(true);
    tick(w, CFG.hexa.bombWarn + 0.5);
    expect(w.player.alive).toBe(false);
    expect(w.overReason?.k).toBe("overBoss");
  });

  it("즉사도 부활(P13)은 통한다", () => {
    const w = worldAt(5);
    w.passives = passives([["P13", 1]]);
    recalcStats(w);
    bossReady(w, "hexa");
    w.boss.step = 1;
    w.boss.timer = 0;
    tick(w, CFG.hexa.bombWarn + 0.5);
    expect(w.player.alive).toBe(true);
    expect(w.run.revivesUsed).toBe(1);
  });
});

describe("🔵 구각형 — 포식자 (§7)", () => {
  it("주변 몬스터를 먹으면 커지고 체력·게이지가 오른다 — 경험치는 없다", () => {
    const w = worldAt(8);
    const i = bossReady(w, "nona");
    w.player.invuln = 999;
    w.enemies.hp[i] = w.boss.maxHp * 0.8;
    const r0 = w.enemies.r[i];
    const hp0 = w.enemies.hp[i];
    for (let k = 0; k < 4; k++) spawnEnemy(w, "tri", w.enemies.x[i] + 50 + k * 4, w.enemies.y[i]);
    const kills = w.run.kills;
    tick(w, 0.5);
    expect(w.enemies.r[i]).toBeGreaterThan(r0);
    expect(w.enemies.hp[i]).toBeGreaterThan(hp0);
    expect(w.boss.nonaGauge).toBeGreaterThan(0);
    expect(w.run.kills).toBe(kills);
  });

  it("게이지가 차면 폭발하고 다시 작아진다", () => {
    const w = worldAt(8);
    const i = bossReady(w, "nona");
    w.player.invuln = 999;
    w.enemies.r[i] = CFG.nona.rMax;
    w.boss.nonaGauge = CFG.nona.gaugeMax;
    tick(w, DT);
    expect(w.boss.nonaGauge).toBe(0);
    expect(w.enemies.r[i]).toBe(w.boss.nonaBaseR);
  });

  it("때리면 포식 게이지가 준다", () => {
    const w = worldAt(8);
    const i = bossReady(w, "nona");
    w.boss.nonaGauge = 50;
    damageEnemy(w, i, w.boss.maxHp * 0.05, TAG.physical, false);
    expect(w.boss.nonaGauge).toBeLessThan(50);
  });

  it("50% 이하 — 노란 꼭짓점 쪽에서 온 공격만 들어간다", () => {
    const w = worldAt(8);
    const i = bossReady(w, "nona");
    w.player.invuln = 999;
    w.enemies.hp[i] = w.boss.maxHp * 0.45;
    tick(w, DT);
    expect(w.boss.gateOn).toBe(true);
    const weak = w.boss.gateA[0];
    const hp = w.enemies.hp[i];
    // 반대쪽에서 → 막힌다
    w.hitOn = true;
    w.hitX = w.enemies.x[i] - Math.cos(weak) * 100;
    w.hitY = w.enemies.y[i] - Math.sin(weak) * 100;
    damageEnemy(w, i, 100, TAG.physical, false);
    expect(w.enemies.hp[i]).toBe(hp);
    // 약점 쪽에서 → 들어간다
    w.hitX = w.enemies.x[i] + Math.cos(weak) * 100;
    w.hitY = w.enemies.y[i] + Math.sin(weak) * 100;
    damageEnemy(w, i, 100, TAG.physical, false);
    w.hitOn = false;
    expect(w.enemies.hp[i]).toBeLessThan(hp);
  });

  it("주변 몬스터를 강화한다 (체력·공격력·크기)", () => {
    const w = worldAt(8);
    const i = bossReady(w, "nona");
    w.player.invuln = 999;
    const j = spawnEnemy(w, "square", w.enemies.x[i] + 350, w.enemies.y[i]);
    const hp = w.enemies.maxHp[j];
    const dmg = w.enemies.dmg[j];
    const r = w.enemies.r[j];
    w.boss.nonaBuffT = 0;
    tick(w, DT);
    expect(w.enemies.buff[j]).toBe(1);
    expect(w.enemies.maxHp[j]).toBeGreaterThan(hp);
    expect(w.enemies.dmg[j]).toBeGreaterThan(dmg);
    expect(w.enemies.r[j]).toBeGreaterThan(r);
  });

  it("비례 탄 — 보스 체력이 높을수록 탄이 크다", () => {
    const size = (ratio: number) => {
      const w = worldAt(8);
      const i = bossReady(w, "nona");
      w.enemies.hp[i] = w.boss.maxHp * ratio;
      w.boss.nonaShotT = 0;
      w.boss.nonaBuffT = 99;
      tick(w, DT);
      for (let k = 0; k < w.bullets.cap; k++) if (w.bullets.alive[k] && w.bullets.hostile[k]) return w.bullets.r[k];
      return 0;
    };
    expect(size(1)).toBeGreaterThan(size(0.6));
  });
});

describe("🟥 십삼각형 — 술래잡기 (§11)", () => {
  it("등장하면 다른 몬스터가 경험치 없이 전부 사라진다", () => {
    const w = worldAt(12);
    for (let k = 0; k < 20; k++) spawnEnemy(w, "tri", w.player.x + 300 + k, w.player.y);
    bossReady(w, "trideca");
    expect(aliveEnemies(w)).toBe(1);
    expect(w.run.kills).toBe(0);
    let orbs = 0;
    for (let k = 0; k < w.orbs.cap; k++) if (w.orbs.alive[k]) orbs++;
    expect(orbs).toBe(0);
    // 콜로세움 동안은 스폰도 멈춘다
    const st = createSpawnState();
    for (let k = 0; k < 600; k++) updateSpawner(w, st, DT);
    expect(aliveEnemies(w)).toBe(1);
  });

  it("콜로세움 밖에 있으면 시간이 갈수록 더 아프다", () => {
    const w = worldAt(12);
    bossReady(w, "trideca");
    w.boss.triDashCd = 99;
    w.boss.triLaserT = 99;
    w.boss.triHoleT = 99;
    w.player.x = w.boss.triArenaX + CFG.trideca.arenaR + 200;
    const hp0 = w.player.hp;
    tick(w, 1);
    const first = hp0 - w.player.hp;
    const hp1 = w.player.hp;
    tick(w, 1);
    const second = hp1 - w.player.hp;
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);
  });

  it("가까이 붙어 있을수록 이동속도가 준다", () => {
    const w = worldAt(12);
    const i = bossReady(w, "trideca");
    w.player.invuln = 999;
    w.boss.triDashCd = 99;
    w.boss.triLaserT = 99;
    w.boss.triHoleT = 99;
    expect(nearPenalty(w)).toBe(1);
    w.player.x = w.enemies.x[i] + 60;
    w.player.y = w.enemies.y[i];
    tick(w, 2);
    expect(nearPenalty(w)).toBeLessThan(1);
    expect(nearPenalty(w)).toBeGreaterThanOrEqual(CFG.trideca.nearMin);
  });

  it("때릴수록 느려진다", () => {
    const w = worldAt(12);
    const i = bossReady(w, "trideca");
    for (let k = 0; k < 20; k++) damageEnemy(w, i, 1, TAG.physical, false);
    expect(w.boss.triSlowF).toBeLessThan(1);
  });

  it("돌진은 1차 → 2차(가로+세로) → 3차(4방향) 순서", () => {
    const w = worldAt(12);
    bossReady(w, "trideca");
    w.player.invuln = 999;
    w.boss.triLaserT = 999;
    w.boss.triHoleT = 999;
    const seen: number[] = [];
    for (let k = 0; k < 60 * 50; k++) {
      tick(w, DT);
      if (w.boss.triDashSeries && seen[seen.length - 1] !== w.boss.triDashSeries) seen.push(w.boss.triDashSeries);
    }
    expect(seen.slice(0, 3)).toEqual([1, 2, 3]);
  });

  it("4방향 레이저 뒤에 빨강(즉사)·파랑(감속) 장판이 남는다", () => {
    const w = worldAt(12);
    bossReady(w, "trideca");
    w.player.invuln = 999;
    w.boss.triDashCd = 999;
    w.boss.triHoleT = 999;
    w.boss.triLaserT = 0;
    tick(w, DT);
    expect(beams(w, BEAM.damage)).toBe(4);
    tick(w, CFG.trideca.laserWarn + CFG.trideca.laserFire + 0.1);
    expect(hazards(w, HZ.red).length + hazards(w, HZ.blue).length).toBeGreaterThan(4);
    expect(hazards(w, HZ.blue).length).toBeGreaterThan(0);
  });

  it("빨간 장판을 밟으면 즉사, 파란 장판은 느려진다", () => {
    const w = worldAt(12);
    bossReady(w, "trideca");
    w.boss.triDashCd = 999;
    w.boss.triLaserT = 999;
    w.boss.triHoleT = 999;
    spawnHazard(w, w.player.x, w.player.y, 30, 5, 0, HZ.blue);
    tick(w, DT);
    expect(w.player.slow).toBeGreaterThan(0);
    spawnHazard(w, w.player.x, w.player.y, 30, 5, 0, HZ.red);
    tick(w, DT);
    expect(w.player.alive).toBe(false);
  });

  it("50% 이하 즉사기 — 콜로세움 안에 있으면 죽고, 밖이면 산다 (최대 3회)", () => {
    const inside = worldAt(12);
    const i = bossReady(inside, "trideca");
    inside.enemies.hp[i] = inside.boss.maxHp * 0.4;
    inside.boss.triDashCd = 999;
    inside.boss.triLaserT = 999;
    inside.boss.triHoleT = 999;
    tick(inside, CFG.trideca.doomWarn + 0.2);
    expect(inside.player.alive).toBe(false);

    const outside = worldAt(12);
    const j = bossReady(outside, "trideca");
    outside.enemies.hp[j] = outside.boss.maxHp * 0.4;
    outside.boss.triDashCd = 999;
    outside.boss.triLaserT = 999;
    outside.boss.triHoleT = 999;
    tick(outside, DT);
    expect(outside.boss.triDoomWarn).toBeGreaterThan(0);
    outside.player.x = outside.boss.triArenaX + CFG.trideca.arenaR + 40;
    tick(outside, CFG.trideca.doomWarn + 0.2);
    expect(outside.player.alive).toBe(true);
    expect(outside.boss.triDoomLeft).toBe(CFG.trideca.doomCount - 1);
  });

  it("블랙홀은 3초 경고 뒤 끌어당긴다 — 안전 장판 위에서는 버틴다", () => {
    const pull = (safe: boolean) => {
      const w = worldAt(12);
      bossReady(w, "trideca");
      w.player.invuln = 999;
      w.boss.triDashCd = 999;
      w.boss.triLaserT = 999;
      w.boss.triHoleT = 0;
      tick(w, DT);
      const hole = hazards(w, HZ.hole)[0];
      expect(hole).toBeDefined();
      expect(hazards(w, HZ.safe)).toHaveLength(CFG.trideca.safeCount);
      w.hazards.x[hole] = w.player.x + 150;
      w.hazards.y[hole] = w.player.y;
      if (safe) {
        const s = hazards(w, HZ.safe)[0];
        w.hazards.x[s] = w.player.x;
        w.hazards.y[s] = w.player.y;
      }
      tick(w, CFG.trideca.holeWarn + CFG.trideca.holePullEvery + 0.1);
      return Math.hypot(w.player.kx, w.player.ky);
    };
    expect(pull(false)).toBeGreaterThan(0);
    expect(pull(true)).toBe(0);
  });
});

describe("⏱️ 십오각형 — 시간을 지배하는 자 (§12)", () => {
  it("제한 시간 5분, 다시 올 때마다 +1분 — 체력도 오른다", () => {
    const a = worldAt(15);
    bossReady(a, "chrono");
    expect(a.boss.chLimit).toBe(300);
    const b = worldAt(19);
    bossReady(b, "chrono");
    expect(b.boss.chLimit).toBe(360);
    expect(b.boss.maxHp).toBeGreaterThan(a.boss.maxHp);
    const c = worldAt(23);
    bossReady(c, "chrono");
    expect(c.boss.chLimit).toBe(420);
  });

  it("시간이 지날수록 최대 체력·공격력이 오른다", () => {
    const w = worldAt(15);
    const i = bossReady(w, "chrono");
    w.player.invuln = 999;
    const hp = w.boss.maxHp;
    const dmg = w.enemies.dmg[i];
    w.boss.t = w.boss.chLimit * 0.5;
    tick(w, DT);
    expect(w.boss.maxHp).toBeGreaterThan(hp);
    expect(w.enemies.dmg[i]).toBeGreaterThan(dmg);
  });

  it("⑩ 제한 시간이 끝나면 최후의 심판 — 부활도 소용없다", () => {
    const w = worldAt(15);
    w.passives = passives([["P13", 5]]);
    recalcStats(w);
    bossReady(w, "chrono");
    w.boss.t = w.boss.chLimit - 0.01;
    tick(w, 0.1);
    expect(w.boss.chTimeout).toBeGreaterThanOrEqual(0);
    expect(chronoTimeLeft(w)).toBe(0);
    // 심판 중에는 보스도 맞지 않는다
    const hp = w.enemies.hp[w.boss.idx];
    damageEnemy(w, w.boss.idx, 99999, TAG.physical, false);
    expect(w.enemies.hp[w.boss.idx]).toBe(hp);
    tick(w, CFG.chrono.timeoutSec + 0.2);
    expect(w.gray).toBe(1);
    expect(w.player.alive).toBe(false);
    expect(w.overReason?.k).toBe("overTime");
    expect(w.run.revivesUsed).toBe(0);
  });

  it("① 시간 역행 — 50% 아래로 떨어지면 과거 체력으로 한 번 되돌아간다", () => {
    const w = worldAt(15);
    const i = bossReady(w, "chrono");
    w.player.invuln = 999;
    w.boss.chStopT = 999;
    tick(w, 3);
    w.enemies.hp[i] = w.boss.maxHp * 0.45;
    tick(w, CFG.chrono.rewindSec + 0.2);
    expect(w.boss.chRewound).toBe(true);
    expect(w.enemies.hp[i]).toBeGreaterThan(w.boss.maxHp * 0.9);
    // 두 번은 없다
    w.enemies.hp[i] = w.boss.maxHp * 0.45;
    tick(w, CFG.chrono.rewindSec + 0.2);
    expect(w.enemies.hp[i]).toBeLessThan(w.boss.maxHp * 0.5);
  });

  it("② 추적탄은 가까울수록 빠르다", () => {
    const speedAt = (dist: number) => {
      const w = worldAt(15);
      const i = bossReady(w, "chrono");
      w.player.invuln = 999;
      w.boss.chHomingT = 0;
      w.boss.chStopT = 999;
      w.boss.chRainT = 999;
      tick(w, DT);
      w.player.x = w.enemies.x[i] + dist;
      w.player.y = w.enemies.y[i];
      updateHostileBullets(w, DT);
      for (let k = 0; k < w.bullets.cap; k++) {
        if (w.bullets.alive[k] && w.bullets.look[k] === 8) return Math.hypot(w.bullets.vx[k], w.bullets.vy[k]);
      }
      return 0;
    };
    expect(speedAt(120)).toBeGreaterThan(speedAt(700));
  });

  it("③ 폭격은 진행될수록 경고가 짧아진다", () => {
    const warnAt = (g: number) => {
      const w = worldAt(15);
      bossReady(w, "chrono");
      w.player.invuln = 999;
      w.boss.chStopT = 999;
      w.boss.t = w.boss.chLimit * g;
      w.boss.chRainT = 0;
      tick(w, DT);
      const list = hazards(w, HZ.warn);
      return { n: list.length, warn: Math.min(...list.map((h) => w.hazards.max[h])) };
    };
    const early = warnAt(0);
    const late = warnAt(0.9);
    expect(late.warn).toBeLessThan(early.warn);
    expect(late.n).toBeGreaterThan(early.n);
  });

  it("④ 시한폭탄을 못 부수면 현재 체력의 절반을 잃는다", () => {
    const w = worldAt(15);
    bossReady(w, "chrono");
    w.boss.chStopT = 999;
    w.boss.chHomingT = 999;
    w.boss.chRainT = 999;
    w.boss.chBombT = 0;
    tick(w, DT);
    expect(countKind(w, "bomb")).toBe(CFG.chrono.bombCount);
    w.player.hp = 80;
    tick(w, CFG.chrono.bombFuse + 0.1);
    expect(countKind(w, "bomb")).toBe(0);
    expect(w.player.hp).toBeCloseTo(40, 0);
  });

  it("④ 폭탄을 다 부수면 아무 일도 없다", () => {
    const w = worldAt(15);
    bossReady(w, "chrono");
    w.boss.chStopT = 999;
    w.boss.chHomingT = 999;
    w.boss.chRainT = 999;
    w.boss.chBombT = 0;
    tick(w, DT);
    const bomb = ENEMY_KINDS.indexOf("bomb");
    for (let k = 0; k < w.enemies.cap; k++) if (w.enemies.alive[k] && w.enemies.kind[k] === bomb) killEnemy(w, k);
    w.player.hp = 80;
    tick(w, CFG.chrono.bombFuse + 0.1);
    expect(w.player.hp).toBe(80);
  });

  it("⑤ 분신 — 약하지만 아프고, 30초 뒤 스스로 사라진다", () => {
    const w = worldAt(15);
    const i = bossReady(w, "chrono");
    w.player.invuln = 999;
    w.boss.chStopT = 999;
    w.boss.chCloneT = 0;
    tick(w, DT);
    expect(countKind(w, "clone")).toBe(CFG.chrono.cloneCount);
    const clone = ENEMY_KINDS.indexOf("clone");
    for (let k = 0; k < w.enemies.cap; k++) {
      if (!w.enemies.alive[k] || w.enemies.kind[k] !== clone) continue;
      expect(w.enemies.maxHp[k]).toBeLessThan(w.boss.maxHp * 0.1);
      expect(w.enemies.speed[k]).toBeLessThan(w.enemies.speed[i]);
      expect(w.enemies.dmg[k]).toBeGreaterThan(w.enemies.dmg[i]);
    }
    tick(w, CFG.chrono.cloneLife + 0.2);
    expect(countKind(w, "clone")).toBe(0);
  });

  it("⑥ 분노 게이지가 오르면 새 잡몹이 세지고, 경험치를 먹으면 준다", () => {
    const run = createRun(5, "dark", true);
    const w = run.world;
    w.player.invuln = 9999;
    w.stage = 15;
    w.info = stageInfo(15);
    w.stageT = CFG.boss.spawnDelay;
    update(run, DT, { mx: 0, my: 0 });
    w.boss.intro = 0;
    w.boss.chRage = 80;
    const strong = spawnEnemy(w, "square", w.player.x + 500, w.player.y);
    w.boss.chRage = 0;
    const weak = spawnEnemy(w, "square", w.player.x + 520, w.player.y);
    expect(w.enemies.maxHp[strong]).toBeGreaterThan(w.enemies.maxHp[weak]);
    expect(w.enemies.dmg[strong]).toBeGreaterThan(w.enemies.dmg[weak]);
    w.boss.chRage = 50;
    const o = w.orbs;
    o.alive[0] = 1;
    o.kind[0] = 0;
    o.value[0] = 20;
    o.x[0] = w.player.x;
    o.y[0] = w.player.y;
    update(run, DT, { mx: 0, my: 0 });
    expect(w.boss.chRage).toBeLessThan(50);
  });

  it("⑦ 25% 이하 — 시계가 되면 12시·6시 방향만 맞는다", () => {
    const w = worldAt(15);
    const i = bossReady(w, "chrono");
    w.player.invuln = 999;
    w.boss.chRewound = true;
    w.boss.chReverseIdx = 3;
    w.boss.chStopT = 999;
    w.enemies.hp[i] = w.boss.maxHp * 0.2;
    tick(w, DT);
    expect(w.boss.gateOn).toBe(true);
    const hp = w.enemies.hp[i];
    w.hitOn = true;
    w.hitX = w.enemies.x[i] + 100; // 3시
    w.hitY = w.enemies.y[i];
    damageEnemy(w, i, 50, TAG.physical, false);
    expect(w.enemies.hp[i]).toBe(hp);
    w.hitX = w.enemies.x[i];
    w.hitY = w.enemies.y[i] - 100; // 12시
    damageEnemy(w, i, 50, TAG.physical, false);
    expect(w.enemies.hp[i]).toBeLessThan(hp);
    const hp2 = w.enemies.hp[i];
    w.hitY = w.enemies.y[i] + 100; // 6시
    damageEnemy(w, i, 50, TAG.physical, false);
    w.hitOn = false;
    expect(w.enemies.hp[i]).toBeLessThan(hp2);
  });

  it("⑧ 시간 정지 — 멈췄다가 풀리는 순간 대규모 공격 + 탄 가속 + 돌진", () => {
    const w = worldAt(15);
    const i = bossReady(w, "chrono");
    w.player.invuln = 999;
    w.boss.chHomingT = 999;
    w.boss.chRainT = 999;
    w.boss.chStopT = 0;
    const mob = spawnEnemy(w, "square", w.player.x + 200, w.player.y);
    tick(w, DT);
    expect(w.frozen).toBeGreaterThan(0);
    // 멈춘 동안 몬스터는 움직이지 않는다
    const mx = w.enemies.x[mob];
    const bx = w.enemies.x[i];
    tick(w, 0.5);
    expect(w.enemies.x[mob]).toBe(mx);
    expect(w.enemies.x[i]).toBe(bx);
    tick(w, CFG.chrono.stopSec);
    expect(hazards(w, HZ.warn).length).toBeGreaterThanOrEqual(CFG.chrono.stopRing);
    expect(w.enemies.dashT[mob]).toBeLessThan(0);
  });

  it("⑨ 시간 역주행 — 최근 처치한 몬스터가 돌아온다 (레벨은 그대로)", () => {
    const w = worldAt(15);
    const i = bossReady(w, "chrono");
    w.player.invuln = 999;
    w.boss.chRewound = true;
    w.boss.chStopT = 999;
    for (let k = 0; k < 5; k++) {
      const j = spawnEnemy(w, "circle", w.player.x + 400, w.player.y + k * 30);
      killEnemy(w, j);
    }
    w.player.level = 9;
    const before = countKind(w, "circle");
    w.enemies.hp[i] = w.boss.maxHp * 0.55;
    tick(w, DT);
    expect(w.boss.chReverseIdx).toBe(1);
    expect(countKind(w, "circle")).toBe(before + 5);
    expect(w.player.level).toBe(9);
  });
});

describe("보스 공통", () => {
  it("보스 4종이 20초 동안 예외·NaN 없이 돈다", () => {
    const kinds = [["hexa", 5], ["nona", 8], ["trideca", 12], ["chrono", 15]] as const;
    for (const [kind, stage] of kinds) {
      const w = worldAt(stage, 1000 + stage);
      w.player.invuln = 99999;
      const i = bossReady(w, kind);
      for (let k = 0; k < 8; k++) spawnEnemy(w, "tri", w.player.x + 200 + k * 20, w.player.y);
      for (let s = 0; s < 20; s++) {
        tick(w, 1);
        w.player.x += 30;
        damageEnemy(w, i, w.boss.maxHp * 0.03, TAG.physical, false);
      }
      expect(Number.isFinite(w.enemies.x[i])).toBe(true);
      expect(Number.isFinite(w.enemies.hp[i])).toBe(true);
      expect(Number.isFinite(w.player.hp)).toBe(true);
    }
  });

  it("보스를 잡으면 남은 패턴(장판·레이저·적 탄·소환물)이 걷힌다", () => {
    const w = worldAt(15);
    bossReady(w, "chrono");
    w.player.invuln = 999;
    w.boss.chBombT = 0;
    w.boss.chRainT = 0;
    w.boss.chHomingT = 0;
    w.boss.chStopT = 999;
    tick(w, DT);
    expect(hazards(w, HZ.warn).length).toBeGreaterThan(0);
    endBoss(w);
    expect(hazards(w, HZ.warn)).toHaveLength(0);
    expect(countKind(w, "bomb")).toBe(0);
    expect(beams(w)).toBe(0);
  });

  it("등장 연출 동안은 맞지 않는다", () => {
    const w = worldAt(5);
    spawnBoss(w, "hexa");
    const hp = w.enemies.hp[w.boss.idx];
    damageEnemy(w, w.boss.idx, 100, TAG.physical, false);
    expect(w.enemies.hp[w.boss.idx]).toBe(hp);
  });
});

/* ── 12. 점수·메타 (§11) ────────────────────────────────────── */

describe("점수와 메타 (§11)", () => {
  it("원점수 공식", () => {
    const w = world();
    w.stage = 9;
    w.t = 400;
    w.run.kills = 600;
    w.player.level = 22;
    w.run.evolutions = 2;
    w.run.bosses = 2;
    w.run.obstacles = 10;
    w.run.damageTaken = 3;
    const base = 600 * 3 + 400 * 2 + 22 * 40 + 2 * 300 + 8 * 200 + 2 * 800 + 10 * 8;
    expect(rawScore(w)).toBe(base);
  });

  it("무피격 보너스는 피격이 0일 때만", () => {
    const w = world();
    w.t = 100;
    const clean = rawScore(w);
    w.run.damageTaken = 1;
    expect(rawScore(w)).toBe(clean - CFG.score.noDamage);
  });

  it("메타가 서버 검증 키를 모두 갖는다", () => {
    const w = world(3);
    w.t = 120.44;
    const meta = buildMeta(w, "mobile");
    for (const key of [
      "stage", "cleared", "bosses", "duration_s", "kills", "level", "evolutions",
      "obstacles", "damage_taken", "revives_used", "theme", "build", "device", "owl_energy_found", "v",
    ]) {
      expect(meta).toHaveProperty(key);
    }
    expect(meta.duration_s).toBeCloseTo(120.4, 5);
    expect(meta.v.startsWith("3.")).toBe(true);
  });
});

/* ── 13. 화면 문구 ──────────────────────────────────────────── */

describe("엔진이 쓰는 메시지 키가 ko/en 에 모두 있다", () => {
  const dir = join(__dirname, "..", "games", "survive", "engine");
  const files = [
    ...readdirSync(dir).filter((f) => f.endsWith(".ts")).map((f) => join(dir, f)),
    ...readdirSync(join(dir, "bosses")).map((f) => join(dir, "bosses", f)),
  ];
  const keys = new Set<string>();
  for (const f of files) {
    for (const m of readFileSync(f, "utf8").matchAll(/msg\("([\w.]+)"/g)) keys.add(m[1]);
  }
  const ns = (d: unknown) => (d as { hud: { survive: Record<string, unknown> } }).hud.survive;

  it("키 목록이 비어 있지 않다", () => {
    expect(keys.size).toBeGreaterThan(40);
  });

  for (const [name, dict] of [["ko", ko], ["en", en]] as const) {
    it(`${name}`, () => {
      const missing = [...keys].filter((k) => typeof ns(dict)[k] !== "string");
      expect(missing).toEqual([]);
      // 이름 참조(@boss.* 등)도 모두 있어야 한다
      const s = ns(dict) as Record<string, Record<string, string>>;
      for (const k of ["hexa", "nona", "trideca", "chrono"]) {
        expect(s.boss[k]).toBeTruthy();
        expect(s.bossTitle[k]).toBeTruthy();
        expect(s.bossRuleText[k]).toBeTruthy();
      }
      for (const k of MOB_KINDS) expect(s.mob[k]).toBeTruthy();
      for (const k of OBSTACLE_KINDS) expect(s.obstacle[k.id]).toBeTruthy();
    });
  }
});

/* ── 14. 헤드리스 런 ────────────────────────────────────────── */

type RunReport = {
  stage: number;
  sec: number;
  kills: number;
  level: number;
  evolutions: number;
  bosses: number;
  obstacles: number;
  killsPerSec: number;
};

/** 가장 가까운 적 반대로 도망치는 단순 봇 (보스 장판·레이저도 피하려 한다) */
function botInput(run: Run): { mx: number; my: number } {
  const w = run.world;
  const p = w.player;
  let bx = 0;
  let by = 0;
  const e = w.enemies;
  for (let i = 0; i < e.cap; i++) {
    if (!e.alive[i]) continue;
    const dx = p.x - e.x[i];
    const dy = p.y - e.y[i];
    const d = Math.hypot(dx, dy);
    const reach = e.rank[i] === 3 ? 360 : 220;
    if (d > reach || d < 0.001) continue;
    const wgt = e.rank[i] === 3 ? 4 : 1;
    bx += (dx / d / d) * wgt;
    by += (dy / d / d) * wgt;
  }
  const h = w.hazards;
  for (let i = 0; i < h.cap; i++) {
    if (!h.alive[i] || h.kind[i] < HZ.warn || h.kind[i] === HZ.safe) continue;
    const dx = p.x - h.x[i];
    const dy = p.y - h.y[i];
    const d = Math.hypot(dx, dy);
    if (d > h.r[i] + 40 || d < 0.001) continue;
    bx += (dx / d) * 0.05;
    by += (dy / d) * 0.05;
  }
  // 약점·시계 — 열린 방향으로 돌아 들어간다
  if (w.boss.active && w.boss.gateOn && w.boss.idx >= 0) {
    const a = w.boss.gateA[Math.floor(w.t / 10) % w.boss.gateN];
    const tx = e.x[w.boss.idx] + Math.cos(a) * 230;
    const ty = e.y[w.boss.idx] + Math.sin(a) * 230;
    const d = Math.hypot(tx - p.x, ty - p.y) || 1;
    bx += ((tx - p.x) / d) * 0.02;
    by += ((ty - p.y) / d) * 0.02;
  }
  // 콜로세움이면 가운데로 돌아온다
  if (w.boss.active && w.boss.kind === "trideca") {
    const dx = w.boss.triArenaX - p.x;
    const dy = w.boss.triArenaY - p.y;
    const d = Math.hypot(dx, dy);
    const doom = w.boss.triDoomWarn > 0;
    if (doom) { bx -= dx * 0.01; by -= dy * 0.01; } else if (d > w.boss.triArenaR * 0.6) { bx += dx * 0.0008; by += dy * 0.0008; }
  }
  const len = Math.hypot(bx, by);
  if (len < 1e-9) return { mx: Math.cos(w.t * 0.3), my: Math.sin(w.t * 0.3) };
  return { mx: bx / len, my: by / len };
}

function simulate(seed: number, maxSec = Number(process.env.SIM_SEC ?? 600)): RunReport {
  const run = createRun(seed, "dark", true);
  let guard = 0;
  while (!run.world.over && guard < 60 * maxSec) {
    guard++;
    if (run.cards.length > 0) {
      // 아무거나 고르면 빌드가 망해서 밸런스 측정이 안 된다 — 진화 > 신규 액티브 > 나머지
      const order = ["evolution", "new-active", "up-active", "new-passive", "up-passive"];
      let best = 0;
      for (let i = 1; i < run.cards.length; i++) {
        if (order.indexOf(run.cards[i].kind) < order.indexOf(run.cards[best].kind)) best = i;
      }
      chooseCard(run, best);
      continue;
    }
    update(run, DT, run.world.freeze > 0 ? { mx: 0, my: 0 } : botInput(run));
  }
  const w = run.world;
  return {
    stage: w.stage,
    sec: Math.round(w.t),
    kills: w.run.kills,
    level: w.player.level,
    evolutions: w.run.evolutions,
    bosses: w.run.bosses,
    obstacles: w.run.obstacles,
    killsPerSec: w.run.kills / Math.max(1, w.t),
  };
}

const SIM_RUNS = Number(process.env.SIM_RUNS ?? 4);

describe("헤드리스 런", () => {
  const reports: RunReport[] = [];
  for (let i = 0; i < SIM_RUNS; i++) reports.push(simulate(9000 + i * 37));

  it("리포트", () => {
    console.log("[survive-v3]", JSON.stringify(reports));
    expect(reports.length).toBe(SIM_RUNS);
  });

  it("예외·NaN 없이 끝난다", () => {
    for (const r of reports) {
      expect(Number.isFinite(r.kills)).toBe(true);
      expect(r.sec).toBeGreaterThan(0);
      expect(r.level).toBeGreaterThanOrEqual(1);
    }
  });

  it("서버 거부선(초당 8킬 · 레벨 60 · 진화 12)을 넘지 않는다", () => {
    for (const r of reports) {
      expect(r.killsPerSec).toBeLessThanOrEqual(8);
      expect(r.level).toBeLessThanOrEqual(CFG.xp.maxLevel);
      expect(r.evolutions).toBeLessThanOrEqual(12);
    }
  });

  it("도달 단계와 잡은 보스 수가 서버 규칙과 맞는다", () => {
    for (const r of reports) {
      expect(r.bosses).toBe(bossesBefore(r.stage));
      // 단계는 30초보다 빨리 오르지 않는다 (서버 min_sec_per_stage 15 보다 넉넉히)
      expect(r.sec).toBeGreaterThanOrEqual((r.stage - 1) * 15);
    }
  });

  it("밸런스: 단순 봇도 첫 몇 단계는 넘긴다", () => {
    expect(reports.some((r) => r.stage >= 4)).toBe(true);
  });
});

/* ── 15. 시작 카운트다운 · 부엉이 방향 ──────────────────────── */

describe("시작 3·2·1 과 부엉이 연출", () => {
  it("카운트다운 동안은 월드가 멈추고, 초마다 틱 → 끝나면 GO 신호", () => {
    const run = createRun(3, "dark", true, CFG.run.countdownSec);
    const w = run.world;
    expect(w.cues & CUE.tick).toBeTruthy();
    w.cues = 0;
    let ticks = 0;
    let go = 0;
    for (let i = 0; i < 60 * (CFG.run.countdownSec - 0.1); i++) {
      update(run, DT, { mx: 1, my: 0 });
      if (w.cues & CUE.tick) ticks++;
      if (w.cues & CUE.go) go++;
      w.cues = 0;
    }
    expect(w.t).toBe(0);
    expect(w.player.x).toBe(0);
    expect(ticks).toBe(CFG.run.countdownSec - 1);
    for (let i = 0; i < 30; i++) {
      update(run, DT, { mx: 1, my: 0 });
      if (w.cues & CUE.go) go++;
      w.cues = 0;
    }
    expect(go).toBe(1);
    expect(w.t).toBeGreaterThan(0);
    expect(w.player.x).toBeGreaterThan(0);
  });

  it("옆으로 가면 옆모습, 위로 가면 뒷모습, 아래로 가면 앞모습", () => {
    const run = createRun(4, "dark", true);
    const w = run.world;
    w.player.invuln = 999;
    const faceAfter = (mx: number, my: number) => {
      for (let i = 0; i < 5; i++) update(run, DT, { mx, my });
      return w.player.face;
    };
    expect(faceAfter(-1, 0)).toBe(2);
    expect(faceAfter(1, 0)).toBe(3);
    expect(faceAfter(0, -1)).toBe(1);
    expect(faceAfter(0, 1)).toBe(0);
    expect(w.player.moving).toBe(true);
    // 옆으로 가다 멈추면 잠깐은 옆을 보다가 정면으로
    faceAfter(1, 0);
    faceAfter(0, 0);
    expect(w.player.face).toBe(3);
    for (let i = 0; i < 60; i++) update(run, DT, { mx: 0, my: 0 });
    expect(w.player.face).toBe(0);
    expect(w.player.moving).toBe(false);
  });

  it("맞으면 피격 연출, 레벨업하면 레벨업 연출, 보스가 오면 놀란다", () => {
    const w = worldAt(5);
    hurtPlayer(w, 5);
    expect(w.player.hitT).toBeGreaterThan(0);
    spawnBoss(w, "hexa");
    expect(w.player.emote).toBe(3);
    expect(w.player.emoteT).toBeGreaterThan(0);
  });

  it("스킬 이펙트와 적 파괴 연출이 풀 상한을 넘지 않는다", () => {
    const w = world(77);
    for (let k = 0; k < 400; k++) {
      const j = spawnEnemy(w, "tri", w.player.x + 100 + (k % 50), w.player.y);
      if (j >= 0) killEnemy(w, j);
    }
    let n = 0;
    for (let i = 0; i < w.fx.cap; i++) if (w.fx.alive[i]) n++;
    expect(n).toBeLessThanOrEqual(CFG.perf.maxFx);
  });
});

/* ── 효과음 신호 ─────────────────────────────────────────────── */

describe("효과음 신호 (CUE → games/survive/audio.ts)", () => {
  it("봇이 한동안 놀면 쏘기·처치·경험치·레벨업 소리가 난다", () => {
    const run = createRun(11, "dark", true);
    const w = run.world;
    w.player.invuln = 999;
    let seen = 0;
    for (let f = 0; f < 60 * 40; f++) {
      if (run.cards.length > 0) chooseCard(run, 0);
      update(run, DT, botInput(run));
      seen |= w.cues;
      w.cues = 0;
    }
    for (const bit of [CUE.shot, CUE.kill, CUE.pickup, CUE.level]) expect(seen & bit).toBeTruthy();
  });

  it("맞으면 피격음, 죽으면 사망음", () => {
    const run = createRun(12, "dark", true);
    const w = run.world;
    w.cues = 0;
    hurtPlayer(w, 5);
    expect(w.cues & CUE.hit).toBeTruthy();
    w.player.iframe = 0;
    hurtPlayer(w, 99999);
    expect(w.cues & CUE.death).toBeTruthy();
  });

  it("모든 CUE 비트에 소리가 붙어 있고, 효과음 파일이 실제로 있다", async () => {
    const { SOUNDS } = await import("@/games/survive/audio");
    const src = readFileSync(join(process.cwd(), "games/survive/audio.ts"), "utf8");
    for (const key of Object.keys(CUE)) expect(src).toContain(`[CUE.${key},`);
    for (const def of Object.values(SOUNDS)) {
      for (const f of def.files) expect(readdirSync(join(process.cwd(), "public", f, ".."))).toContain(f.split("/").pop());
    }
  });
});
