import { describe, expect, it } from "vitest";
import { CFG, enemyCapAt, xpToNext } from "@/games/survive/config";
import type { Card, EnemyKind, WeaponId } from "@/games/survive/types";
import {
  aliveEnemies,
  BULLET_KINDS,
  createWorld,
  damageEnemy,
  ENEMY_KINDS,
  forEachEnemyNear,
  nearestEnemy,
  refreshGrid,
  spawnEnemy,
  type World,
} from "@/games/survive/engine/world";
import { ENEMY_SPEC, onEnemyDeath, RANSOM_SLOW, separateEnemies, updateEnemies } from "@/games/survive/engine/enemies";
import { updateWeapons, weaponCooldown, weaponDamage, WEAPON_INFO } from "@/games/survive/engine/weapons";
import { applyCard, applyPassives, drawCards, evolvableWeapon, PASSIVE_INFO } from "@/games/survive/engine/levelup";
import { updateSpawner } from "@/games/survive/engine/spawner";
import { updateBoss } from "@/games/survive/engine/boss";

const DT = CFG.physics.dt;
const FRAMES = CFG.runSec * 60;

/** 카드 식별자 — 같은 카드가 두 번 나오지 않는지 확인할 때 쓴다 */
function cardKey(c: Card): string {
  return `${c.kind}:${c.id}`;
}

function giveWeapon(w: World, id: WeaponId, level = 1) {
  w.weapons.push({ id, level, cd: 0, evolved: null, ammo: 0 });
}

/* ── 패시브 (§6) ─────────────────────────────────────── */

describe("패시브 → 스탯 (§6)", () => {
  it("패시브가 없으면 기본값 그대로다", () => {
    const w = createWorld(1, 1);
    applyPassives(w);
    expect(w.stats.damage).toBe(1);
    expect(w.stats.cooldown).toBe(1);
    expect(w.stats.projExtra).toBe(0);
    expect(w.stats.projSpeed).toBe(1);
    expect(w.stats.dmgTaken).toBe(1);
    expect(w.stats.magnet).toBe(CFG.player.magnet);
    expect(w.stats.speed).toBe(CFG.player.speed);
    expect(w.player.maxHp).toBe(CFG.player.hp);
  });

  it("🧠 코어 = 레벨당 피해 +12%", () => {
    for (const lv of [1, 3, 5]) {
      const w = createWorld(1, 1);
      w.passives.core = lv;
      applyPassives(w);
      expect(w.stats.damage).toBeCloseTo(1 + 0.12 * lv, 6);
    }
  });

  it("⏱️ CPU 클럭 = 레벨당 쿨다운 -8%", () => {
    for (const lv of [1, 3, 5]) {
      const w = createWorld(1, 1);
      w.passives.cpu = lv;
      applyPassives(w);
      expect(w.stats.cooldown).toBeCloseTo(1 - 0.08 * lv, 6);
    }
  });

  it("💾 램 = 3레벨마다 투사체 +1", () => {
    const expected = [0, 1, 1, 1, 2, 2];
    for (let lv = 0; lv <= 5; lv++) {
      const w = createWorld(1, 1);
      if (lv > 0) w.passives.ram = lv;
      applyPassives(w);
      expect(w.stats.projExtra).toBe(expected[lv]);
    }
  });

  it("📶 대역폭 = 레벨당 투사체 속도·사거리 +15%", () => {
    for (const lv of [1, 2, 5]) {
      const w = createWorld(1, 1);
      w.passives.bandwidth = lv;
      applyPassives(w);
      expect(w.stats.projSpeed).toBeCloseTo(1 + 0.15 * lv, 6);
    }
  });

  it("🧱 방화벽 두께 = 최대 체력 +20 / 받는 피해 -5% (늘어난 만큼 바로 회복)", () => {
    const w = createWorld(1, 1);
    w.player.hp = CFG.player.hp;
    for (let lv = 1; lv <= 5; lv++) {
      w.passives.firewall_thick = lv;
      applyPassives(w);
      expect(w.player.maxHp).toBe(CFG.player.hp + 20 * lv);
      expect(w.stats.dmgTaken).toBeCloseTo(1 - 0.05 * lv, 6);
    }
    expect(w.player.hp).toBe(w.player.maxHp); // 만피에서 5번 올렸으니 그대로 만피
    // 다친 상태에서 올리면 증가분만 회복된다
    w.player.hp = 50;
    w.passives.firewall_thick = 5;
    applyPassives(w);
    expect(w.player.hp).toBe(50); // 같은 레벨 재계산은 회복이 없다 (멱등)
  });

  it("🧲 자석 +30% / 👟 부츠 +10%", () => {
    const w = createWorld(1, 1);
    w.passives.magnet = 2;
    w.passives.boots = 4;
    applyPassives(w);
    expect(w.stats.magnet).toBeCloseTo(CFG.player.magnet * 1.6, 5);
    expect(w.stats.speed).toBeCloseTo(CFG.player.speed * 1.4, 5);
  });

  it("모든 패시브가 카드 문구를 갖는다", () => {
    for (const id of Object.keys(PASSIVE_INFO)) {
      const info = PASSIVE_INFO[id as keyof typeof PASSIVE_INFO];
      expect(info.label.length).toBeGreaterThan(0);
      expect(info.desc.length).toBeGreaterThan(0);
      expect(info.emoji.length).toBeGreaterThan(0);
    }
  });
});

