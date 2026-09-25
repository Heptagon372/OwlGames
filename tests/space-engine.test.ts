// 🚀 아울스페이스 엔진 검증 (기획서 §14 수용 기준)
import { describe, expect, it } from "vitest";
import { CFG, bulletSpeedMult, chipNeed, densityMult, hpMult, stageScoreMult } from "@/games/space/config";
import { PATTERNS, PATTERN_IDS } from "@/games/space/data/patterns";
import {
  activeSynergies,
  applyStats,
  baseStats,
  MAIN_IDS,
  MAINS,
  PASSIVE_IDS,
  PASSIVES,
  SUB_IDS,
  SUBS,
  SYNERGIES,
} from "@/games/space/data/skills";
import { STAGES, stageInfo } from "@/games/space/data/stages";
import { emitShot, setPattern, tickPattern, tickVolleys } from "@/games/space/engine/emitter";
import { updateEBullets, updateLasers } from "@/games/space/engine/bullets";
import { applyCard, drawCards } from "@/games/space/engine/levelup";
import { buildMeta, rawScore } from "@/games/space/engine/score";
import { spawnBoss, updateBoss } from "@/games/space/engine/boss";
import {
  clearBullets,
  countEBullets,
  createWorld,
  fireBomb,
  hitPlayer,
  killEnemy,
  spawnEBullet,
  type World,
} from "@/games/space/engine/world";
import { chooseCard, createRun, update, type Run } from "@/games/space/engine/game";
import { THEMES } from "@/games/space/theme";
import type { PassiveId, PassiveSlot, Shot } from "@/games/space/types";

const DT = 1 / 60;

function world(stage = 1, seed = 4242): World {
  return createWorld(seed, stage, "dark", true);
}

function passives(list: [PassiveId, number][]): PassiveSlot[] {
  return list.map(([id, lv]) => ({ id, lv }));
}

/* ── 1. 패턴 DSL (§14-6) ────────────────────────────────────── */

describe("탄막 패턴 DSL (§13)", () => {
  it("보스 15종의 모든 페이즈가 데이터로 정의돼 있다 (하드코딩 0)", () => {
    expect(STAGES).toHaveLength(15);
    for (const s of STAGES) {
      expect(s.boss.phases.length).toBeGreaterThanOrEqual(2);
      for (const id of s.boss.phases) {
        expect(PATTERNS[id], `${s.boss.name} 의 패턴 ${id}`).toBeDefined();
      }
    }
  });

  it("레이저는 반드시 예고선(warnSec)을 갖는다 (§14-4)", () => {
    for (const id of PATTERN_IDS) {
      for (const shot of PATTERNS[id].shots) {
        if (shot.type === "laser") {
          expect(shot.warnSec ?? 0, `${id} 의 레이저`).toBeGreaterThanOrEqual(0.6);
        }
      }
    }
  });

  it("모든 패턴이 유효한 값을 갖는다", () => {
    for (const id of PATTERN_IDS) {
      const p = PATTERNS[id];
      expect(p.loopSec).toBeGreaterThan(0);
      expect(p.shots.length).toBeGreaterThan(0);
      for (const s of p.shots) {
        expect(s.at).toBeGreaterThanOrEqual(0);
        expect(s.at).toBeLessThan(p.loopSec + 1);
        expect(s.count).toBeGreaterThan(0);
      }
    }
  });
});

