// 🦉 아울 서바이버즈 v3 — 보스 (기획서 §6·§7·§11·§12)
//
// v2 의 "패턴 12종 조합"을 버렸다. v3 보스 4종은 **보스마다 규칙 자체가 다르다**
// (레이저 / 포식 / 술래잡기 / 시간). 그래서 보스 하나 = 모듈 하나(`bosses/*.ts`)이고,
// 여기서는 등장·퇴장·분기만 한다. 경고 → 발동 문법은 `bosses/common.ts` 가 공유한다.

import { msg, ref } from "@/games/core/i18n";
import { CFG, atkMult, hpMult } from "../config";
import type { BossKind } from "../data/stages";
import { clearArea } from "./obstacles";
import { initChrono, updateChrono } from "./bosses/chrono";
import { clearBossEffects, updateBeams, updateBossHazards } from "./bosses/common";
import { initHexa, updateHexa } from "./bosses/hexa";
import { initNona, updateNona } from "./bosses/nona";
import { initTrideca, updateTrideca } from "./bosses/trideca";
import { banner, CUE, emote, pushLog, spawnEnemy, type World } from "./world";

const SPEC: Record<BossKind, { hp: number; r: number; speed: number }> = {
  hexa: CFG.hexa,
  nona: CFG.nona,
  trideca: CFG.trideca,
  chrono: CFG.chrono,
};

export function spawnBoss(w: World, kind: BossKind): void {
  const b = w.boss;
  if (b.active) return;
  const spec = SPEC[kind];

  // 보스 패턴이 가려지지 않게 주변 장애물을 치운다 (§8)
  clearArea(w, w.player.x, w.player.y, CFG.boss.clearR, CFG.boss.clearRatio);

  const a = w.rand() * Math.PI * 2;
  const i = spawnEnemy(w, kind, w.player.x + Math.cos(a) * 360, w.player.y + Math.sin(a) * 360, 3);
  if (i < 0) return;
  const e = w.enemies;
  e.hp[i] = spec.hp * hpMult(w.stage);
  e.maxHp[i] = e.hp[i];
  e.r[i] = spec.r;
  e.speed[i] = spec.speed;
  e.dmg[i] = CFG.boss.contactDmg * atkMult(w.stage);
  e.xp[i] = 60;
  e.phase[i] = -Math.PI / 2;

  b.idx = i;
  b.kind = kind;
  b.active = true;
  b.defeated = false;
  b.maxHp = e.hp[i];
  b.intro = CFG.boss.introSec;
  b.t = 0;
  b.timer = 0;
  b.step = 0;
  b.gateOn = false;
  b.gateN = 0;
  b.shield = 0;

  if (kind === "hexa") initHexa(w);
  else if (kind === "nona") initNona(w);
  else if (kind === "trideca") initTrideca(w);
  else initChrono(w);

  pushLog(w, "ALERT", msg("bossIn", { boss: ref(`boss.${kind}`) }));
  banner(w, msg("bossName", { boss: ref(`boss.${kind}`), title: ref(`bossTitle.${kind}`) }), msg("bossRule", { rule: ref(`bossRuleText.${kind}`) }), 2.6);
  w.flash = Math.max(w.flash, 0.16);
  w.shake = Math.max(w.shake, 0.4);
  w.shakePx = Math.max(w.shakePx, CFG.feedback.bossShakePx);
  w.cues |= CUE.alarm | CUE.bossIn;
  emote(w, 3, 1.6);
}

/** 보스를 잡았으면 남은 패턴을 걷는다 (game.ts 가 다음 단계로 넘긴다) */
export function endBoss(w: World): void {
  const b = w.boss;
  clearBossEffects(w);
  b.active = false;
  b.gateOn = false;
  b.idx = -1;
  w.frozen = 0;
  w.gray = 0;
}

export function updateBoss(w: World, dt: number): void {
  updateBeams(w, dt);
  updateBossHazards(w, dt);

  const b = w.boss;
  if (!b.active) return;
  const e = w.enemies;
  if (b.idx < 0 || !e.alive[b.idx]) {
    b.active = false;
    return;
  }

  if (b.shield > 0) b.shield -= dt;

  // 등장 연출 — 무적이고 공격하지 않는다
  if (b.intro > 0) {
    b.intro -= dt;
    return;
  }

  // ⏸️ 시간 정지 동안 십오각형 말고는 모두 멈춘다
  if (w.frozen > 0 && b.kind !== "chrono") return;

  if (b.kind !== "chrono") b.t += dt;
  switch (b.kind) {
    case "hexa": updateHexa(w, dt); break;
    case "nona": updateNona(w, dt); break;
    case "trideca": updateTrideca(w, dt); break;
    case "chrono": updateChrono(w, dt); break;
    default: break;
  }
}