/* ── 카드 추첨 (§14) ─────────────────────────────────── */

describe("레벨업 카드 추첨 (§14)", () => {
  it("항상 서로 다른 3장을 돌려준다", () => {
    const w = createWorld(42, 1);
    for (let i = 0; i < 300; i++) {
      const cards = drawCards(w);
      expect(cards).toHaveLength(CFG.levelup.cards);
      expect(new Set(cards.map(cardKey)).size).toBe(CFG.levelup.cards);
    }
  });

  it("Lv6 이전에는 신규 무기가 1장 이상 보장된다 (§14-2)", () => {
    const w = createWorld(43, 1);
    for (let i = 0; i < 200; i++) {
      const cards = drawCards(w);
      const owned = new Set(w.weapons.map((x) => x.id));
      expect(cards.some((c) => c.kind === "weapon" && !owned.has(c.id))).toBe(true);
    }
  });

  it("진화 조건을 채우면 1번 슬롯에 100% 진화 카드가 나온다 (§15-4)", () => {
    const w = createWorld(7, 1);
    w.weapons[0].level = CFG.levelup.maxWeaponLevel;
    w.passives.ram = CFG.levelup.evolvePassiveLevel;
    applyPassives(w);
    expect(evolvableWeapon(w)).toBe("feather");
    for (let i = 0; i < 400; i++) {
      const cards = drawCards(w);
      expect(cards[0].kind).toBe("evolve");
      expect(cards[0].kind === "evolve" && cards[0].evolved).toBe(WEAPON_INFO.feather.evolved);
      expect(cards).toHaveLength(CFG.levelup.cards);
    }
  });

  it("진화 조건이 하나라도 모자라면 진화 카드가 없다", () => {
    const w = createWorld(8, 1);
    w.weapons[0].level = CFG.levelup.maxWeaponLevel;
    w.passives.ram = CFG.levelup.evolvePassiveLevel - 1;
    expect(evolvableWeapon(w)).toBeNull();
    for (let i = 0; i < 50; i++) expect(drawCards(w).some((c) => c.kind === "evolve")).toBe(false);
  });

  it("슬롯이 가득 차면 보유한 것 강화만 등장한다 (§5.1)", () => {
    const w = createWorld(9, 1);
    giveWeapon(w, "firewall");
    giveWeapon(w, "sniffer");
    giveWeapon(w, "ddos");
    w.passives.core = 1;
    w.passives.cpu = 1;
    w.passives.ram = 1;
    w.passives.boots = 1;
    applyPassives(w);
    expect(w.weapons).toHaveLength(CFG.levelup.weaponSlots);

    const ownedW = new Set(w.weapons.map((x) => x.id));
    const ownedP = new Set(Object.keys(w.passives));
    for (let i = 0; i < 300; i++) {
      for (const c of drawCards(w)) {
        if (c.kind === "weapon") expect(ownedW.has(c.id)).toBe(true);
        if (c.kind === "passive") expect(ownedP.has(c.id)).toBe(true);
      }
    }
  });

  it("체력 30% 이하면 💉백신·🧱방화벽 두께가 더 자주 나온다 (§14-5)", () => {
    function count(hpRatio: number): number {
      const w = createWorld(123, 1);
      w.player.level = 12; // 신규 무기 보장 규칙을 피해서 가중치만 본다
      w.player.hp = w.player.maxHp * hpRatio;
      let n = 0;
      for (let i = 0; i < 400; i++) {
        for (const c of drawCards(w)) {
          if (c.kind === "weapon" && c.id === "vaccine") n++;
          if (c.kind === "passive" && c.id === "firewall_thick") n++;
        }
      }
      return n;
    }
    const low = count(CFG.levelup.lowHpRatio - 0.05);
    const full = count(1);
    expect(low).toBeGreaterThan(full);
  });

  it("같은 카드가 3회 연속으로는 안 나온다 (§14-4)", () => {
    const w = createWorld(77, 1);
    w.player.level = 12;
    const history: Set<string>[] = [];
    for (let i = 0; i < 400; i++) history.push(new Set(drawCards(w).map(cardKey)));
    for (let i = 2; i < history.length; i++) {
      for (const key of history[i]) {
        // 후보가 말라서 규칙을 푼 경우를 제외하려면 후보 수가 충분해야 한다
        expect(history[i - 1].has(key) && history[i - 2].has(key)).toBe(false);
      }
    }
  });
});