describe("패턴 실행기 (§13)", () => {
  const shot = (v: Partial<Shot>): Shot => ({ at: 0, type: "ring", count: 8, speed: 200, ...v });

  it("ring 은 정확히 count 발을 360도로 뿌린다", () => {
    const w = world();
    emitShot(w, 270, 100, shot({ type: "ring", count: 12 }));
    expect(countEBullets(w)).toBe(Math.round(12 * densityMult(1)));
  });

  it("aimed 는 플레이어를 향한다", () => {
    const w = world();
    w.player.x = 100;
    w.player.y = 800;
    emitShot(w, 270, 100, shot({ type: "aimed", count: 1 }));
    const b = w.ebullets;
    let idx = -1;
    for (let i = 0; i < b.cap; i++) if (b.alive[i]) { idx = i; break; }
    expect(idx).toBeGreaterThanOrEqual(0);
    // 왼쪽 아래로 날아가야 한다
    expect(b.vx[idx]).toBeLessThan(0);
    expect(b.vy[idx]).toBeGreaterThan(0);
  });

  it("fan 은 spread 안에 고르게 퍼진다", () => {
    const w = world();
    emitShot(w, 270, 100, shot({ type: "fan", count: 5, spread: 60 }));
    expect(countEBullets(w)).toBeGreaterThanOrEqual(5);
  });

  it("laser 는 예고선 상태로 태어난다 (탄이 아니다)", () => {
    const w = world();
    emitShot(w, 270, 100, shot({ type: "laser", count: 2, speed: 0, spread: 90, warnSec: 0.6 }));
    expect(countEBullets(w)).toBe(0);
    let lasers = 0;
    for (let i = 0; i < w.lasers.cap; i++) if (w.lasers.alive[i]) { lasers++; expect(w.lasers.warn[i]).toBeGreaterThan(0); }
    expect(lasers).toBe(2);
  });

  it("repeat 은 interval 마다 회전하며 여러 번 쏜다", () => {
    const w = world();
    const e = w.enemies;
    e.alive[0] = 1;
    e.x[0] = 270;
    e.y[0] = 100;
    e.rank[0] = 0;
    setPattern(w, 0, "b6.spiral");
    tickPattern(w, 0, 0.02);
    const first = countEBullets(w);
    expect(first).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) tickVolleys(w, 0.05);
    expect(countEBullets(w)).toBeGreaterThan(first);
  });

  it("스테이지가 오르면 탄이 빨라지고 촘촘해진다 (§6)", () => {
    expect(bulletSpeedMult(1)).toBeCloseTo(1, 5);
    expect(bulletSpeedMult(11)).toBeCloseTo(1.5, 5);
    expect(densityMult(11)).toBeCloseTo(1.9, 5);
    expect(hpMult(11)).toBeCloseTo(2.6, 5);
  });
});

/* ── 2. 그레이즈 (§4 · §14-7) ───────────────────────────────── */

describe("그레이즈 (§4)", () => {
  it("판정 반경 안으로 지나가면 1회 판정된다", () => {
    const w = world();
    w.player.x = 270;
    w.player.y = 800;
    spawnEBullet(w, 270, 800 - CFG.graze.radius + 2, 0, 0, 3);
    updateEBullets(w, DT);
    expect(w.run.graze).toBe(1);
  });

  it("같은 탄은 여러 프레임을 지나도 한 번만 (§14-7)", () => {
    const w = world();
    w.player.x = 270;
    w.player.y = 800;
    spawnEBullet(w, 270 + 18, 800, 0, 0, 3);
    for (let i = 0; i < 30; i++) updateEBullets(w, DT);
    expect(w.run.graze).toBe(1);
  });

  it("판정점에 닿으면 그레이즈가 아니라 피격이다", () => {
    const w = world();
    w.player.x = 270;
    w.player.y = 800;
    spawnEBullet(w, 270, 800, 0, 0, 3);
    updateEBullets(w, DT);
    expect(w.run.damageTaken).toBe(1);
    expect(w.player.lives).toBe(CFG.player.lives - 1);
  });

  it("그레이즈가 칩 게이지를 채운다 (잘 피하면 빨리 강해진다)", () => {
    const w = world();
    w.player.x = 270;
    w.player.y = 800;
    const before = w.chipGauge;
    spawnEBullet(w, 270 + 18, 800, 0, 0, 3);
    updateEBullets(w, DT);
    expect(w.chipGauge).toBeGreaterThan(before);
  });

  it("그레이즈 100회마다 봄이 하나 늘어난다 (§3)", () => {
    const w = world();
    w.player.x = 270;
    w.player.y = 800;
    w.player.bombs = 0;
    for (let k = 0; k < CFG.bomb.grazePerBomb; k++) {
      const i = spawnEBullet(w, 270 + 18, 800, 0, 0, 3);
      updateEBullets(w, DT);
      w.ebullets.alive[i] = 0;
    }
    expect(w.run.graze).toBe(CFG.bomb.grazePerBomb);
    expect(w.player.bombs).toBe(1);
  });
});

/* ── 3. 생명·피격·봄 (§3 · §14-5) ───────────────────────────── */

