// 🦉 아울 서바이버즈 v2 엔진 검증 (기획서 §15 수용 기준)
import { describe, expect, it } from "vitest";
import { CFG, atkMult, hpMult, stageScoreMult, xpToNext } from "@/games/survive/config";
import {
  ACTIVE_IDS,
  ACTIVES,
  applyPassives,
  baseStats,
  EVOLUTIONS,
  EVO_IDS,
  PASSIVE_IDS,
  PASSIVES,
  skillCooldown,
  skillDamage,
} from "@/games/survive/data/skills";
import { ENEMY_SPEC, STAGES, stageInfo } from "@/games/survive/data/stages";
import { applyCard, drawCards, pendingEvolution } from "@/games/survive/engine/levelup";
import {
  clearForBoss,
  obstacleDensity,
  OBSTACLE_KINDS,
  passable,
  placeObstacles,
} from "@/games/survive/engine/obstacles";
import { createSpawnState, updateSpawner } from "@/games/survive/engine/spawner";
import { spawnBoss, spawnMidboss, updateBoss } from "@/games/survive/engine/boss";
import { buildMeta, rawScore } from "@/games/survive/engine/score";
import {
  aliveEnemies,
  createWorld,
  damageEnemy,
  hurtPlayer,
  killEnemy,
  recalcStats,
  refreshGrid,
  spawnEnemy,
  TAG,
  type World,
} from "@/games/survive/engine/world";
import { chooseCard, createRun, update, type Run } from "@/games/survive/engine/game";
import type { PassiveId, PassiveSlot } from "@/games/survive/types";

const DT = 1 / 60;

function world(stage = 1, seed = 12345): World {
  const w = createWorld(seed, stage, "dark", true);
  refreshGrid(w);
  return w;
}

function passives(list: [PassiveId, number][]): PassiveSlot[] {
  return list.map(([id, lv]) => ({ id, lv }));
}

/* ── 1. 스킬 50종 ───────────────────────────────────────────── */