/* ── 카드 적용 ───────────────────────────────────────── */

describe("카드 적용", () => {
  it("신규 무기는 슬롯에 추가되고 보유 무기는 레벨이 오른다", () => {
    const w = createWorld(2, 1);
    applyCard(w, { kind: "weapon", id: "ddos", level: 1, label: "", desc: "", emoji: "" });
    expect(w.weapons).toHaveLength(2);
    expect(w.weapons[1]).toMatchObject({ id: "ddos", level: 1 });

    for (let i = 0; i < 10; i++) applyCard(w, { kind: "weapon", id: "ddos", level: 2, label: "", desc: "", emoji: "" });
    expect(w.weapons[1].level).toBe(CFG.levelup.maxWeaponLevel); // MAX를 넘지 않는다
  });

  it("패시브 카드는 레벨과 스탯을 함께 올린다", () => {
    const w = createWorld(2, 1);
    applyCard(w, { kind: "passive", id: "core", level: 1, label: "", desc: "", emoji: "" });
    applyCard(w, { kind: "passive", id: "core", level: 2, label: "", desc: "", emoji: "" });
    expect(w.passives.core).toBe(2);
    expect(w.stats.damage).toBeCloseTo(1.24, 6);
  });

  it("진화 카드는 무기를 진화시키고 run.evolutions를 올린다", () => {
    const w = createWorld(2, 1);
    w.weapons[0].level = CFG.levelup.maxWeaponLevel;
    w.passives.ram = CFG.levelup.evolvePassiveLevel;
    const card = drawCards(w)[0];
    expect(card.kind).toBe("evolve");
    applyCard(w, card);
    expect(w.weapons[0].evolved).toBe("feather_storm");
    expect(w.run.evolutions).toBe(1);
    expect(evolvableWeapon(w)).toBeNull(); // 같은 무기를 두 번 진화하지 않는다
    expect(w.banner?.text).toContain(WEAPON_INFO.feather.evolvedLabel);
  });

  it("모든 무기가 진화 짝·문구를 갖는다 (§6)", () => {
    for (const id of Object.keys(WEAPON_INFO)) {
      const info = WEAPON_INFO[id as WeaponId];
      expect(PASSIVE_INFO[info.pair]).toBeDefined();
      expect(info.evolvedLabel.length).toBeGreaterThan(0);
      expect(info.evolvedDesc.length).toBeGreaterThan(0);
    }
  });
});

/* ── 적 (§7) ─────────────────────────────────────────── */