describe("생명과 피격 (§3)", () => {
  it("피격하면 전탄 소거 + 무적 3초 + 봄 보충", () => {
    const w = world();
    for (let k = 0; k < 30; k++) spawnEBullet(w, 100 + k, 100, 0, 100, 5);
    w.player.bombs = 1;
    hitPlayer(w);
    expect(countEBullets(w)).toBe(0);
    expect(w.player.iframe).toBeCloseTo(CFG.player.iFrameSec, 5);
    expect(w.player.bombs).toBe(2);
    expect(w.player.lives).toBe(2);
  });

  it("무적 중에는 맞지 않는다", () => {
    const w = world();
    hitPlayer(w);
    hitPlayer(w);
    expect(w.player.lives).toBe(2);
  });

  it("생명이 0이면 즉시 종료 (컨티뉴 없음)", () => {
    const w = world();
    for (let k = 0; k < 3; k++) { w.player.iframe = 0; hitPlayer(w); }
    expect(w.player.lives).toBe(0);
    expect(w.over).toBe(true);
    expect(w.player.alive).toBe(false);
  });

  it("봄은 전탄 소거 + 적 대미지 + 무적", () => {
    const w = world();
    for (let k = 0; k < 20; k++) spawnEBullet(w, 100 + k, 100, 0, 100, 5);
    const e = w.enemies;
    e.alive[0] = 1; e.hp[0] = 100; e.maxHp[0] = 100; e.x[0] = 200; e.y[0] = 200; e.r[0] = 10;
    fireBomb(w);
    expect(countEBullets(w)).toBe(0);
    expect(e.alive[0]).toBe(0);
    expect(w.player.iframe).toBeGreaterThan(0);
    expect(w.player.bombs).toBe(CFG.bomb.start - 1);
  });

  it("🛡️ 나노 실드(P8)가 피격을 한 번 막는다", () => {
    const w = world();
    w.passives = passives([["P8", 1]]);
    w.stats = applyStats(w.passives);
    w.player.shield = true;
    hitPlayer(w);
    expect(w.player.lives).toBe(CFG.player.lives);
    expect(w.player.shield).toBe(false);
  });
});

/* ── 4. 스킬 30종 (§5) ──────────────────────────────────────── */

describe("스킬 30종 (§5.2)", () => {
  it("메인 6 · 서브 12 · 패시브 12 = 30종", () => {
    expect(MAIN_IDS).toHaveLength(6);
    expect(SUB_IDS).toHaveLength(12);
    expect(PASSIVE_IDS).toHaveLength(12);
    expect(MAIN_IDS.length + SUB_IDS.length + PASSIVE_IDS.length).toBe(30);
  });

  it("모든 스킬이 이름·이모지·설명을 갖는다", () => {
    for (const id of MAIN_IDS) expect(MAINS[id].desc.length).toBeGreaterThan(0);
    for (const id of SUB_IDS) expect(SUBS[id].desc.length).toBeGreaterThan(0);
    for (const id of PASSIVE_IDS) expect(PASSIVES[id].desc.length).toBeGreaterThan(0);
  });

  it("🎯 마이크로 코어는 판정점을 최대 -2.8px 까지만 줄인다", () => {
    expect(applyStats(passives([["P4", 1]])).hitboxR).toBeCloseTo(3.3, 5);
    expect(applyStats(passives([["P4", 4]])).hitboxR).toBeCloseTo(1.2, 5);
    expect(applyStats(passives([["P4", 4]])).hitboxR).toBeGreaterThan(0);
  });

  it("✨ 그레이즈 마스터는 점수와 판정 반경을 같이 올린다", () => {
    const s = applyStats(passives([["P6", 2]]));
    expect(s.grazeScore).toBeCloseTo(1.8, 5);
    expect(s.grazeRadius).toBe(CFG.graze.radius + 8);
  });

  it("💣 봄 확장은 최대치를 올린다", () => {
    expect(applyStats(passives([["P5", 2]])).bombMax).toBe(CFG.bomb.max + 2);
  });

  it("🧲 칩 마그넷(S6)은 흡수 반경을 2배로", () => {
    expect(applyStats([], [{ id: "S6", lv: 1 }]).magnet).toBe(baseStats().magnet * 2);
  });

  it("시너지 6종이 조건대로 켜진다 (§5.3)", () => {
    expect(SYNERGIES).toHaveLength(6);
    expect(activeSynergies("M3", [], passives([["P11", 1]])).map((y) => y.id)).toContain("Y1");
    expect(activeSynergies("M2", [], passives([["P2", 1]])).map((y) => y.id)).toContain("Y2");
    expect(activeSynergies("M1", ["S2", "S9"], []).map((y) => y.id)).toContain("Y3");
    expect(activeSynergies("M1", ["S7"], passives([["P6", 1]])).map((y) => y.id)).toContain("Y4");
    expect(activeSynergies("M1", ["S10"], passives([["P4", 1]])).map((y) => y.id)).toContain("Y5");
    expect(activeSynergies("M1", [], passives([["P5", 1], ["P10", 1]])).map((y) => y.id)).toContain("Y6");
    expect(activeSynergies("M1", [], [])).toHaveLength(0);
  });
});

