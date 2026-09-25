// 🚀 아울스페이스 — 탄막 패턴 라이브러리 (기획서 §13 DSL)
//
// 보스 15종 × 3페이즈를 코드로 쓰면 아무도 못 고친다. 전부 **데이터**로 선언하고,
// engine/emitter.ts 가 이 데이터를 읽어 탄을 뿌린다. (수용 기준 §14-6: 하드코딩 0)

import type { Pattern } from "../types";

/** 자주 쓰는 패턴 조각 */
const P = (id: string, loopSec: number, shots: Pattern["shots"]): Pattern => ({ id, shots, loopSec });

export const PATTERNS: Record<string, Pattern> = {
  /* ── 잡몹용 ─────────────────────────────────────────────── */
  "mob.single": P("mob.single", 1.6, [{ at: 0, type: "aimed", count: 1, speed: 190 }]),
  "mob.triple": P("mob.triple", 1.8, [{ at: 0, type: "fan", count: 3, speed: 200, spread: 30 }]),
  "mob.ring": P("mob.ring", 2.4, [{ at: 0, type: "ring", count: 8, speed: 160 }]),
  "mob.homing": P("mob.homing", 2.2, [{ at: 0, type: "aimed", count: 2, speed: 230, spread: 12 }]),

  /* ── S1 스카우트 드론 — 3방향 확산 ───────────────────────── */
  "b1.spread": P("b1.spread", 2.2, [
    { at: 0, type: "fan", count: 3, speed: 210, spread: 40 },
    { at: 0.9, type: "fan", count: 5, speed: 190, spread: 70 },
  ]),
  "b1.aimed": P("b1.aimed", 1.8, [
    { at: 0, type: "aimed", count: 3, speed: 240, spread: 16, repeat: { times: 3, intervalSec: 0.25 } },
  ]),

  /* ── S2 잔해 골렘 — 파편 산탄 ────────────────────────────── */
  "b2.shrapnel": P("b2.shrapnel", 2.6, [
    { at: 0, type: "random", count: 14, speed: 200 },
    { at: 1.3, type: "ring", count: 12, speed: 170 },
  ]),

  /* ── S3 시그널 이터 — 유도탄 + 링 확산 ───────────────────── */
  "b3.ringburst": P("b3.ringburst", 3, [
    { at: 0, type: "ring", count: 16, speed: 150 },
    { at: 0.8, type: "ring", count: 16, speed: 190, angle: 11 },
    { at: 1.8, type: "aimed", count: 5, speed: 260, spread: 24 },
  ]),

  /* ── S4 월 가디언 — 이동 레이저 3줄 (예고선 필수) ─────────── */
  "b4.laser3": P("b4.laser3", 3.4, [
    { at: 0, type: "laser", count: 3, speed: 0, spread: 120, warnSec: 0.6 },
    { at: 2, type: "fan", count: 7, speed: 180, spread: 90 },
  ]),

  /* ── S5 스웜 퀸 — 십자탄 ─────────────────────────────────── */
  "b5.cross": P("b5.cross", 2.4, [
    { at: 0, type: "ring", count: 4, speed: 210 },
    { at: 0.4, type: "ring", count: 4, speed: 210, angle: 45 },
    { at: 1.2, type: "aimed", count: 3, speed: 230, spread: 20 },
  ]),

  /* ── S6 프로스트 링 — 회전 얼음탄 ────────────────────────── */
  "b6.spiral": P("b6.spiral", 4, [
    { at: 0, type: "spiral", count: 3, speed: 170, repeat: { times: 20, intervalSec: 0.12, rotateDeg: 17 } },
  ]),

  /* ── S7 드릴 헤드 — 돌진 + 파편 ──────────────────────────── */
  "b7.drill": P("b7.drill", 3, [
    { at: 0, type: "fan", count: 9, speed: 230, spread: 60 },
    { at: 1.5, type: "random", count: 12, speed: 260 },
  ]),

  /* ── S8 옵저버 — 추적 레이저 + 나선탄 ────────────────────── */
  "b8.trackLaser": P("b8.trackLaser", 3.6, [
    { at: 0, type: "laser", count: 1, speed: 0, warnSec: 0.6 },
    { at: 1.2, type: "spiral", count: 2, speed: 190, repeat: { times: 14, intervalSec: 0.14, rotateDeg: 23 } },
  ]),

  /* ── S9 미러 코어 — 벽 반사 탄막 ─────────────────────────── */
  "b9.bounce": P("b9.bounce", 3, [
    { at: 0, type: "fan", count: 11, speed: 200, spread: 150 },
    { at: 1.4, type: "ring", count: 20, speed: 160 },
  ]),

  /* ── S10 보이드 — 은신 후 전방위 기습 ────────────────────── */
  "b10.ambush": P("b10.ambush", 3.4, [
    { at: 1.6, type: "ring", count: 26, speed: 230 },
    { at: 2.4, type: "aimed", count: 5, speed: 280, spread: 30 },
  ]),

  /* ── S11 익스플로잇 — 랜덤 ───────────────────────────────── */
  "b11.random": P("b11.random", 2.6, [
    { at: 0, type: "random", count: 18, speed: 210 },
    { at: 1.2, type: "fan", count: 9, speed: 240, spread: 100 },
  ]),

  /* ── S12 웜홀 코어 — 순간이동 + 나선 ─────────────────────── */
  "b12.vortex": P("b12.vortex", 4.2, [
    { at: 0, type: "spiral", count: 4, speed: 160, repeat: { times: 24, intervalSec: 0.1, rotateDeg: 13 } },
    { at: 3, type: "ring", count: 24, speed: 200 },
  ]),

  /* ── S13 마이너 로드 — 밀집 산탄 ─────────────────────────── */
  "b13.dense": P("b13.dense", 2.8, [
    { at: 0, type: "fan", count: 13, speed: 190, spread: 70, repeat: { times: 3, intervalSec: 0.3 } },
  ]),

  /* ── S14 APT 핸들러 — 혼합 ───────────────────────────────── */
  "b14.mix": P("b14.mix", 4, [
    { at: 0, type: "ring", count: 18, speed: 180 },
    { at: 1.2, type: "laser", count: 2, speed: 0, spread: 90, warnSec: 0.6 },
    { at: 2.6, type: "spiral", count: 2, speed: 200, repeat: { times: 10, intervalSec: 0.12, rotateDeg: 27 } },
  ]),

  /* ── S15 루트 스타 — 3페이즈 최종전 ──────────────────────── */
  "b15.p1": P("b15.p1", 3.6, [
    { at: 0, type: "spiral", count: 3, speed: 180, repeat: { times: 18, intervalSec: 0.11, rotateDeg: 19 } },
    { at: 2.6, type: "ring", count: 20, speed: 200 },
  ]),
  "b15.p2": P("b15.p2", 3.8, [
    { at: 0, type: "laser", count: 4, speed: 0, spread: 150, warnSec: 0.6 },
    { at: 2.2, type: "fan", count: 11, speed: 220, spread: 120 },
  ]),
  "b15.p3": P("b15.p3", 3, [
    { at: 0, type: "ring", count: 30, speed: 210 },
    { at: 1, type: "ring", count: 30, speed: 180, angle: 6 },
    { at: 2, type: "aimed", count: 7, speed: 300, spread: 40 },
  ]),
};

export const PATTERN_IDS = Object.keys(PATTERNS);