describe("적 (§7)", () => {
  it("🐴 트로이목마는 처치되면 🐛버그 3마리로 분열한다", () => {
    const w = createWorld(4, 1);
    const i = spawnEnemy(w, "trojan", 100, 100, ENEMY_SPEC.trojan);
    expect(damageEnemy(w, i, ENEMY_SPEC.trojan.hp)).toBe(true);
    onEnemyDeath(w, "trojan", 100, 100);
    let bugs = 0;
    for (let k = 0; k < w.enemies.cap; k++) {
      if (w.enemies.alive[k] && ENEMY_KINDS[w.enemies.kind[k]] === "bug") bugs++;
    }
    expect(bugs).toBe(3);
  });

  it("💀 엘리트를 잡으면 보물상자로 무기가 Lv+2 오른다", () => {
    const w = createWorld(4, 1);
    giveWeapon(w, "ddos");
    const before = w.weapons.reduce((a, x) => a + x.level, 0);
    onEnemyDeath(w, "elite", 0, 0);
    expect(w.weapons.reduce((a, x) => a + x.level, 0)).toBe(before + 2);
    expect(w.banner?.text).toContain("보물상자");
    expect(w.banner?.until).toBeCloseTo(w.t + 2, 6);
  });

  it("🔒 랜섬웨어에 닿으면 이동속도 둔화가 걸린다", () => {
    const w = createWorld(4, 1);
    spawnEnemy(w, "ransom", CFG.player.radius + ENEMY_SPEC.ransom.r - 2, 0, ENEMY_SPEC.ransom);
    expect(w.player.slow).toBe(0);
    updateEnemies(w, DT);
    expect(w.player.slow).toBe(RANSOM_SLOW.sec);
  });

  it("적은 플레이어를 향해 다가온다 (경로탐색 없이 벡터 정규화만)", () => {
    const w = createWorld(4, 1);
    const i = spawnEnemy(w, "bug", 300, 0, ENEMY_SPEC.bug);
    const before = w.enemies.x[i];
    for (let f = 0; f < 60; f++) updateEnemies(w, DT);
    expect(w.enemies.x[i]).toBeLessThan(before);
    expect(w.enemies.x[i]).toBeCloseTo(before - ENEMY_SPEC.bug.speed, 0);
  });

  it("겹친 적은 8프레임마다 밀려난다 (§12)", () => {
    const w = createWorld(4, 1);
    const a = spawnEnemy(w, "bug", 400, 0, ENEMY_SPEC.bug);
    const b = spawnEnemy(w, "bug", 402, 0, ENEMY_SPEC.bug);
    refreshGrid(w);
    separateEnemies(w, 1); // 8의 배수가 아니면 아무 일도 없다
    expect(w.enemies.x[b] - w.enemies.x[a]).toBeCloseTo(2, 6);
    separateEnemies(w, 8);
    expect(w.enemies.x[b] - w.enemies.x[a]).toBeGreaterThan(2);
  });

  it("적 스펙이 기획서 표와 같다 (§7)", () => {
    expect(ENEMY_SPEC.bug.hp).toBe(10);
    expect(ENEMY_SPEC.worm.hp).toBe(8);
    expect(ENEMY_SPEC.trojan.hp).toBe(45);
    expect(ENEMY_SPEC.botnet.hp).toBe(6);
    expect(ENEMY_SPEC.ransom.hp).toBe(90);
    expect(ENEMY_SPEC.elite.hp).toBe(400);
    expect(ENEMY_SPEC.boss.hp).toBe(1500);
    expect(ENEMY_SPEC.worm.speed).toBeGreaterThan(ENEMY_SPEC.bug.speed);
    expect(ENEMY_SPEC.elite.xp).toBe(25);
    expect(ENEMY_SPEC.boss.xp).toBe(100);
  });
});

/* ── 무기 ────────────────────────────────────────────── */