describe("스킬 3택 (§5.1)", () => {
  it("항상 서로 다른 3장", () => {
    const w = world();
    for (let i = 0; i < 40; i++) {
      const cards = drawCards(w);
      expect(cards).toHaveLength(3);
      expect(new Set(cards.map((c) => c.id)).size).toBe(3);
    }
  });

  it("슬롯이 가득 차면 보유한 것 강화만 나온다", () => {
    const w = world();
    w.subs = SUB_IDS.slice(0, CFG.slots.sub).map((id) => ({ id, lv: 1 }));
    w.passives = PASSIVE_IDS.slice(0, CFG.slots.passive).map((id) => ({ id, lv: 1 }));
    for (let i = 0; i < 30; i++) {
      for (const c of drawCards(w)) {
        if (c.kind === "sub") expect(w.subs.some((s) => s.id === c.id)).toBe(true);
        if (c.kind === "passive") expect(w.passives.some((s) => s.id === c.id)).toBe(true);
      }
    }
  });

  it("카드를 적용하면 레벨이 오르고 스탯이 바뀐다", () => {
    const w = world();
    applyCard(w, { kind: "passive", id: "P1", name: "x", emoji: "x", desc: "x", level: "신규" });
    expect(w.stats.damage).toBeCloseTo(1.15, 5);
    applyCard(w, { kind: "main", id: "M3", name: "x", emoji: "x", desc: "x", level: "교체" });
    expect(w.main.id).toBe("M3");
    applyCard(w, { kind: "main", id: "M3", name: "x", emoji: "x", desc: "x", level: "Lv1 → 2" });
    expect(w.main.lv).toBe(2);
  });

  it("칩 게이지 요구량은 12 + 4×획득횟수", () => {
    expect(chipNeed(0)).toBe(12);
    expect(chipNeed(3)).toBe(24);
  });
});

/* ── 5. 스테이지 (§6) ───────────────────────────────────────── */

describe("스테이지 (§6)", () => {
  it("1~15 스테이지가 보스·적 구성을 갖는다", () => {
    for (const s of STAGES) {
      expect(s.enemies.length).toBeGreaterThan(0);
      expect(s.boss.hp).toBeGreaterThan(0);
      expect(s.boss.tip.length).toBeGreaterThan(0);
    }
  });

  it("점수 배율은 ×3.0 에서 멈춘다", () => {
    expect(stageScoreMult(1)).toBeCloseTo(1, 5);
    expect(stageScoreMult(5)).toBeCloseTo(1.24, 5);
    expect(stageScoreMult(99)).toBeCloseTo(3, 5);
  });

  it("16 이상은 엔드리스 — 규칙과 강화 보스가 붙는다", () => {
    expect(stageInfo(18).endless).toBe(true);
    expect(stageInfo(18).rule).not.toBeNull();
    expect(stageInfo(20).boss.phases.length).toBeGreaterThan(STAGES[(20 - 1) % 15].boss.phases.length);
  });
});

/* ── 6. 보스 (§6) ───────────────────────────────────────────── */