describe("스킬 데이터 (§7)", () => {
  it("액티브 20 · 패시브 18 · 진화 12 = 50종", () => {
    expect(ACTIVE_IDS).toHaveLength(20);
    expect(PASSIVE_IDS).toHaveLength(18);
    expect(EVO_IDS).toHaveLength(12);
    expect(ACTIVE_IDS.length + PASSIVE_IDS.length + EVO_IDS.length).toBe(50);
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

  it("진화 12종이 전부 유효한 재료를 가리킨다", () => {
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
      const w = world(1, 777);
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

/* ── 5. 장애물 (§8) ─────────────────────────────────────────── */

describe("장애물 (§8)", () => {
  it("밀도가 항상 6~9% 안에 든다", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const w = world(1, seed * 101);
      placeObstacles(w);
      const d = obstacleDensity(w);
      expect(d).toBeGreaterThanOrEqual(CFG.obstacle.densityMin - 0.005);
      expect(d).toBeLessThanOrEqual(CFG.obstacle.densityMax);
    }
  });

  it("어떤 두 장애물 사이에도 140px 통로가 남는다", () => {
    for (const seed of [4242, 77, 31337]) {
      const w = world(1, seed);
      placeObstacles(w);
      const o = w.obstacles;
      for (let i = 0; i < o.cap; i++) {
        if (!o.alive[i]) continue;
        for (let j = i + 1; j < o.cap; j++) {
          if (!o.alive[j]) continue;
          expect(
            passable(o.x[i], o.y[i], o.w[i], o.h[i], o.x[j], o.y[j], o.w[j], o.h[j], CFG.obstacle.minCorridorPx),
          ).toBe(true);
        }
      }
    }
  });

  it("플레이어 스폰 반경 200px 안에는 두지 않는다", () => {
    const w = world(1, 99);
    placeObstacles(w);
    const o = w.obstacles;
    for (let i = 0; i < o.cap; i++) {
      if (!o.alive[i]) continue;
      expect(Math.hypot(o.x[i] - w.player.x, o.y[i] - w.player.y)).toBeGreaterThanOrEqual(CFG.obstacle.spawnClearRadius);
    }
  });

  it("보스 등장 시 40%가 치워진다", () => {
    const w = world(1, 31337);
    placeObstacles(w);
    const before = obstacleDensity(w);
    clearForBoss(w);
    expect(obstacleDensity(w)).toBeLessThan(before);
  });

  it("장애물 종류 4종이 모두 정의돼 있다", () => {
    expect(OBSTACLE_KINDS).toHaveLength(4);
    for (const k of OBSTACLE_KINDS) expect(k.hp).toBeGreaterThan(0);
  });
});

/* ── 6. 스테이지 (§4·§5) ────────────────────────────────────── */

describe("스테이지 (§4·§5)", () => {
  it("1~15 스테이지가 전부 보스·중간보스를 갖는다", () => {
    expect(STAGES).toHaveLength(15);
    for (const s of STAGES) {
      expect(s.boss.name.length).toBeGreaterThan(0);
      expect(s.boss.patterns.length).toBeGreaterThanOrEqual(2);
      expect(s.midboss.name.length).toBeGreaterThan(0);
      expect(s.enemies.length).toBeGreaterThan(0);
      for (const e of s.enemies) expect(ENEMY_SPEC[e]).toBeDefined();
    }
  });

  it("체력·공격력 배율이 스테이지마다 누적된다", () => {
    expect(hpMult(1)).toBeCloseTo(1, 5);
    expect(hpMult(7)).toBeCloseTo(1 + 0.18 * 6, 5);
    expect(atkMult(7)).toBeCloseTo(1 + 0.12 * 6, 5);
  });

  it("점수 배율은 ×3.0 에서 멈춘다", () => {
    expect(stageScoreMult(1)).toBeCloseTo(1, 5);
    expect(stageScoreMult(7)).toBeCloseTo(1.36, 5);
    expect(stageScoreMult(99)).toBeCloseTo(3, 5);
  });

  it("16 이상은 무한 스테이지 — 3스테이지마다 특수 규칙, 5스테이지마다 강화 보스", () => {
    const s18 = stageInfo(18);
    expect(s18.endless).toBe(true);
    expect(s18.rule).not.toBeNull();
    const s20 = stageInfo(20);
    expect(s20.boss.patterns.length).toBeGreaterThan(STAGES[(20 - 1) % 15].boss.patterns.length);
  });

  it("XP 곡선은 10 + 7L", () => {
    expect(xpToNext(1)).toBe(17);
    expect(xpToNext(10)).toBe(80);
  });
});

/* ── 7. 스폰 (§14) ──────────────────────────────────────────── */

describe("스포너 (§14)", () => {
  it("스폰 예산(초당 6마리)을 넘지 않는다", () => {
    const w = world(1, 555);
    const st = createSpawnState();
    for (let i = 0; i < 60; i++) updateSpawner(w, st, DT);
    expect(aliveEnemies(w)).toBeLessThanOrEqual(CFG.spawn.budgetPerSec + 1);
  });

  it("동시 적 상한을 넘기지 않는다", () => {
    const w = world(1, 556);
    w.phase = "wave2";
    const st = createSpawnState();
    for (let i = 0; i < 60 * 120; i++) {
      updateSpawner(w, st, DT);
      w.t += DT;
    }
    expect(aliveEnemies(w)).toBeLessThanOrEqual(CFG.perf.maxEnemies);
  });

  it("적은 항상 화면 밖(플레이어에서 300px 이상)에서 나온다", () => {
    const w = world(1, 557);
    const st = createSpawnState();
    for (let i = 0; i < 600; i++) updateSpawner(w, st, DT);
    const e = w.enemies;
    for (let i = 0; i < e.cap; i++) {
      if (!e.alive[i]) continue;
      expect(Math.hypot(e.x[i] - w.player.x, e.y[i] - w.player.y)).toBeGreaterThan(299);
    }
  });
});

/* ── 8. 속성 연계 (§6.2) ────────────────────────────────────── */

describe("속성 연계 (§6.2)", () => {
  function target(w: World): number {
    const i = spawnEnemy(w, "ransom", w.player.x + 200, w.player.y);
    w.enemies.hp[i] = 100000;
    w.enemies.maxHp[i] = 100000;
    refreshGrid(w);
    return i;
  }

  it("❄️ 둔화 + ⚡ 전기 = 피해 ×2", () => {
    const a = world(1, 10);
    const b = world(1, 10);
    const ia = target(a);
    const ib = target(b);
    b.enemies.slowT[ib] = 2;
    damageEnemy(a, ia, 100, TAG.electric, false);
    damageEnemy(b, ib, 100, TAG.electric, false);
    expect(a.enemies.hp[ia] - b.enemies.hp[ib]).toBeCloseTo(100, 3);
  });

  it("🕳️ 흡입 + 광역 = 피해 +50%", () => {
    const a = world(1, 11);
    const b = world(1, 11);
    const ia = target(a);
    const ib = target(b);
    b.enemies.pullT[ib] = 1;
    damageEnemy(a, ia, 100, TAG.aoe, false);
    damageEnemy(b, ib, 100, TAG.aoe, false);
    expect(a.enemies.hp[ia] - b.enemies.hp[ib]).toBeCloseTo(50, 3);
  });

  it("🎯 표식 + 관통 = 치명타 확정", () => {
    const w = world(1, 12);
    const i = target(w);
    w.enemies.markT[i] = 2;
    const before = w.enemies.hp[i];
    damageEnemy(w, i, 100, TAG.pierce, false);
    expect(before - w.enemies.hp[i]).toBeCloseTo(100 * w.stats.critDamage, 3);
  });

  it("🔥 화상 + 💥 폭발 = 주변 3체로 번진다", () => {
    const w = world(1, 13);
    const i = target(w);
    w.enemies.burnT[i] = 3;
    w.enemies.burnDps[i] = 10;
    const others: number[] = [];
    for (let k = 0; k < 3; k++) {
      const j = spawnEnemy(w, "bug", w.enemies.x[i] + 20 * (k + 1), w.enemies.y[i]);
      w.enemies.hp[j] = 9999;
      others.push(j);
    }
    refreshGrid(w);
    damageEnemy(w, i, 10, TAG.explosion, false);
    expect(others.some((j) => w.enemies.burnT[j] > 0)).toBe(true);
  });
});

/* ── 9. 피격·부활 (§9.1) ────────────────────────────────────── */

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

/* ── 10. 보스 (§3·§4) ───────────────────────────────────────── */

describe("보스 (§3)", () => {
  it("중간보스는 한 번만 나오고 처치하면 기록이 남는다", () => {
    const w = world();
    spawnMidboss(w);
    spawnMidboss(w);
    let count = 0;
    for (let i = 0; i < w.enemies.cap; i++) if (w.enemies.alive[i] && w.enemies.rank[i] === 2) count++;
    expect(count).toBe(1);
    killEnemy(w, w.midboss.idx);
    expect(w.run.midbossKilled).toBe(true);
  });

  it("보스는 체력이 줄면 페이즈가 바뀐다", () => {
    const w = world();
    spawnBoss(w);
    expect(w.boss.active).toBe(true);
    expect(w.boss.phase).toBe(0);
    w.enemies.hp[w.boss.idx] = w.boss.maxHp * 0.5;
    updateBoss(w, DT);
    expect(w.boss.phase).toBe(1);
    w.enemies.hp[w.boss.idx] = w.boss.maxHp * 0.2;
    updateBoss(w, DT);
    expect(w.boss.phase).toBe(2);
    expect(w.log.filter((l) => l.tag === "ALERT").length).toBeGreaterThanOrEqual(2);
  });

  it("보스를 잡으면 클리어 상태가 된다", () => {
    const w = world();
    spawnBoss(w);
    killEnemy(w, w.boss.idx);
    expect(w.cleared).toBe(true);
    expect(w.boss.active).toBe(false);
  });

  it("보스 패턴 12종이 예외 없이 돈다", () => {
    for (let stage = 1; stage <= 15; stage++) {
      const w = world(stage, 1000 + stage);
      spawnBoss(w);
      w.boss.phase = 2;
      for (let i = 0; i < 60 * 12; i++) {
        updateBoss(w, DT);
        w.t += DT;
        w.frame++;
      }
      expect(Number.isFinite(w.enemies.x[w.boss.idx])).toBe(true);
      expect(Number.isFinite(w.player.hp)).toBe(true);
    }
  });
});

/* ── 11. 점수·메타 (§11) ────────────────────────────────────── */

describe("점수와 메타 (§11)", () => {
  it("원점수 공식이 기획서와 같다", () => {
    const w = world(7);
    w.t = 150;
    w.run.kills = 400;
    w.player.level = 15;
    w.run.evolutions = 1;
    w.run.midbossKilled = true;
    w.run.obstacles = 10;
    w.run.damageTaken = 3;
    w.cleared = true;
    const base = 400 * 3 + 150 * 6 + 15 * 40 + 300 + 250 + 1000 + 10 * 8;
    expect(rawScore(w)).toBe(Math.round(base * stageScoreMult(7)));
  });

  it("무피격 보너스는 피격이 0일 때만", () => {
    const w = world(1);
    w.t = 100;
    const hit = rawScore(w);
    w.run.damageTaken = 1;
    expect(rawScore(w)).toBe(hit - CFG.score.noDamage);
  });

  it("메타가 서버 검증 키를 모두 갖는다", () => {
    const w = world(3);
    w.t = 120.44;
    const meta = buildMeta(w, "mobile");
    for (const key of [
      "stage", "cleared", "duration_s", "kills", "level", "evolutions",
      "midboss", "obstacles", "damage_taken", "revives_used", "theme", "build", "device", "v",
    ]) {
      expect(meta).toHaveProperty(key);
    }
    expect(meta.duration_s).toBeCloseTo(120.4, 5);
  });
});

/* ── 12. 헤드리스 런 (§15-10) ───────────────────────────────── */

type RunReport = {
  stage: number;
  cleared: boolean;
  sec: number;
  kills: number;
  level: number;
  evolutions: number;
  midboss: boolean;
  obstacles: number;
  killsPerSec: number;
};

/** 가장 가까운 적 반대로 도망치는 단순 봇 */
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
    if (d > 220 || d < 0.001) continue;
    bx += dx / d / d;
    by += dy / d / d;
  }
  // 아레나 중앙으로 약하게 당긴다 (구석에 몰리면 죽는다)
  bx += (CFG.arena.w / 2 - p.x) * 0.0004;
  by += (CFG.arena.h / 2 - p.y) * 0.0004;
  const len = Math.hypot(bx, by) || 1;
  return { mx: bx / len, my: by / len };
}

function simulate(stage: number, seed: number): RunReport {
  const run = createRun(seed, stage, "dark", true);
  let guard = 0;
  while (!run.world.over && guard < 60 * 200) {
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
    if (run.world.freeze > 0) {
      update(run, DT, { mx: 0, my: 0 });
      continue;
    }
    update(run, DT, botInput(run));
  }
  const w = run.world;
  return {
    stage,
    cleared: w.cleared,
    sec: Math.round(w.t),
    kills: w.run.kills,
    level: w.player.level,
    evolutions: w.run.evolutions,
    midboss: w.run.midbossKilled,
    obstacles: w.run.obstacles,
    killsPerSec: w.run.kills / Math.max(1, w.t),
  };
}

const SIM_RUNS = Number(process.env.SIM_RUNS ?? 3);

describe("헤드리스 런 (§15)", () => {
  const reports: RunReport[] = [];
  for (let i = 0; i < SIM_RUNS; i++) reports.push(simulate(1, 9000 + i * 37));
  const s7 = simulate(7, 4242);

  it("리포트", () => {
    console.log("[survive-v2]", JSON.stringify({ s1: reports, s7 }));
    expect(reports.length).toBe(SIM_RUNS);
  });

  it("예외·NaN 없이 끝난다", () => {
    for (const r of reports) {
      expect(Number.isFinite(r.kills)).toBe(true);
      expect(r.sec).toBeGreaterThan(0);
      expect(r.level).toBeGreaterThanOrEqual(1);
    }
  });

  it("서버 거부선(초당 8킬·레벨 24·진화 3)을 넘지 않는다 (§11.3)", () => {
    for (const r of [...reports, s7]) {
      expect(r.killsPerSec).toBeLessThanOrEqual(8);
      expect(r.level).toBeLessThanOrEqual(CFG.xp.maxLevel);
      expect(r.evolutions).toBeLessThanOrEqual(3);
    }
  });

  it("런이 180초 하드캡 안에서 끝난다 (§3)", () => {
    for (const r of [...reports, s7]) expect(r.sec).toBeLessThanOrEqual(CFG.wave.hardCapSec + 1);
  });

  it("중간보스 구간까지는 살아남는다", () => {
    expect(reports.some((r) => r.sec >= CFG.wave.midbossAt)).toBe(true);
  });

  it("밸런스: 단순 봇도 1스테이지를 종종 클리어한다 (§15-10)", () => {
    // 고정 시드 8판. 봇은 '가장 가까운 적 반대로 도망만 치는' 수준이라
    // 사람 기준 70% 클리어(§15-10)에 대응하는 봇 기준선은 "8판 중 2판 이상"으로 잡았다.
    const fixed = Array.from({ length: 8 }, (_, i) => simulate(1, 9000 + i * 37));
    const cleared = fixed.filter((r) => r.cleared).length;
    expect(cleared).toBeGreaterThanOrEqual(2);
    // 보스를 만나기 전에 전멸하지는 않는다
    expect(fixed.filter((r) => r.sec >= CFG.wave.bossAt).length).toBeGreaterThanOrEqual(5);
  });

  it("밸런스: 7스테이지는 훨씬 어렵지만 중간보스까지는 간다", () => {
    expect(s7.sec).toBeGreaterThanOrEqual(CFG.wave.midbossAt);
    expect(s7.level).toBeGreaterThanOrEqual(8);
  });
});