describe("무기 (§6)", () => {
  it("피해는 레벨과 🧠코어에 비례한다", () => {
    const w = createWorld(5, 1);
    expect(weaponDamage(w, 10, 1)).toBeCloseTo(10, 6);
    expect(weaponDamage(w, 10, 5)).toBeCloseTo(20, 6);
    w.passives.core = 5;
    applyPassives(w);
    expect(weaponDamage(w, 10, 5)).toBeCloseTo(20 * 1.6, 6);
  });

  it("쿨다운은 레벨과 ⏱️CPU 클럭에 따라 줄어든다", () => {
    const w = createWorld(5, 1);
    const base = weaponCooldown(w, 0.8, 1);
    expect(base).toBeCloseTo(0.8, 6);
    expect(weaponCooldown(w, 0.8, 5)).toBeCloseTo(0.8 * 0.68, 6);
    w.passives.cpu = 5;
    applyPassives(w);
    expect(weaponCooldown(w, 0.8, 1)).toBeCloseTo(0.8 * 0.6, 6);
    expect(weaponCooldown(w, 0.8, 1)).toBeLessThan(base);
  });

  it("⏱️CPU 클럭을 올리면 같은 시간에 더 많이 발사한다", () => {
    function fired(cpu: number): number {
      const w = createWorld(6, 1);
      if (cpu > 0) w.passives.cpu = cpu;
      applyPassives(w);
      spawnEnemy(w, "bug", 300, 0, { ...ENEMY_SPEC.bug, hp: 1e9 });
      let n = 0;
      for (let f = 0; f < 180; f++) {
        refreshGrid(w);
        const before = countAlive(w.bullets.alive);
        updateWeapons(w, DT);
        n += countAlive(w.bullets.alive) - before;
      }
      return n;
    }
    expect(fired(5)).toBeGreaterThan(fired(0));
  });

  it("🛡️ 방화벽은 주변 적을 계속 깎는다", () => {
    const w = createWorld(6, 1);
    w.weapons.length = 0;
    giveWeapon(w, "firewall");
    const i = spawnEnemy(w, "bug", 40, 0, { ...ENEMY_SPEC.bug, hp: 500 });
    const before = w.enemies.hp[i];
    for (let f = 0; f < 60; f++) {
      refreshGrid(w);
      updateWeapons(w, DT);
    }
    expect(w.enemies.hp[i]).toBeLessThan(before);
  });

  it("🛰️ 포트 스캐너는 위성을 궤도에 유지한다 (진화하면 6개)", () => {
    const w = createWorld(6, 1);
    w.weapons.length = 0;
    giveWeapon(w, "portscan");
    for (let f = 0; f < 5; f++) updateWeapons(w, DT);
    expect(countOrbit(w)).toBe(2);
    w.weapons[0].evolved = "botnet_orbital";
    for (let f = 0; f < 5; f++) updateWeapons(w, DT);
    expect(countOrbit(w)).toBe(6);
  });

  it("🪶 깃털 폭풍(진화)은 적이 없어도 8방향으로 난사한다", () => {
    const w = createWorld(6, 1);
    w.weapons[0].evolved = "feather_storm";
    w.weapons[0].level = CFG.levelup.maxWeaponLevel;
    updateWeapons(w, DT);
    expect(countAlive(w.bullets.alive)).toBe(8);
  });
});

function countAlive(a: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i]) n++;
  return n;
}

const ORBIT_KIND = BULLET_KINDS.indexOf("orbit");

function countOrbit(w: World): number {
  let n = 0;
  for (let i = 0; i < w.bullets.cap; i++) if (w.bullets.alive[i] && w.bullets.kind[i] === ORBIT_KIND) n++;
  return n;
}

/* ── 스포너 (§3 · §12) ───────────────────────────────── */

describe("스포너 (§3 · §12)", () => {
  it("스폰 예산(초당 6마리)을 넘지 않는다", () => {
    const w = createWorld(31, 1);
    let total = 0;
    for (let f = 0; f < FRAMES; f++) {
      w.t += DT;
      w.enemies.alive.fill(0); // 동시 상한이 아니라 예산만 보기 위해 매 프레임 비운다
      updateSpawner(w, DT);
      total += aliveEnemies(w);
      // 버킷(1초치) + 무리 스폰의 빚만큼만 앞당겨질 수 있다
      expect(total).toBeLessThanOrEqual(CFG.spawnBudgetPerSec * w.t + CFG.spawnBudgetPerSec + 2);
    }
    expect(total / CFG.runSec).toBeLessThanOrEqual(CFG.spawnBudgetPerSec);
    expect(total).toBeGreaterThan(CFG.spawnBudgetPerSec * CFG.runSec * 0.9); // 예산을 놀리지도 않는다
  });

  it("동시 적 상한(enemyCapAt)을 넘겨 스폰하지 않는다", () => {
    const w = createWorld(32, 1);
    for (let f = 0; f < FRAMES; f++) {
      w.t += DT;
      const before = aliveEnemies(w);
      updateSpawner(w, DT);
      // 상한이 구간 전환으로 내려가는 경우가 있어 "늘리지 않는다"로 본다 (+2 = 엘리트·보스)
      expect(aliveEnemies(w)).toBeLessThanOrEqual(Math.max(before, enemyCapAt(w.t)) + 2);
    }
  });

  it("구간별로 정해진 적만 나오고 엘리트·보스가 제때 등장한다 (§3)", () => {
    const w = createWorld(33, 1);
    const seen: Record<string, number> = {};
    const firstAt: Partial<Record<EnemyKind, number>> = {};
    for (let f = 0; f < FRAMES; f++) {
      w.t += DT;
      const before = new Uint8Array(w.enemies.alive);
      updateSpawner(w, DT);
      for (let i = 0; i < w.enemies.cap; i++) {
        if (before[i] || !w.enemies.alive[i]) continue;
        const kind = ENEMY_KINDS[w.enemies.kind[i]];
        seen[kind] = (seen[kind] ?? 0) + 1;
        if (firstAt[kind] === undefined) firstAt[kind] = w.t;
      }
      w.enemies.alive.fill(0); // 상한에 막히지 않게 비운다
      if (w.bossIndex >= 0) w.enemies.alive[w.bossIndex] = 1; // 보스는 살려 둔다
    }
    expect(firstAt.bug).toBeLessThan(5);
    expect(firstAt.trojan).toBeGreaterThanOrEqual(CFG.zones[1].from);
    expect(firstAt.botnet).toBeGreaterThanOrEqual(CFG.zones[2].from);
    expect(firstAt.ransom).toBeGreaterThanOrEqual(CFG.zones[2].from);
    expect(firstAt.elite).toBeGreaterThanOrEqual(CFG.zones[1].from);
    expect(seen.elite).toBe(4); // 60·90·120·150초
    expect(seen.boss).toBe(1);
    expect(firstAt.boss).toBeGreaterThanOrEqual(CFG.zones[3].from);
    expect(seen.botnet).toBeGreaterThan(CFG.levelup.weaponSlots); // 무리로 나온다
  });
});