describe("보스 (§6)", () => {
  it("등장 시 WARNING 과 함께 스크롤이 느려진다", () => {
    const w = world();
    spawnBoss(w);
    expect(w.boss.active).toBe(true);
    expect(w.phase).toBe("boss");
    expect(w.banner?.text).toBe("WARNING");
    expect(w.log.some((l) => l.tag === "ALERT")).toBe(true);
  });

  it("체력이 줄면 페이즈가 바뀌고 전탄이 소거된다", () => {
    const w = world(5);
    spawnBoss(w);
    w.boss.warnT = 0;
    for (let k = 0; k < 20; k++) spawnEBullet(w, 100, 100, 0, 100, 5);
    const chipsBefore = (() => { let n = 0; for (let i = 0; i < w.chips.cap; i++) if (w.chips.alive[i]) n++; return n; })();
    w.enemies.hp[w.boss.idx] = w.boss.maxHp * 0.4;
    updateBoss(w, DT);
    expect(w.boss.phase).toBeGreaterThanOrEqual(1);
    // 전환 순간의 탄은 칩으로 바뀌며 지워진다 (새 페이즈가 곧바로 쏘는 탄은 별개다)
    const chipsAfter = (() => { let n = 0; for (let i = 0; i < w.chips.cap; i++) if (w.chips.alive[i]) n++; return n; })();
    expect(chipsAfter).toBeGreaterThan(chipsBefore);
    expect(w.log.some((l) => l.text.includes("PHASE"))).toBe(true);
  });

  it("보스를 잡으면 클리어 상태가 된다", () => {
    const w = world();
    spawnBoss(w);
    killEnemy(w, w.boss.idx);
    expect(w.cleared).toBe(true);
    expect(w.run.bossKilled).toBe(true);
  });

  it("보스 15종 패턴이 예외 없이 돈다", () => {
    for (let stage = 1; stage <= 15; stage++) {
      const w = world(stage, 700 + stage);
      spawnBoss(w);
      w.boss.warnT = 0;
      for (let i = 0; i < 60 * 8; i++) {
        updateBoss(w, DT);
        tickVolleys(w, DT);
        updateEBullets(w, DT);
        updateLasers(w, DT);
        w.t += DT;
        w.frame++;
        if (i % 120 === 0) clearBullets(w);
      }
      expect(Number.isFinite(w.enemies.x[w.boss.idx])).toBe(true);
      expect(Number.isFinite(w.player.x)).toBe(true);
    }
  });
});

/* ── 7. 점수·메타 (§10) ─────────────────────────────────────── */

describe("점수와 메타 (§10)", () => {
  it("원점수 공식이 기획서와 같다", () => {
    const w = world(5);
    w.t = 118;
    w.run.kills = 214;
    w.run.graze = 183;
    w.run.chips = 96;
    w.run.damageTaken = 1;
    w.run.bossKilled = true;
    w.cleared = true;
    w.player.lives = 2;
    w.player.bombs = 1;
    const base = 214 * 4 + 183 * 15 + 96 * 2 + 118 * 5 + 500 + 1000 + 2 * 300 + 1 * 100;
    expect(rawScore(w)).toBe(Math.round(base * stageScoreMult(5)));
  });

  it("무피격 보너스는 피격 0 + 클리어일 때만", () => {
    const w = world(1);
    w.t = 100;
    w.cleared = true;
    const clean = rawScore(w);
    w.run.damageTaken = 1;
    expect(rawScore(w)).toBe(clean - CFG.score.noMiss);
  });

  it("메타가 서버 검증 키를 모두 갖는다", () => {
    const w = world(3);
    w.t = 118.44;
    const meta = buildMeta(w, "mobile");
    for (const key of [
      "stage", "cleared", "duration_s", "kills", "graze", "chips", "lives_left",
      "bombs_unused", "damage_taken", "boss_killed", "skills", "theme", "device", "v",
    ]) {
      expect(meta).toHaveProperty(key);
    }
    expect(meta.duration_s).toBeCloseTo(118.4, 5);
    expect(meta.skills[0]).toMatch(/^M\d:\d$/);
  });
});

/* ── 8. 색 대비 (§9 · §14-11) ───────────────────────────────── */

