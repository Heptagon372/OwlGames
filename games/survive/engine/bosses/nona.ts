// 🔵 8단계 구각형 — 포식자 (기획서 §7)
//
// 주변 몬스터를 빨아들여 먹는다 → 커지고 체력이 오르고 포식 게이지가 찬다.
// 게이지가 가득 차면 폭발하고 다시 작아진다. 플레이어가 때리면 게이지가 준다 (world.damageEnemy).
//  ① 체력 50% 이하 — 무적. 노란 꼭짓점 쪽에서 들어오는 공격만 통한다
//  ② 몬스터 강화 — 주변 잡몹 체력·공격력·크기 증가
//  ③ 비례 탄 — 보스 체력이 높을수록 탄이 크다

import { msg } from "@/games/core/i18n";
import { CFG, atkMult } from "../../config";
import {
  banner,
  burst,
  CUE,
  forEachEnemyNear,
  hurtPlayer,
  pushLog,
  removeEnemy,
  spawnBullet,
  spawnParticle,
  TAG,
  type World,
} from "../world";
import { LOOK } from "../enemies";
import { bossContact, moveBoss } from "./common";
import { vertexAngle } from "./hexa";

export function initNona(w: World): void {
  const b = w.boss;
  b.nonaGauge = 0;
  b.nonaBaseR = w.enemies.r[b.idx];
  b.nonaBaseHp = b.maxHp;
  b.nonaWeakT = 0;
  b.nonaBuffT = 4;
  b.nonaShotT = 2;
  b.step = 0;
}

function explode(w: World): void {
  const c = CFG.nona;
  const b = w.boss;
  const e = w.enemies;
  const i = b.idx;
  const atk = atkMult(w.stage);
  const ratio = e.hp[i] / Math.max(1, b.maxHp);
  for (let k = 0; k < c.blastBullets; k++) {
    const a = (Math.PI * 2 * k) / c.blastBullets;
    spawnBullet(w, e.x[i], e.y[i], Math.cos(a) * 240, Math.sin(a) * 240, 12 * atk, 3, 8 + 8 * ratio, LOOK.enemy, TAG.physical, { hostile: true });
  }
  if (Math.hypot(w.player.x - e.x[i], w.player.y - e.y[i]) < c.blastR) hurtPlayer(w, c.blastDmg * atk, true);
  burst(w, e.x[i], e.y[i], 30, 3, 320);
  w.shake = Math.max(w.shake, CFG.feedback.bossShakeSec);
  w.shakePx = CFG.feedback.bossShakePx;
  w.cues |= CUE.boom;
  e.r[i] = b.nonaBaseR;
  b.nonaGauge = 0;
  pushLog(w, "ALERT", msg("nonaBurst"));
}

export function updateNona(w: World, dt: number): void {
  const c = CFG.nona;
  const b = w.boss;
  const e = w.enemies;
  const i = b.idx;
  const atk = atkMult(w.stage);

  e.phase[i] += dt * 0.3;
  moveBoss(w, c.speed, 160, dt);
  bossContact(w, e.dmg[i]);

  // 포식 — 빨아들이고, 닿으면 먹는다 (한 번에 한 마리씩)
  b.timer -= dt;
  forEachEnemyNear(w, e.x[i], e.y[i], c.suckRange, (j) => {
    if (!e.alive[j] || e.rank[j] !== 0) return;
    const dx = e.x[i] - e.x[j];
    const dy = e.y[i] - e.y[j];
    const d = Math.hypot(dx, dy) || 1;
    if (d < e.r[i] + c.eatRange && b.timer <= 0) {
      b.timer = c.eatCd;
      removeEnemy(w, j, false);
      // 처음 체력 기준으로 늘린다 (현재 최대 체력 기준이면 복리로 불어나 못 잡는다)
      const grow = Math.min(b.nonaBaseHp * c.eatMaxHp, b.nonaBaseHp * c.maxHpCap - b.maxHp);
      if (grow > 0) {
        b.maxHp += grow;
        e.maxHp[i] = b.maxHp;
      }
      e.hp[i] = Math.min(b.maxHp, e.hp[i] + b.nonaBaseHp * c.eatHeal + Math.max(0, grow));
      e.r[i] = Math.min(c.rMax, e.r[i] + c.eatGrow);
      b.nonaGauge += c.eatGauge;
      spawnParticle(w, e.x[j], e.y[j], dx * 2, dy * 2, 0.3, 4, 3);
      return;
    }
    if (d > e.r[i] + 400) return;
    e.x[j] += (dx / d) * c.suckSpeed * dt;
    e.y[j] += (dy / d) * c.suckSpeed * dt;
  });
  if (b.nonaGauge >= c.gaugeMax) explode(w);

  // ① 무적 + 노란 약점
  if (e.hp[i] <= b.maxHp * c.armorAt) {
    if (!b.gateOn) {
      b.gateOn = true;
      b.gateN = 1;
      b.gateW = c.weakArc;
      b.nonaWeakT = 0;
      banner(w, msg("nonaArmor"), msg("nonaArmorSub"));
      pushLog(w, "ALERT", msg("nonaArmor"));
    }
    b.nonaWeakT -= dt;
    if (b.nonaWeakT <= 0) {
      b.nonaWeakT = c.weakMoveSec;
      b.step = Math.floor(w.rand() * 9);
    }
    b.gateA[0] = vertexAngle(w, b.step, 9);
  }

  // ② 몬스터 강화
  b.nonaBuffT -= dt;
  if (b.nonaBuffT <= 0) {
    b.nonaBuffT = c.buffCd;
    let n = 0;
    forEachEnemyNear(w, e.x[i], e.y[i], c.buffR, (j) => {
      if (!e.alive[j] || e.rank[j] !== 0 || e.buff[j]) return;
      e.buff[j] = 1;
      e.hp[j] *= c.buffHp;
      e.maxHp[j] *= c.buffHp;
      e.dmg[j] *= c.buffDmg;
      e.r[j] *= c.buffSize;
      n++;
    });
    for (let k = 0; k < 16; k++) {
      const a = (Math.PI * 2 * k) / 16;
      spawnParticle(w, e.x[i], e.y[i], Math.cos(a) * 320, Math.sin(a) * 320, 0.5, 4, 3);
    }
    if (n > 0) pushLog(w, "ALERT", msg("nonaBuff", { n }));
  }

  // ③ 비례 탄 — 체력이 높을수록 크다
  b.nonaShotT -= dt;
  if (b.nonaShotT <= 0) {
    b.nonaShotT = c.shotCd;
    const ratio = Math.max(0, Math.min(1, e.hp[i] / Math.max(1, b.maxHp)));
    const r = c.shotMinR + (c.shotMaxR - c.shotMinR) * ratio;
    const base = Math.atan2(w.player.y - e.y[i], w.player.x - e.x[i]);
    for (let k = 0; k < c.shotSpread; k++) {
      const a = base + (k - (c.shotSpread - 1) / 2) * 0.22;
      spawnBullet(
        w, e.x[i], e.y[i], Math.cos(a) * c.shotSpeed, Math.sin(a) * c.shotSpeed,
        10 * atk * (0.6 + ratio), 4, r, LOOK.enemy, TAG.physical, { hostile: true },
      );
    }
  }
}