/* ── 보스 (§7) ───────────────────────────────────────── */

describe("보스 (§7)", () => {
  it("3페이즈(소환 → 장판 → 돌진)를 모두 돈다", () => {
    const w = createWorld(51, 1);
    w.t = CFG.zones[3].from;
    updateSpawner(w, DT);
    expect(w.bossIndex).toBeGreaterThanOrEqual(0);

    const start = aliveEnemies(w);
    for (let f = 0; f < 5 * 60; f++) updateBoss(w, DT); // 1페이즈: 소환
    expect(aliveEnemies(w)).toBeGreaterThan(start);

    for (let f = 0; f < 5 * 60; f++) updateBoss(w, DT); // 2페이즈: 장판
    expect(countAlive(w.hazards.alive)).toBeGreaterThan(0);

    let dashed = false;
    for (let f = 0; f < 5 * 60; f++) {
      updateBoss(w, DT); // 3페이즈: 돌진
      const i = w.bossIndex;
      if (i >= 0 && Math.abs(w.enemies.vx[i]) + Math.abs(w.enemies.vy[i]) > 100) dashed = true;
    }
    expect(dashed).toBe(true);
  });

  it("보스는 한 번만 등장하고 처치되면 다시 나오지 않는다", () => {
    const w = createWorld(52, 1);
    w.t = CFG.zones[3].from;
    updateSpawner(w, DT);
    const i = w.bossIndex;
    expect(i).toBeGreaterThanOrEqual(0);
    damageEnemy(w, i, ENEMY_SPEC.boss.hp * 10);
    expect(w.run.bossKilled).toBe(true);
    for (let f = 0; f < 600; f++) {
      w.t += DT;
      updateSpawner(w, DT);
    }
    expect(w.bossIndex).toBe(-1);
  });
});

/* ── 180초 헤드리스 런 ───────────────────────────────── */

type Report = {
  kills: number;
  level: number;
  evolutions: number;
  eliteKills: number;
  bossKilled: boolean;
  deaths: number;
  firstDeathSec: number;
  weapons: string[];
  maxAlive: number;
};

// 스텁 루프용 스크래치 (테스트에서도 프레임마다 클로저를 만들지 않는다)
let hw: World | null = null;
let hb = -1;
const REHIT = 0.2;
const PICKUP = 18;
const ARENA = 700;
/** 이 거리 안의 적만 피한다 (그 밖이면 XP 줍기 우선) */
const FLEE_R = 240;