function luminance(hex: string): number {
  const v = hex.replace("#", "");
  const n = parseInt(v, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("색 규칙 (§9)", () => {
  it("적 탄은 두 테마 모두 배경 대비 4.5:1 이상 (§14-11)", () => {
    for (const id of ["dark", "light"] as const) {
      const t = THEMES[id];
      expect(contrast(t.enemyBullet, t.bg), `${id} 적 탄`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("내 탄과 적 탄은 **색상**이 확실히 다르다 (절대 원칙)", () => {
    // 명도 대비로는 파랑/빨강을 구분 못 한다 (둘 다 중간 밝기) → 채널 거리로 본다
    const rgb = (hex: string) => {
      const n = parseInt(hex.replace("#", ""), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    for (const id of ["dark", "light"] as const) {
      const t = THEMES[id];
      const a = rgb(t.myBullet);
      const b = rgb(t.enemyBullet);
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      expect(dist, `${id} 내 탄 vs 적 탄 색 거리`).toBeGreaterThan(120);
      // 내 탄도 배경에서 보여야 한다
      expect(contrast(t.myBullet, t.bg), `${id} 내 탄 대비`).toBeGreaterThanOrEqual(3);
    }
  });

  it("적 탄에는 외곽선 색이 따로 있다", () => {
    for (const id of ["dark", "light"] as const) {
      expect(THEMES[id].enemyBulletEdge).not.toBe(THEMES[id].enemyBullet);
    }
  });
});

/* ── 9. 헤드리스 런 (§14-9) ─────────────────────────────────── */

type Report = {
  stage: number;
  cleared: boolean;
  sec: number;
  kills: number;
  graze: number;
  lives: number;
  grazePerSec: number;
  killsPerSec: number;
};

/** 가장 가까운 탄에서 멀어지는 단순 봇 */
function botInput(run: Run) {
  const w = run.world;
  const p = w.player;
  let bx = 0;
  let by = 0;
  const b = w.ebullets;
  for (let i = 0; i < b.cap; i++) {
    if (!b.alive[i]) continue;
    const dx = p.x - b.x[i];
    const dy = p.y - b.y[i];
    const d = Math.hypot(dx, dy);
    if (d > 140 || d < 0.001) continue;
    bx += dx / d / d;
    by += dy / d / d;
  }
  // 화면 아래쪽 가운데로 약하게 당긴다
  bx += (CFG.screen.w / 2 - p.x) * 0.0007;
  by += (CFG.screen.h * 0.78 - p.y) * 0.0007;
  const len = Math.hypot(bx, by) || 1;
  return { mx: bx / len, my: by / len, targetX: null, targetY: null, precise: false, bomb: false };
}

function simulate(stage: number, seed: number): Report {
  const run = createRun(seed, stage, "dark", true);
  let guard = 0;
  while (!run.world.over && guard < 60 * 200) {
    guard++;
    if (run.cards.length > 0) {
      chooseCard(run, Math.floor(run.world.rand() * run.cards.length));
      continue;
    }
    const input = botInput(run);
    // 위험하면 봄을 쓴다
    if (run.world.player.lives <= 2 && countEBullets(run.world) > 160 && run.world.player.bombs > 0) input.bomb = true;
    update(run, DT, input);
  }
  const w = run.world;
  return {
    stage,
    cleared: w.cleared,
    sec: Math.round(w.t),
    kills: w.run.kills,
    graze: w.run.graze,
    lives: w.player.lives,
    grazePerSec: w.run.graze / Math.max(1, w.t),
    killsPerSec: w.run.kills / Math.max(1, w.t),
  };
}

const SIM_RUNS = Number(process.env.SIM_RUNS ?? 3);

describe("헤드리스 런 (§14)", () => {
  const reports: Report[] = [];
  for (let i = 0; i < SIM_RUNS; i++) reports.push(simulate(1, 5100 + i * 53));
  const s8 = simulate(8, 909);

  it("리포트", () => {
    console.log("[space]", JSON.stringify({ s1: reports, s8 }));
    expect(reports.length).toBe(SIM_RUNS);
  });

  it("예외·NaN 없이 끝난다", () => {
    for (const r of [...reports, s8]) {
      expect(Number.isFinite(r.kills)).toBe(true);
      expect(Number.isFinite(r.graze)).toBe(true);
      expect(r.sec).toBeGreaterThan(0);
    }
  });

  it("서버 거부선(초당 처치 6 · 초당 그레이즈 12)을 넘지 않는다 (§10.3)", () => {
    for (const r of [...reports, s8]) {
      expect(r.killsPerSec).toBeLessThanOrEqual(6);
      expect(r.grazePerSec).toBeLessThanOrEqual(12);
    }
  });

  it("런이 하드캡 안에서 끝난다", () => {
    for (const r of [...reports, s8]) expect(r.sec).toBeLessThanOrEqual(CFG.wave.hardCapSec + 1);
  });

  it("보스 등장(55초)까지는 살아남는다", () => {
    expect(reports.some((r) => r.sec >= CFG.wave.bossAt)).toBe(true);
  });
});