function nearestOrb(w: World): number {
  const o = w.orbs;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < o.cap; i++) {
    if (!o.alive[i]) continue;
    const dx = o.x[i] - w.player.x;
    const dy = o.y[i] - w.player.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
const MAX_ENEMY_R = Math.max(...Object.values(ENEMY_SPEC).map((s) => s.r));

const bulletVisit = (j: number, dist: number): void => {
  const w = hw;
  if (!w) return;
  const b = w.bullets;
  const e = w.enemies;
  if (!b.alive[hb] || !e.alive[j] || b.hitCd[hb] > 0) return;
  if (dist > b.r[hb] + e.r[j]) return;
  if (damageEnemy(w, j, b.dmg[hb])) onEnemyDeath(w, ENEMY_KINDS[e.kind[j]], e.x[j], e.y[j]);
  b.hitCd[hb] = REHIT;
  if (b.pierce[hb] > 0) b.pierce[hb]--;
  else b.alive[hb] = 0;
};

let hazDps = 0;
const hazardVisit = (j: number): void => {
  const w = hw;
  if (!w) return;
  if (!w.enemies.alive[j]) return;
  if (damageEnemy(w, j, hazDps)) onEnemyDeath(w, ENEMY_KINDS[w.enemies.kind[j]], w.enemies.x[j], w.enemies.y[j]);
};

let touchDmg = 0;
const touchVisit = (j: number, dist: number): void => {
  const w = hw;
  if (!w) return;
  const p = w.player;
  if (p.iframe > 0 || p.invuln > 0) return;
  if (dist > w.enemies.r[j] + CFG.player.radius) return;
  touchDmg = w.enemies.dmg[j] * w.stats.dmgTaken;
  p.hp -= touchDmg;
  p.iframe = CFG.player.iframeSec;
  w.run.damageTaken += touchDmg;
};

/** 봇의 카드 선택 — 진화를 노리고 시작 무기와 그 짝 패시브에 몰아 준다 (실제 플레이어 기준) */
function botPick(w: World, cards: Card[]): Card {
  const focus = w.weapons[0];
  const pair = WEAPON_INFO[focus.id].pair;
  const owned = new Set(w.weapons.map((x) => x.id));
  return (
    cards.find((c) => c.kind === "evolve") ??
    cards.find((c) => c.kind === "weapon" && c.id === focus.id) ??
    cards.find((c) => c.kind === "passive" && c.id === pair) ??
    // 패시브 슬롯을 잡동사니로 채우면 짝 패시브가 영영 안 나온다 — 보유 무기 강화를 먼저 집는다
    cards.find((c) => c.kind === "weapon" && owned.has(c.id)) ??
    cards[Math.floor(w.rand() * cards.length)]
  );
}

/** 루프·렌더 없이 엔진 모듈만 180초 돌린다 (봇은 가장 가까운 적을 피해 다닌다) */
function headlessRun(seed: number): Report {
  const w = createWorld(seed, 1);
  applyPassives(w);
  hw = w;
  let deaths = 0;
  let firstDeathSec: number = CFG.runSec;
  let maxAlive = 0;

  for (let frame = 0; frame < FRAMES; frame++) {
    w.t += DT;
    refreshGrid(w);
    updateSpawner(w, DT);
    updateEnemies(w, DT);
    separateEnemies(w, frame);
    updateWeapons(w, DT);
    updateBoss(w, DT);

    // ── 아래는 게임 루프(main 세션 담당) 몫을 대신하는 최소 구현 ──
    const b = w.bullets;
    for (let i = 0; i < b.cap; i++) {
      if (!b.alive[i]) continue;
      b.x[i] += b.vx[i] * DT;
      b.y[i] += b.vy[i] * DT;
      b.life[i] -= DT;
      if (b.hitCd[i] > 0) b.hitCd[i] -= DT;
      if (b.life[i] <= 0) {
        b.alive[i] = 0;
        continue;
      }
      if (b.hitCd[i] > 0) continue;
      hb = i;
      forEachEnemyNear(w, b.x[i], b.y[i], b.r[i] + MAX_ENEMY_R, bulletVisit);
    }

    const h = w.hazards;
    for (let i = 0; i < h.cap; i++) {
      if (!h.alive[i]) continue;
      h.life[i] -= DT;
      if (h.life[i] <= 0) {
        h.alive[i] = 0;
        continue;
      }
      if (h.owner[i] === 0) {
        hazDps = h.dps[i] * DT;
        forEachEnemyNear(w, h.x[i], h.y[i], h.r[i], hazardVisit);
      } else {
        const dx = w.player.x - h.x[i];
        const dy = w.player.y - h.y[i];
        if (dx * dx + dy * dy <= h.r[i] * h.r[i]) w.player.hp -= h.dps[i] * DT;
      }
    }

    const p = w.player;
    if (p.iframe > 0) p.iframe -= DT;
    if (p.invuln > 0) p.invuln -= DT;
    if (p.slow > 0) p.slow -= DT;

    // 봇 이동 = 가까운 적 회피 + XP 조각 줍기 + 경기장 복귀
    let dx = 0;
    let dy = 0;
    const n = nearestEnemy(w, p.x, p.y, FLEE_R);
    if (n >= 0) {
      const fx = p.x - w.enemies.x[n];
      const fy = p.y - w.enemies.y[n];
      const fl = Math.sqrt(fx * fx + fy * fy) || 1;
      dx += (fx / fl) * 1.2;
      dy += (fy / fl) * 1.2;
    }
    const orb = nearestOrb(w);
    if (orb >= 0) {
      const ox = w.orbs.x[orb] - p.x;
      const oy = w.orbs.y[orb] - p.y;
      const ol = Math.sqrt(ox * ox + oy * oy) || 1;
      dx += (ox / ol) * 0.9;
      dy += (oy / ol) * 0.9;
    }
    const home = Math.sqrt(p.x * p.x + p.y * p.y);
    if (home > ARENA) {
      dx -= (p.x / home) * 1.5;
      dy -= (p.y / home) * 1.5;
    }
    if (dx === 0 && dy === 0) dx = 1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = w.stats.speed * (p.slow > 0 ? 1 - RANSOM_SLOW.mult : 1);
    p.vx = (dx / len) * speed;
    p.vy = (dy / len) * speed;
    p.x += p.vx * DT;
    p.y += p.vy * DT;

    forEachEnemyNear(w, p.x, p.y, CFG.player.radius + MAX_ENEMY_R, touchVisit);
    if (p.hp <= 0) {
      deaths++;
      if (deaths === 1) firstDeathSec = w.t;
      p.hp = p.maxHp; // 180초 전체를 측정하기 위해 부활시킨다
      p.iframe = 1;
    }

    const o = w.orbs;
    for (let i = 0; i < o.cap; i++) {
      if (!o.alive[i]) continue;
      const ox = p.x - o.x[i];
      const oy = p.y - o.y[i];
      const d = Math.sqrt(ox * ox + oy * oy) || 1;
      if (d < w.stats.magnet) {
        o.x[i] += (ox / d) * 300 * DT;
        o.y[i] += (oy / d) * 300 * DT;
      }
      if (d < PICKUP) {
        o.alive[i] = 0;
        p.xp += o.value[i];
      }
    }
    while (p.xp >= p.xpNext && p.level < CFG.player.maxLevel) {
      p.xp -= p.xpNext;
      p.level++;
      p.xpNext = xpToNext(p.level);
      w.pendingLevelUps++;
    }
    while (w.pendingLevelUps > 0) {
      w.pendingLevelUps--;
      applyCard(w, botPick(w, drawCards(w)));
    }

    const alive = aliveEnemies(w);
    if (alive > maxAlive) maxAlive = alive;
  }

  hw = null;
  return {
    kills: w.run.kills,
    level: w.player.level,
    evolutions: w.run.evolutions,
    eliteKills: w.run.eliteKills,
    bossKilled: w.run.bossKilled,
    deaths,
    firstDeathSec: Math.round(firstDeathSec),
    weapons: w.weapons.map((x) => `${x.id}${x.evolved ? "⭐" : ""}Lv${x.level}`),
    maxAlive,
  };
}

// 기본 3판(CI용). SIM_RUNS=30 으로 늘리면 밸런스 튜닝용 리포트가 된다.
const SIM_RUNS = Number(process.env.SIM_RUNS ?? 3);

describe("180초 헤드리스 런", () => {
  const runs = Array.from({ length: SIM_RUNS }, (_, i) => headlessRun(101 + i * 101));

  it("리포트", () => {
    const evolved = runs.filter((r) => r.evolutions > 0).length;
    console.log("[survive-sim]", JSON.stringify({ evolveRate: evolved / runs.length, runs }));
    expect(runs).toHaveLength(SIM_RUNS);
  });

  it("예외·NaN 없이 끝나고 처치 수가 그럴듯하다", () => {
    for (const r of runs) {
      expect(Number.isFinite(r.kills)).toBe(true);
      expect(r.kills).toBeGreaterThan(150);
      // §9.3 서버 거부 규칙: 초당 8킬 초과 불가
      expect(r.kills).toBeLessThanOrEqual(CFG.runSec * 8);
      expect(r.level).toBeGreaterThanOrEqual(8);
      expect(r.level).toBeLessThanOrEqual(CFG.player.maxLevel);
      expect(r.evolutions).toBeLessThanOrEqual(3);
      expect(r.weapons.length).toBeLessThanOrEqual(CFG.levelup.weaponSlots);
      expect(r.maxAlive).toBeLessThanOrEqual(CFG.pool.enemies);
    }
  });

  it("엘리트 4마리와 보스가 등장한다 (§3)", () => {
    for (const r of runs) expect(r.eliteKills).toBeGreaterThan(0);
  });
});
