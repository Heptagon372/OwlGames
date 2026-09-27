// 아울러닝 상태 기계 — 렌더와 분리된 순수 로직 (기획서 §14 + 2.0)
//
// 2.0 루프: 날아감 → 회피·색 PERFECT → 콤보·FEVER 게이지 → 아이템 욕심 → NEAR MISS
//          → FEVER · COLOR POWER 로 폭발 → 레이저·미사일·중력 반전으로 위기 → 에너지 0 → 3초 추락 → "살았다!"
import {
  CFG,
  FINAL_STAGE,
  type Color,
  type SizeKey,
  infiniteLevel,
  isOverdrive,
  nextColor,
  phaseFromMeters,
  scrollFromMeters,
  stageDef,
  stageFromMeters,
  warnMult,
} from "../config";
import { msg, ref, type Msg } from "@/games/core/i18n";
import type { DeathCause, Entity, FlightStats, ItemKind, TriggerEvent, ZoneKind } from "../types";
import { bugY, ellipseRectDistance, isNearMiss, isSolid, solidRects } from "./collision";
import * as Energy from "./energy";
import {
  buildBarrage,
  buildLasers,
  laserHits,
  laserState,
  newMissile,
  stepMissile,
  type Laser,
  type Missile,
} from "./hazards";
import { clamp, growSize, hitbox, shrinkSize, stepPhysics } from "./owl";
import { drainMultFromMeters, stageKey, stageTag } from "./phases";
import * as Score from "./score";
import { createSpawner, type SpawnedEntity, type Spawner } from "./spawner";

export type Input = {
  flap: boolean;
  cycle: boolean;
  color: Color | null;
  /** Q / 스킬 버튼 — COLOR POWER 발동 */
  skill?: boolean;
  /** 선택형 보상 1·2·3 (0부터) */
  pick?: number | null;
};

export type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; r: number };

/**
 * 부엉이 주변에서 튀어나오는 숫자·단어 (PERFECT! +100 …) — 아케이드 영어라 번역하지 않는다.
 * `art`가 있으면 리소스 시트의 문구 그림(PERFECT! · NEAR MISS! · COMBO · FEVER!)으로 그리고 `text`는 그 아래 작은 글씨.
 */
export type PopupArt = "perfect" | "near" | "combo" | "fever";
export type Popup = {
  text: string;
  x: number;
  y: number;
  color: string;
  life: number;
  max: number;
  big: boolean;
  art?: PopupArt;
  /** COMBO ×n 의 n */
  n?: number;
};

/** 부엉이 표정·자세 (캐릭터 시트 그림) — 잠깐 동안만 기본 색 그림 대신 보인다 */
export type PoseKind = "hit" | "dizzy" | "revive" | "victory" | "happy" | "energy" | "score" | "golden" | "turbo";

/** 먹은 아이템이 커지며 사라지는 잔상 (렌더 전용 데이터) */
export type Pickup = { kind: ItemKind; x: number; y: number; life: number; max: number };

/** 엔진은 문구 대신 메시지 키를 담는다 (`games/core/i18n.ts`) */
export type Banner = { m: Msg; sub?: Msg; until: number; tone?: "stage" | "danger" | "good" | "legend" } | null;

export type GameStatus = "ready" | "playing" | "falling" | "dead";

export type SkillKind = "breaker" | "freeze" | "phantom";

export type ChoiceId = "energy" | "score" | "shield" | "magnet" | "fever" | "power" | "rainbow";

/** 효과음 신호 — index.tsx 가 매 프레임 읽고 지운다 */
export const CUE = {
  perfect: 1 << 0,
  near: 1 << 1,
  item: 1 << 2,
  legend: 1 << 3,
  hit: 1 << 4,
  mismatch: 1 << 5,
  warn: 1 << 6,
  fire: 1 << 7,
  lock: 1 << 8,
  boom: 1 << 9,
  stage: 1 << 10,
  fever: 1 << 11,
  powerReady: 1 << 12,
  power: 1 << 13,
  choice: 1 << 14,
  death: 1 << 15,
  revive: 1 << 16,
  chain: 1 << 17,
} as const;

export type Game = {
  status: GameStatus;
  time: number;
  worldX: number;
  meters: number;
  scroll: number;

  y: number;
  vy: number;
  /** 지금 날갯짓 중인가 (날갯짓/활공 애니메이션) */
  flapping: boolean;
  size: SizeKey;
  sizeTween: number;
  color: Color;
  colorCd: number;
  /** 색을 바꾼 직후 연출 (남은 초) */
  swapT: number;
  /** 잠깐 보이는 자세 (남은 초) */
  pose: { k: PoseKind; t: number } | null;
  iFrame: number;
  /** 🛡️ 남은 보호막 겹 수 */
  shields: number;
  rainbow: number;
  slow: number;
  edgeCd: number;

  energy: Energy.EnergyState;
  score: Score.ScoreState;
  phaseMax: number;
  /** 2.0 — 현재 단계 (16 이상 = ∞) */
  stage: number;
  stageMax: number;
  deathCause: DeathCause;
  deathAt: number;
  fallT: number;
  /** 🦉 아울 에너지를 주웠는지 (제출 메타로 서버에 보낸다) */
  owlEnergyFound: boolean;

  // ── 2.0 환경 ──
  /** 1 = 보통, -1 = 중력 반전 */
  grav: 1 | -1;
  /** 중력이 곧 바뀐다는 경고 (남은 초, 0이면 없음) · 바뀔 방향 */
  gravWarn: number;
  gravNext: 1 | -1;
  zone: ZoneKind | null;
  /** 파동 세기 0~1 (화면 출렁임) */
  wave: number;
  waveT: number;
  /** 폭풍 — 남은 초 · 현재 바람 가속 · 다음 방향 전환까지 */
  windT: number;
  wind: number;
  windFlipT: number;
  lasers: Laser[];
  missiles: Missile[];
  missileCd: number;
  /** LASER WARNING 이벤트 붉은 화면 (남은 초) */
  redAlert: number;

  // ── 2.0 보상 ──
  popups: Popup[];
  pickups: Pickup[];
  fever: number;
  feverT: number;
  /** COLOR POWER 충전 (PERFECT 연속 수) · 발동 가능 여부 */
  power: number;
  powerReady: boolean;
  skill: SkillKind | null;
  skillT: number;
  /** 색 PERFECT 연속 */
  colorChain: number;
  /** NEAR MISS 연속 · 마지막 니어미스 시각 */
  nearChain: number;
  nearAt: number;
  magnetT: number;
  doubleT: number;
  breakerT: number;
  phantomT: number;
  turboT: number;
  overdrive: boolean;
  phantomWorldT: number;
  colorChaosT: number;
  colorChaosCd: number;
  glitchT: number;
  featherRainT: number;
  featherRainCd: number;
  featherRainN: number;
  /** 색 체인 세트피스 진행 (id → 끊겼는지·맞힌 수) */
  chains: Record<number, { broken: boolean; got: number }>;
  choice: { options: ChoiceId[]; t: number } | null;
  cues: number;

  banner: Banner;
  flash: number;
  /** 화면 플래시 색 (기본 빨강) */
  flashColor: string;
  shake: number;
  particles: Particle[];
  spawner: Spawner;
  rand: () => number;
  /** 화면에 표시할 다음 게이트 색 (글리치 게이트는 겉보기 색) */
  nextGate: Color | null;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createGame(seed = Date.now()): Game {
  const rand = mulberry32(seed);
  return {
    status: "ready",
    time: 0,
    worldX: 0,
    meters: 0,
    scroll: CFG.scroll.v0,
    y: CFG.view.h / 2,
    vy: 0,
    flapping: false,
    size: "M",
    sizeTween: 1,
    color: "R",
    colorCd: 0,
    swapT: 0,
    pose: null,
    iFrame: 0,
    shields: CFG.beginner.shield,
    rainbow: 0,
    slow: 0,
    edgeCd: 0,
    energy: Energy.initEnergy("M"),
    score: Score.initScore(),
    phaseMax: 0,
    stage: 1,
    stageMax: 1,
    deathCause: null,
    deathAt: 0,
    fallT: 0,
    owlEnergyFound: false,
    grav: 1,
    gravWarn: 0,
    gravNext: 1,
    zone: null,
    wave: 0,
    waveT: 0,
    windT: 0,
    wind: 0,
    windFlipT: 0,
    lasers: [],
    missiles: [],
    missileCd: CFG.missile.interval * 0.6,
    redAlert: 0,
    popups: [],
    pickups: [],
    fever: 0,
    feverT: 0,
    power: 0,
    powerReady: false,
    skill: null,
    skillT: 0,
    colorChain: 0,
    nearChain: 0,
    nearAt: -99,
    magnetT: 0,
    doubleT: 0,
    breakerT: 0,
    phantomT: 0,
    turboT: 0,
    overdrive: false,
    phantomWorldT: 0,
    colorChaosT: 0,
    colorChaosCd: 0,
    glitchT: 0,
    featherRainT: 0,
    featherRainCd: 0,
    featherRainN: 0,
    chains: {},
    choice: null,
    cues: 0,
    banner: { m: msg("stageTitle", { tag: stageTag(1), name: ref("stageName.flight") }), sub: msg("stageHint.flight"), until: 3, tone: "stage" },
    flash: 0,
    flashColor: "#FF4D4D",
    shake: 0,
    particles: [],
    spawner: createSpawner(rand, CFG.view.w),
    rand,
    nextGate: null,
  };
}

const OWL_X = CFG.physics.owlX;
const W = CFG.view.w;
const H = CFG.view.h;

/* ───────────────────────── 배율 ───────────────────────── */

/** FREEZE 중에는 세상이 느리게 흐른다 (부엉이는 그대로) */
export function timeScale(g: Game): number {
  return g.skill === "freeze" ? CFG.power.freezeScale : 1;
}

/** 초보 보호 구간 (실수가 덜 아프다) */
export function isBeginner(g: Game): boolean {
  return g.stage <= CFG.beginner.untilStage;
}

/** 무적 (PHANTOM 스킬 · 💜 · 팬텀 월드) */
export function isPhantom(g: Game): boolean {
  return g.skill === "phantom" || g.phantomT > 0 || g.phantomWorldT > 0;
}

/** 부수기 (BREAKER 스킬 · 🔥) */
export function isBreaker(g: Game): boolean {
  return g.skill === "breaker" || g.breakerT > 0;
}

/** 색 PERFECT 연속 배율 (8단계부터) */
export function chainMult(g: Game): number {
  if (g.stageMax < CFG.power.fromStage) return 1;
  if (g.colorChain >= CFG.colorChain.x2) return 2;
  if (g.colorChain >= CFG.colorChain.x15) return 1.5;
  return 1;
}

/** 지금 점수에 곱해지는 배율 (FEVER ×3 · SCORE ×2 · OVERDRIVE ×2 · 색 체인) */
export function scoreMult(g: Game): number {
  const m =
    (g.feverT > 0 ? CFG.fever.scoreMult : 1) *
    (g.doubleT > 0 ? 2 : 1) *
    (g.overdrive ? CFG.overdrive.scoreMult : 1) *
    chainMult(g);
  return Math.min(CFG.multCap, m);
}

function itemMult(g: Game): number {
  return Math.min(
    CFG.multCap,
    scoreMult(g) * (g.turboT > 0 ? CFG.events.turboItemMult : 1) * (g.phantomWorldT > 0 ? CFG.events.phantomWorldItemMult : 1),
  );
}

function turboMult(g: Game): number {
  if (g.turboT <= 0) return 1;
  const [a, b] = CFG.events.turboMult;
  return g.turboT > CFG.events.turboSec - 2 ? a : b;
}

/* ───────────────────────── 한 프레임 ───────────────────────── */

export function update(g: Game, dt: number, input: Input): void {
  if (g.status === "dead") {
    g.deathAt += dt;
    tickEffects(g, dt);
    return;
  }
  // 선택형 보상 — 세상이 멈춘다
  if (g.choice) {
    g.choice.t -= dt;
    const pick = input.pick ?? (g.choice.t <= 0 ? 0 : null);
    if (pick !== null && pick !== undefined && g.choice.options[pick]) applyChoice(g, g.choice.options[pick]);
    tickPopups(g, dt);
    return;
  }
  if (g.status === "ready") {
    if (!input.flap) {
      tickEffects(g, dt);
      return;
    }
    g.status = "playing";
  }

  const ts = timeScale(g);
  g.time += dt;

  // ── 단계 ────────────────────────────────────────────────
  const phase = phaseFromMeters(g.meters);
  if (phase > g.phaseMax) g.phaseMax = phase;
  const stage = stageFromMeters(g.meters);
  if (stage > g.stage) enterStage(g, stage);
  const od = isOverdrive(g.meters);
  if (od && !g.overdrive) {
    g.banner = { m: msg("overdrive"), sub: msg("overdriveSub"), until: g.time + 2.5, tone: "danger" };
    setPose(g, "turbo", 0.8);
    g.shake = Math.max(g.shake, 0.4);
    g.cues |= CUE.stage;
  }
  g.overdrive = od;

  // ── 스크롤 ──────────────────────────────────────────────
  const base = scrollFromMeters(g.meters) * turboMult(g) * (g.overdrive ? CFG.overdrive.scrollMult : 1);
  g.scroll = base * (g.slow > 0 ? CFG.color.failSlow : 1) * ts;
  g.worldX += g.scroll * dt;
  const prevMeters = g.meters;
  g.meters = g.worldX / CFG.physics.pxPerMeter;
  // 터보·오버드라이브 거리 ×2
  const distMult = (g.turboT > 0 ? 2 : 1) * (g.overdrive ? 2 : 1);
  if (distMult > 1) g.score.bonusScore += (g.meters - prevMeters) * (Math.min(4, distMult) - 1);

  // ── 버프 타이머 ─────────────────────────────────────────
  tickTimers(g, dt);

  // ── 입력: 색 변경 · 스킬 ────────────────────────────────
  g.colorCd = Math.max(0, g.colorCd - dt);
  const wanted = input.color ?? (input.cycle ? nextColor(g.color) : null);
  if (wanted && wanted !== g.color && g.colorCd <= 0) {
    g.color = wanted;
    g.colorCd = CFG.color.cycleCooldown;
    g.swapT = SWAP_SEC;
    Energy.add(g.energy, -CFG.energy.colorCost);
  }
  if (input.skill && g.powerReady) activateSkill(g);

  // ── 구역(파동·중력 반전) ────────────────────────────────
  applyZones(g, dt);

  // ── 물리 ────────────────────────────────────────────────
  const canFlap = g.status === "playing" && g.energy.value > 0;
  const flapping = input.flap && canFlap;
  g.flapping = flapping;
  const flapMult = Energy.isLow(g.energy) ? CFG.energy.lowFlapMult : 1;
  const waveAccel = g.zone === "wave" ? CFG.wave.accel * Math.sin((2 * Math.PI * g.waveT) / CFG.wave.period) : 0;
  const p = stepPhysics({ y: g.y, vy: g.vy }, flapping, dt, flapMult, g.grav, waveAccel + g.wind);
  g.y = p.y;
  g.vy = p.vy;
  if (flapping) {
    Energy.drainFlap(g.energy, dt, drainMultFromMeters(g.meters) * (g.feverT > 0 ? CFG.fever.drainMult : 1));
  }
  if (g.overdrive && g.status === "playing") Energy.add(g.energy, -CFG.overdrive.drainPerSec * dt);
  Energy.tickBuffs(g.energy, dt);

  // 천장·바닥 — 즉사 아님, 에너지 -10 + 튕김 (§2). 추락 중 "땅"(중력 쪽)에 닿으면 끝
  const { rx, ry } = hitbox(g.size);
  g.edgeCd = Math.max(0, g.edgeCd - dt);
  if (g.y < ry || g.y > H - ry) {
    const atFloor = g.y > H - ry;
    g.y = clamp(g.y, ry, H - ry);
    g.vy = atFloor ? -60 : 60;
    if (g.edgeCd <= 0) {
      g.edgeCd = 0.6;
      if (!isPhantom(g)) {
        Energy.add(g.energy, -(isBeginner(g) ? CFG.beginner.edgeHit : CFG.energy.edgeHit));
        if (g.feverT <= 0) Score.breakCombo(g.score);
        g.flash = 0.15;
        g.flashColor = "#FF4D4D";
      }
    }
    const atGround = g.grav === 1 ? atFloor : !atFloor;
    if (g.status === "falling" && atGround) return die(g, "energy");
  }

  // ── 스폰·컬링 ───────────────────────────────────────────
  g.spawner.ensure(g.worldX);
  g.spawner.cull(g.worldX);

  // ── 엔티티 판정 ─────────────────────────────────────────
  g.iFrame = Math.max(0, g.iFrame - dt);
  g.rainbow = Math.max(0, g.rainbow - dt);
  g.slow = Math.max(0, g.slow - dt);
  g.sizeTween = Math.min(1, g.sizeTween + dt / CFG.size.changeTweenSec);
  g.nextGate = null;

  for (const s of g.spawner.entities) {
    if (s.gone) continue;
    const sx = s.x - g.worldX;
    const right = sx + s.w;
    const e = s.e;

    if (e.t === "trigger") {
      if (!s.fired && sx <= OWL_X) {
        s.fired = true;
        fireTrigger(g, e.ev);
      }
      continue;
    }
    if (e.t === "zone") continue;

    if (e.t === "gate") {
      const shown = gateColor(s, sx, g.scroll / Math.max(ts, 0.01));
      // 예고 칩: 앞쪽 previewSec 안에 들어온 첫 게이트
      const previewDist = (g.stage >= 12 ? CFG.color.previewSecLate : CFG.color.previewSec) * g.scroll;
      if (!g.nextGate && !s.judged && sx > OWL_X && sx - OWL_X < previewDist) g.nextGate = shown;

      if (!s.judged && sx <= OWL_X + rx && right >= OWL_X - rx) {
        // 게이트 세로 범위 안에 있을 때만 판정
        if (g.y >= e.y && g.y <= e.y + e.h) {
          s.judged = true;
          if (g.rainbow > 0 || isPhantom(g) || g.color === e.color) onPerfect(g, s);
          else onMismatch(g, s);
        }
      }
    } else if (e.t === "item") {
      collectCheck(g, s, sx, rx, dt);
      continue;
    } else if (right > OWL_X - rx - 4 && sx < OWL_X + rx + 4) {
      const t = (OWL_X + g.worldX - s.chunkX) / s.chunkScroll;
      let minD = Infinity;
      for (const r of solidRects(e, sx, g.size, t)) {
        minD = Math.min(minD, ellipseRectDistance(OWL_X, g.y, rx, ry, r));
      }
      s.minDist = Math.min(s.minDist ?? Infinity, minD);
      if (minD === 0) {
        if (e.t === "wall" && g.size === "L") {
          // L 전용 파괴 벽 — 벽돌이 부서진다
          smash(g, s, CFG.score.breakWall, "SMASH!");
          g.banner = { m: msg("smash"), sub: msg("plusScore", { n: CFG.score.breakWall }), until: g.time + 1, tone: "good" };
        } else if (isBreaker(g)) {
          smash(g, s, CFG.power.breakScore, "BREAK!");
        } else if (isPhantom(g) || g.iFrame > 0) {
          // 무적 중 — 통과
        } else if (g.shields > 0) {
          g.shields -= 1;
          g.iFrame = CFG.color.iFrame;
          s.gone = e.t === "bug";
          g.flash = 0.2;
          g.flashColor = "#3DD9EB";
          g.shake = 0.25;
          burst(g, OWL_X, g.y, "#3DD9EB", 20);
          popup(g, "SHIELD!", "#3DD9EB", true);
        } else {
          return die(g, "wall");
        }
      }
    }

    // 통과 처리
    if (!s.passed && right < OWL_X - rx) {
      s.passed = true;
      const scoring = isSolid(e) || (e.t === "gate" && !s.touched);
      if (scoring) {
        const gained = Score.onPass(g.score, scoreMult(g));
        Energy.add(g.energy, CFG.energy.passGain);
        addFever(g, CFG.fever.gain.pass);
        if (isSolid(e) && s.minDist !== undefined && isNearMiss(s.minDist)) onNearMiss(g);
        else if (e.t !== "gate" && g.score.combo % 10 === 0) artPopup(g, "combo", "", "#FF5CA8", g.score.combo);
        else if (e.t !== "gate" && gained >= 20) popup(g, `+${Math.round(gained)}`, "#E9EDFB", false);
      }
    }
  }

  // ── 레이저 · 미사일 ─────────────────────────────────────
  updateHazards(g, dt * ts, rx, ry);
  if ((g.status as GameStatus) === "dead") return;

  // ── 에너지 고갈 / 추락 ──────────────────────────────────
  if (g.status === "playing" && g.energy.value <= 0) {
    g.status = "falling";
    g.fallT = CFG.energy.fallGraceSec;
    if (g.feverT <= 0) Score.breakCombo(g.score);
    g.banner = { m: msg("empty"), sub: msg("emptySub"), until: g.time + 1.2, tone: "danger" };
  } else if (g.status === "falling") {
    g.fallT -= dt;
    if (g.energy.value > 0) {
      g.status = "playing";
      g.banner = { m: msg("revive"), until: g.time + 1, tone: "good" };
      popup(g, "SAVED!", "#6BF0A0", true);
      setPose(g, "revive", 0.8);
      g.cues |= CUE.revive;
      burst(g, OWL_X, g.y, "#FFD27A", 26);
    } else if (g.fallT <= 0) {
      return die(g, "energy");
    }
  }

  tickEffects(g, dt);
}

/* ───────────────────────── 단계 ───────────────────────── */

function enterStage(g: Game, stage: number): void {
  // 지나온 단계마다 완주 보너스
  for (let s = g.stage; s < stage; s++) {
    const bonus = Score.addBonus(g.score, Math.min(s, FINAL_STAGE) * CFG.stageClear.perStage);
    popup(g, `STAGE CLEAR +${Math.round(bonus)}`, "#6BF0A0", true);
  }
  const prev = g.stage;
  setPose(g, "victory", 0.7);
  g.stage = stage;
  // 초보 보호 — 초반 단계마다 보호막 1겹 다시 채우기
  if (stage <= CFG.beginner.untilStage) g.shields = Math.max(g.shields, CFG.beginner.shield);
  g.stageMax = Math.max(g.stageMax, stage);
  g.shake = Math.max(g.shake, 0.25);
  g.cues |= CUE.stage;
  const key = stageKey(stage);
  if (stage === FINAL_STAGE + 1 && prev <= FINAL_STAGE) {
    Score.addBonus(g.score, CFG.infinite.enterBonus);
    popup(g, `∞ +${CFG.infinite.enterBonus}`, "#FFB020", true);
    g.banner = { m: msg("infiniteIn"), sub: msg("infiniteSub"), until: g.time + 3, tone: "legend" };
    burst(g, OWL_X, g.y, "#FFB020", 30);
  } else if (key === "infinite") {
    g.banner = { m: msg("infiniteLevel", { level: infiniteLevel(stage) }), sub: msg("infiniteLevelSub"), until: g.time + 2.2, tone: "stage" };
  } else {
    g.banner = {
      m: msg("stageTitle", { tag: stageTag(stage), name: ref(`stageName.${key}`) }),
      sub: msg(`stageHint.${key}`),
      until: g.time + 3,
      tone: "stage",
    };
  }
  const inf = infiniteLevel(stage);
  const atChoice =
    (CFG.choice.atStages as readonly number[]).includes(stage) ||
    (inf > 1 && (inf - 1) % CFG.choice.infiniteEvery === 0);
  if (atChoice) openChoice(g);
}

/* ───────────────────────── 선택형 보상 ───────────────────────── */

function openChoice(g: Game): void {
  const pool: ChoiceId[] = ["energy", "score", "shield", "magnet", "fever", "rainbow"];
  if (g.stageMax >= CFG.power.fromStage && !g.powerReady) pool.push("power");
  const options: ChoiceId[] = [];
  while (options.length < 3 && pool.length) {
    const i = Math.floor(g.rand() * pool.length);
    options.push(pool.splice(i, 1)[0]);
  }
  g.choice = { options, t: CFG.choice.autoSec };
  g.cues |= CUE.choice;
}

function applyChoice(g: Game, id: ChoiceId): void {
  g.choice = null;
  g.iFrame = Math.max(g.iFrame, CFG.choice.resumeIFrame);
  switch (id) {
    case "energy":
      Energy.add(g.energy, 50);
      break;
    case "score":
      g.doubleT = 12;
      break;
    case "shield":
      g.shields = CFG.shield.maxStack;
      break;
    case "magnet":
      g.magnetT = 15;
      break;
    case "fever":
      addFever(g, 60);
      break;
    case "power":
      g.power = CFG.power.need;
      setPowerReady(g);
      break;
    case "rainbow":
      g.rainbow = 8;
      break;
  }
  popup(g, "GET!", "#FFD27A", true);
  setPose(g, "happy", 0.6);
  burst(g, OWL_X, g.y, "#FFD27A", 18);
}

/* ───────────────────────── 색 · 스킬 · 피버 ───────────────────────── */

/** 글리치 게이트가 지금 보여주는 색 */
export function gateColor(s: SpawnedEntity, sx: number, scroll: number): Color {
  const e = s.e as Extract<Entity, { t: "gate" }>;
  if (!e.fake) return e.color;
  const ttr = (sx - OWL_X) / Math.max(60, scroll);
  if (ttr <= CFG.glitch.revealSec) return e.color;
  if (ttr <= CFG.glitch.revealSec + CFG.glitch.flickerSec) {
    // 깜빡임 — 진짜 색이 점점 자주 보인다
    const k = Math.floor(ttr * 14);
    return k % 3 === 0 ? e.color : e.fake;
  }
  return e.fake;
}

/** 지금 이 게이트가 글리치로 흔들리는 중인가 (렌더용) */
export function gateGlitching(s: SpawnedEntity, sx: number, scroll: number): boolean {
  const e = s.e as Extract<Entity, { t: "gate" }>;
  if (!e.fake) return false;
  const ttr = (sx - OWL_X) / Math.max(60, scroll);
  return ttr > CFG.glitch.revealSec && ttr <= CFG.glitch.revealSec + CFG.glitch.flickerSec;
}

function onPerfect(g: Game, s: SpawnedEntity): void {
  const e = s.e as Extract<Entity, { t: "gate" }>;
  g.colorChain += 1;
  const gained = Score.onPerfect(g.score, scoreMult(g));
  addFever(g, CFG.fever.gain.perfect);
  g.cues |= CUE.perfect;
  const hex = COLOR_HEX[e.color];
  if (g.colorChain >= 3 && g.stageMax >= CFG.power.fromStage && (g.colorChain === 3 || g.colorChain === 5)) {
    popup(g, `COLOR COMBO ×${g.colorChain === 3 ? "1.5" : "2"}`, hex, true);
  } else {
    artPopup(g, "perfect", `+${Math.round(gained)}`, hex);
  }
  // COLOR POWER 충전 (8단계부터)
  if (g.stageMax >= CFG.power.fromStage && !g.powerReady) {
    g.power = Math.min(CFG.power.need, g.power + 1);
    if (g.power >= CFG.power.need) setPowerReady(g);
  }
  // 색 체인 세트피스
  if (e.chain) {
    const c = (g.chains[e.chain.id] ??= { broken: false, got: 0 });
    if (!c.broken) {
      c.got += 1;
      const table = CFG.perfect.chainBonus;
      // 2번째~5번째 PERFECT 에 +100 → +150 → +200 → +300 (그 뒤로는 마지막 COLOR BURST 만)
      if (c.got >= 2 && c.got - 2 < table.length) {
        const b = Score.addBonus(g.score, table[c.got - 2], scoreMult(g));
        popup(g, `CHAIN +${Math.round(b)}`, "#FFD27A", false);
        g.cues |= CUE.chain;
      }
      if (c.got === e.chain.n) {
        // PERFECT COLOR CHAIN → COLOR BURST: 잠시 모든 색 게이트 자동 통과
        Score.addBonus(g.score, CFG.perfect.burstBonus, scoreMult(g));
        addFever(g, CFG.fever.gain.chain);
        g.rainbow = Math.max(g.rainbow, CFG.perfect.burstSec);
        g.banner = { m: msg("colorBurst"), sub: msg("colorBurstSub"), until: g.time + 2, tone: "legend" };
        burst(g, OWL_X, g.y, "#A855F7", 16);
        burst(g, OWL_X, g.y, "#3DD9EB", 16);
        burst(g, OWL_X, g.y, "#FF4D4D", 16);
      }
    }
  }
}

function onMismatch(g: Game, s: SpawnedEntity): void {
  const e = s.e as Extract<Entity, { t: "gate" }>;
  // 색 불일치 — 죽지 않는다 (§4). 초반엔 덜 아프고 감속도 없다
  const beginner = isBeginner(g);
  Energy.add(g.energy, -(beginner ? CFG.beginner.gateFail : CFG.energy.gateFail));
  if (g.feverT <= 0) Score.breakCombo(g.score);
  g.colorChain = 0;
  if (!g.powerReady) g.power = 0;
  if (!beginner) g.slow = CFG.color.failSlowSec;
  g.iFrame = Math.max(g.iFrame, CFG.color.iFrame);
  g.flash = 0.25;
  g.flashColor = "#FF4D4D";
  g.shake = 0.2;
  burst(g, OWL_X, g.y, "#FF4D4D", 14);
  s.touched = true;
  setPose(g, "dizzy", 0.5);
  if (e.chain) (g.chains[e.chain.id] ??= { broken: true, got: 0 }).broken = true;
  popup(g, e.fake ? "GLITCH!" : "MISS", "#FF5C7A", true);
  g.cues |= CUE.mismatch;
}

function setPowerReady(g: Game): void {
  if (g.powerReady) return;
  g.powerReady = true;
  g.cues |= CUE.powerReady;
  g.banner = { m: msg("powerReady"), sub: msg("powerReadySub"), until: g.time + 2.2, tone: "legend" };
  popup(g, "COLOR POWER!", "#FFD27A", true);
}

/** 현재 색에 따라 스킬이 달라진다 — 🔴 BREAKER · 🔵 FREEZE · 🟣 PHANTOM */
export function skillOf(color: Color): SkillKind {
  return color === "R" ? "breaker" : color === "B" ? "freeze" : "phantom";
}

function activateSkill(g: Game): void {
  const kind = skillOf(g.color);
  g.powerReady = false;
  g.power = 0;
  g.skill = kind;
  g.skillT = kind === "breaker" ? CFG.power.breakerSec : kind === "freeze" ? CFG.power.freezeSec : CFG.power.phantomSec;
  g.score.powerCount += 1;
  g.cues |= CUE.power;
  g.shake = 0.35;
  g.flash = 0.2;
  g.flashColor = COLOR_HEX[g.color];
  g.banner = { m: msg(`skill.${kind}`), sub: msg(`skillSub.${kind}`), until: g.time + 1.6, tone: "legend" };
  burst(g, OWL_X, g.y, COLOR_HEX[g.color], 30);
  if (kind === "breaker") {
    // 화면 앞 장애물 전부 파괴
    for (const s of g.spawner.entities) {
      if (s.gone || !isSolid(s.e)) continue;
      const sx = s.x - g.worldX;
      if (sx + s.w > OWL_X - 20 && sx < OWL_X + CFG.power.breakerReach) smash(g, s, CFG.power.breakScore, "BREAK!");
    }
    g.lasers.length = 0;
    for (const m of g.missiles) m.dead = true;
  }
}

function addFever(g: Game, n: number): void {
  if (g.feverT > 0 || g.status !== "playing") return;
  g.fever = Math.min(100, g.fever + n);
  if (g.fever >= 100) startFever(g);
}

function startFever(g: Game): void {
  g.fever = 0;
  g.feverT = CFG.fever.sec;
  g.score.feverCount += 1;
  setPose(g, "golden", 0.9);
  g.cues |= CUE.fever;
  g.banner = { m: msg("fever"), sub: msg("feverSub"), until: g.time + 2.2, tone: "legend" };
  g.shake = 0.35;
  burst(g, OWL_X, g.y, "#FFB020", 30);
  artPopup(g, "fever", "OWL FEVER", "#FFB020");
}

function onNearMiss(g: Game): void {
  g.nearChain = g.time - g.nearAt <= CFG.nearChain.window ? g.nearChain + 1 : 1;
  g.nearAt = g.time;
  const danger = g.nearChain >= CFG.nearChain.danger ? CFG.nearChain.dangerMult : 1;
  const gained = Score.onNearMiss(g.score, scoreMult(g) * danger);
  Energy.add(g.energy, CFG.energy.nearGain);
  addFever(g, CFG.fever.gain.near);
  g.cues |= CUE.near;
  burst(g, OWL_X - 10, g.y, "#6BF0A0", 8);
  if (g.nearChain === CFG.nearChain.danger) popup(g, "DANGER BONUS ×1.5", "#FF5C7A", true);
  else if (g.nearChain === CFG.nearChain.fever) {
    artPopup(g, "fever", "", "#FFB020");
    addFever(g, CFG.fever.gain.nearChain5);
  } else artPopup(g, "near", `+${Math.round(gained)}`, "#3DD9EB");
}

/* ───────────────────────── 아이템 ───────────────────────── */

function collectCheck(g: Game, s: SpawnedEntity, sx: number, rx: number, dt: number): void {
  const e = s.e as Extract<Entity, { t: "item" }>;
  const cx = sx + CFG.entity.itemR;
  const cy = s.fy ?? e.y;
  // 떨어지는 깃털
  if (s.fy !== undefined) s.fy += (s.fvy ?? 200) * dt;
  // 전설 아이템 등장 알림
  if (!s.announced && sx < W - 30 && Score.ITEM_TIER[e.kind] === "legendary") {
    s.announced = true;
    g.popups.push({ text: "★ LEGENDARY ★", x: cx, y: cy - 36, color: "#FFB020", life: 1.2, max: 1.2, big: true });
    g.cues |= CUE.legend;
  }
  const d = Math.hypot(cx - OWL_X, cy - g.y);
  // 🟡 황금 부엉이는 자석으로 못 끈다 — 직접 몸으로 부딪혀야 한다
  if (e.kind === "golden") {
    if (d <= CFG.entity.itemR + rx * 0.9) take(g, s, e.kind);
    return;
  }
  const bigMagnet = g.magnetT > 0 || g.feverT > 0 ? Math.max(CFG.buff.magnetR, CFG.fever.magnet) : 0;
  if (d <= CFG.size.magnet[g.size]) {
    take(g, s, e.kind);
  } else if (s.pulled || (bigMagnet && d <= bigMagnet)) {
    // 자석 — 부엉이 쪽으로 빨려 온다
    s.pulled = true;
    const k = Math.min(1, (900 * dt) / Math.max(1, d));
    s.x += (OWL_X - cx) * k;
    if (s.fy !== undefined) s.fy += (g.y - cy) * k;
    else s.fy = cy + (g.y - cy) * k;
    s.fvy = 0;
  }
}

function take(g: Game, s: SpawnedEntity, kind: ItemKind): void {
  s.gone = true;
  const sx = s.x - g.worldX + CFG.entity.itemR;
  const sy = s.fy ?? (s.e as Extract<Entity, { t: "item" }>).y;
  g.pickups.push({ kind, x: sx, y: sy, life: 0.4, max: 0.4 });
  if (g.pickups.length > 16) g.pickups.shift();
  const mult = itemMult(g);
  let gained = Score.onItem(g.score, kind, mult);
  addFever(g, CFG.fever.gain.item);
  // 깃털 비 연속 획득 +10 → +20 → +30 → +50
  if (g.featherRainT > 0 && kind === "feather") {
    const table = CFG.events.featherRainScore;
    gained += Score.addBonus(g.score, table[Math.min(table.length - 1, g.featherRainN)], mult);
    g.featherRainN += 1;
  }
  const tier = Score.ITEM_TIER[kind];
  g.cues |= tier === "legendary" ? CUE.legend : CUE.item;
  if (kind === "golden") setPose(g, "golden", 0.8);
  else if (kind === "feather" || kind === "bigFeather" || kind === "efficiency" || kind === "owlEnergy") setPose(g, "energy", 0.4);
  else if (kind === "gem" || kind === "star" || kind === "double") setPose(g, "score", 0.4);
  collectItem(g, kind);
  const label = ITEM_LABEL[kind];
  popup(g, label ? `${label} +${Math.round(gained)}` : `+${Math.round(gained)}`, tier === "legendary" ? "#FFB020" : "#FFD27A", tier !== "common");
}

const ITEM_LABEL: Partial<Record<ItemKind, string>> = {
  magnet: "MAGNET",
  double: "SCORE ×2",
  rage: "RAGE",
  phantom: "PHANTOM",
  crown: "CROWN",
  golden: "GOLDEN OWL",
  shield: "SHIELD",
  rainbow: "RAINBOW",
  gem: "CRYSTAL",
};

function collectItem(g: Game, kind: ItemKind): void {
  switch (kind) {
    case "feather":
      Energy.add(g.energy, g.status === "falling" ? CFG.energy.reviveTo : CFG.energy.feather);
      break;
    case "bigFeather":
      Energy.add(g.energy, g.status === "falling" ? CFG.energy.reviveTo : CFG.energy.bigFeather);
      break;
    case "grow":
      changeSize(g, growSize(g.size));
      break;
    case "shrink":
      changeSize(g, shrinkSize(g.size));
      break;
    case "shield":
      g.shields = Math.min(CFG.shield.maxStack, g.shields + 1);
      break;
    case "efficiency":
      g.energy.efficiency = CFG.energy.efficiencySec;
      break;
    case "rainbow":
      g.rainbow = CFG.rainbow.sec;
      break;
    case "owlEnergy":
      g.owlEnergyFound = true;
      g.banner = { m: msg("owlEnergy"), sub: msg("owlEnergySub"), until: g.time + 2.5, tone: "good" };
      burst(g, OWL_X, g.y, "#3DD9EB", 22);
      break;
    case "magnet":
      g.magnetT = CFG.buff.magnetSec;
      break;
    case "double":
      g.doubleT = CFG.buff.doubleSec;
      break;
    case "rage":
      g.breakerT = CFG.buff.rageSec;
      g.banner = { m: msg("legend.rage"), until: g.time + 1.5, tone: "legend" };
      break;
    case "phantom":
      g.phantomT = CFG.buff.phantomSec;
      g.banner = { m: msg("legend.phantom"), until: g.time + 1.5, tone: "legend" };
      break;
    case "crown":
      g.banner = { m: msg("legend.crown"), until: g.time + 1.5, tone: "legend" };
      startFever(g);
      break;
    case "golden":
      g.flash = 0.3;
      g.flashColor = "#FFB020";
      g.shake = 0.3;
      burst(g, OWL_X, g.y, "#FFB020", 36);
      break;
    case "gem":
    case "star":
      break;
  }
  burst(g, OWL_X, g.y, "#FFD27A", 10);
}

function changeSize(g: Game, size: SizeKey): void {
  if (size === g.size) return;
  g.size = size;
  Energy.setSize(g.energy, size);
  g.sizeTween = 0;
  g.iFrame = Math.max(g.iFrame, CFG.size.changeIFrame);
}

/* ───────────────────────── 이벤트 · 구역 ───────────────────────── */

function fireTrigger(g: Game, ev: TriggerEvent): void {
  const wm = warnMult(g.stage);
  switch (ev.k) {
    case "laser": {
      g.lasers.push(...buildLasers(ev.pattern, ev.ys, wm));
      g.cues |= CUE.warn;
      if (ev.pattern === "event") {
        g.redAlert = CFG.laser.eventWarn * wm + 0.8;
        g.score.events += 1;
        g.banner = { m: msg("event.laser"), sub: msg("eventSub.laser"), until: g.time + 2, tone: "danger" };
      }
      break;
    }
    case "barrage":
      g.lasers.push(...buildBarrage(ev.order, wm));
      g.cues |= CUE.warn;
      g.banner = { m: msg("barrage"), sub: msg("barrageSub"), until: g.time + 1.6, tone: "danger" };
      break;
    case "missile":
      for (let i = 0; i < ev.count; i++) g.missiles.push(newMissile(i * 0.7, g.y));
      g.cues |= CUE.lock;
      break;
    case "featherRain":
      g.featherRainT = CFG.events.featherRainSec;
      g.featherRainN = 0;
      g.featherRainCd = 0;
      startEvent(g, "featherRain", "good");
      break;
    case "storm":
      g.windT = CFG.wind.sec;
      g.windFlipT = 0.6;
      g.wind = 0;
      startEvent(g, "storm", "danger");
      break;
    case "phantomWorld":
      g.phantomWorldT = CFG.events.phantomWorldSec;
      startEvent(g, "phantomWorld", "legend");
      break;
    case "turbo":
      g.turboT = CFG.events.turboSec;
      startEvent(g, "turbo", "danger");
      setPose(g, "turbo", 0.8);
      break;
    case "colorChaos":
      g.colorChaosT = CFG.events.colorChaosSec;
      g.colorChaosCd = CFG.events.colorChaosEvery;
      startEvent(g, "colorChaos", "danger");
      break;
    case "glitch":
      g.glitchT = CFG.events.glitchSec;
      startEvent(g, "glitch", "danger");
      break;
    case "golden":
      startEvent(g, "golden", "legend");
      break;
  }
}

function startEvent(g: Game, key: string, tone: "danger" | "good" | "legend"): void {
  g.score.events += 1;
  g.banner = { m: msg(`event.${key}`), sub: msg(`eventSub.${key}`), until: g.time + 2.2, tone };
  g.shake = Math.max(g.shake, 0.2);
  g.cues |= CUE.stage;
}

/** 부엉이가 들어가 있는 구역 → 중력·파동 */
function applyZones(g: Game, dt: number): void {
  const owlWX = g.worldX + OWL_X;
  let zone: ZoneKind | null = null;
  let grav: 1 | -1 = 1;
  let warn = 0;
  let next: 1 | -1 = 1;
  for (const s of g.spawner.entities) {
    const e = s.e;
    if (e.t !== "zone") continue;
    const x0 = s.x;
    const x1 = s.x + e.w;
    if (owlWX >= x0 && owlWX <= x1) {
      zone = e.kind;
      if (e.kind === "flip") {
        grav = -1;
        const left = (x1 - owlWX) / Math.max(60, g.scroll);
        if (left < CFG.flip.warnSec) {
          warn = left;
          next = 1;
        }
      } else if (e.kind === "gravityChaos") {
        const seg = CFG.gravityChaos.every * s.chunkScroll;
        const k = (owlWX - x0) / seg;
        grav = Math.floor(k) % 2 === 0 ? -1 : 1;
        const left = ((1 - (k % 1)) * seg) / Math.max(60, g.scroll);
        if (left < CFG.gravityChaos.warnSec) {
          warn = left;
          next = grav === 1 ? -1 : 1;
        }
      }
    } else if ((e.kind === "flip" || e.kind === "gravityChaos") && x0 > owlWX) {
      const ahead = (x0 - owlWX) / Math.max(60, g.scroll);
      if (ahead < CFG.flip.warnSec && (!warn || ahead < warn)) {
        warn = ahead;
        next = -1;
      }
    }
  }
  if (grav !== g.grav) {
    popup(g, grav === -1 ? "GRAVITY FLIP ↑" : "GRAVITY ↓", "#CDA8FF", true);
    g.shake = Math.max(g.shake, 0.2);
    g.cues |= CUE.warn;
    if (grav === -1 && g.zone !== "gravityChaos" && zone === "flip") {
      g.banner = { m: msg("gravityFlip"), sub: msg("gravityFlipSub"), until: g.time + 1.6, tone: "danger" };
    }
  }
  g.grav = grav;
  g.gravWarn = warn;
  g.gravNext = next;
  if (zone === "wave" && g.zone !== "wave") {
    g.banner = { m: msg("wave"), sub: msg("waveSub"), until: g.time + 1.6, tone: "danger" };
  }
  g.zone = zone;
  if (zone === "wave") g.waveT += dt;
  g.wave += ((zone === "wave" ? 1 : zone === "flip" || zone === "gravityChaos" ? 0.35 : 0) - g.wave) * Math.min(1, dt * 3);
}

function tickTimers(g: Game, dt: number): void {
  const dec = (v: number) => Math.max(0, v - dt);
  g.feverT = dec(g.feverT);
  g.magnetT = dec(g.magnetT);
  g.doubleT = dec(g.doubleT);
  g.breakerT = dec(g.breakerT);
  g.phantomT = dec(g.phantomT);
  g.turboT = dec(g.turboT);
  g.phantomWorldT = dec(g.phantomWorldT);
  g.glitchT = dec(g.glitchT);
  g.redAlert = dec(g.redAlert);
  if (g.skill) {
    g.skillT -= dt;
    if (g.skillT <= 0) {
      g.skill = null;
      g.skillT = 0;
    }
  }
  // 폭풍 — 바람 방향이 번갈아 바뀐다
  if (g.windT > 0) {
    g.windT = dec(g.windT);
    g.windFlipT -= dt;
    if (g.windFlipT <= 0) {
      g.windFlipT = CFG.wind.every;
      g.wind = (g.wind > 0 ? -1 : 1) * CFG.wind.accel;
    }
    if (g.windT <= 0) g.wind = 0;
  }
  // 색 혼란 — 부엉이 색이 저절로 바뀐다 (에너지는 안 든다)
  if (g.colorChaosT > 0) {
    g.colorChaosT = dec(g.colorChaosT);
    g.colorChaosCd -= dt;
    if (g.colorChaosCd <= 0 && g.colorChaosT > 0) {
      g.colorChaosCd = CFG.events.colorChaosEvery;
      g.color = nextColor(g.color);
      popup(g, "COLOR SHIFT!", COLOR_HEX[g.color], false);
    }
  }
  // 깃털 비
  if (g.featherRainT > 0) {
    g.featherRainT = dec(g.featherRainT);
    g.featherRainCd -= dt;
    if (g.featherRainCd <= 0) {
      g.featherRainCd = 0.2;
      const x = g.worldX + OWL_X + 60 + g.rand() * (W - OWL_X);
      g.spawner.add({ t: "item", x: 0, y: -20, kind: g.rand() < 0.1 ? "star" : "feather" }, x, g.scroll, {
        fy: -20,
        fvy: 170 + g.rand() * 90,
      });
    }
  }
}

function updateHazards(g: Game, wdt: number, rx: number, ry: number): void {
  // 레이저
  for (let i = g.lasers.length - 1; i >= 0; i--) {
    const l = g.lasers[i];
    const before = laserState(l);
    l.t += wdt;
    const now = laserState(l);
    if (before !== "fire" && now === "fire") g.cues |= CUE.fire;
    if (now === "done") {
      g.lasers.splice(i, 1);
      continue;
    }
    if (!l.hit && laserHits(l, OWL_X, g.y, ry)) {
      l.hit = true;
      damage(g, CFG.laser.damage, "#FF4D4D");
    }
  }
  // 미사일 — 10단계부터 주기적으로 LOCK ON
  if (g.stage >= CFG.missile.fromStage && g.status === "playing") {
    g.missileCd -= wdt;
    const busy = g.lasers.length > 0 || g.zone === "flip" || g.zone === "gravityChaos";
    if (g.missileCd <= 0 && !busy) {
      const inf = infiniteLevel(g.stage);
      const count = inf >= 3 || (g.stage >= 13 && g.rand() < 0.35) ? 2 : 1;
      for (let i = 0; i < count; i++) g.missiles.push(newMissile(i * 0.7, g.y));
      g.cues |= CUE.lock;
      g.missileCd = CFG.missile.interval * Math.max(0.55, 1 - inf * 0.08) + (g.rand() - 0.5) * CFG.missile.intervalJitter;
    }
  }
  const homing = 1 + infiniteLevel(g.stage) * 0.1;
  for (let i = g.missiles.length - 1; i >= 0; i--) {
    const m = g.missiles[i];
    const wasLock = m.state === "lock";
    stepMissile(m, wdt, g.y, g.scroll, homing);
    if (wasLock && m.state === "fly") g.cues |= CUE.fire;
    if (m.state === "fly" && !m.dead) {
      // 벽에 박히면 벽째 터진다 — 미사일로 길을 뚫을 수 있다
      for (const s of g.spawner.entities) {
        if (s.gone || !isSolid(s.e)) continue;
        const sx = s.x - g.worldX;
        if (sx > m.x + 20 || sx + s.w < m.x - 20) continue;
        const t = (m.x + g.worldX - s.chunkX) / s.chunkScroll;
        const r = CFG.missile.r;
        const hitWall = solidRects(s.e, sx, "M", t).some(
          (b) => m.x + r > b.x && m.x - r < b.x + b.w && m.y + r > b.y && m.y - r < b.y + b.h,
        );
        if (hitWall) {
          m.dead = true;
          s.gone = true;
          const b = Score.addBonus(g.score, CFG.missile.breakScore, scoreMult(g));
          g.popups.push({ text: `BOOM +${Math.round(b)}`, x: m.x, y: m.y - 20, color: "#FFB020", life: 0.9, max: 0.9, big: false });
          burstAt(g, m.x, m.y, "#FFB020", 22);
          g.cues |= CUE.boom;
          g.shake = Math.max(g.shake, 0.2);
          break;
        }
      }
      if (!m.dead && Math.hypot(m.x - OWL_X, (m.y - g.y) * (rx / ry)) < CFG.missile.r + rx * 0.8) {
        m.dead = true;
        burstAt(g, m.x, m.y, "#FF5C7A", 20);
        g.cues |= CUE.boom;
        if (isBreaker(g)) popup(g, "BREAK!", "#FF4D4D", true);
        else damage(g, CFG.missile.damage, "#FF5C7A");
      }
    }
    if (m.dead) g.missiles.splice(i, 1);
  }
}

/** 레이저·미사일 피해 — 즉사가 아니라 에너지 (색 실수는 손해, 벽만 죽음) */
function damage(g: Game, amount: number, color: string): void {
  if (isPhantom(g) || g.iFrame > 0) return;
  if (g.shields > 0) {
    g.shields -= 1;
    g.iFrame = CFG.color.iFrame;
    popup(g, "SHIELD!", "#3DD9EB", true);
    burst(g, OWL_X, g.y, "#3DD9EB", 16);
    return;
  }
  Energy.add(g.energy, -amount);
  if (g.feverT <= 0) Score.breakCombo(g.score);
  setPose(g, "hit", 0.45);
  g.nearChain = 0;
  g.iFrame = 0.8;
  g.flash = 0.3;
  g.flashColor = color;
  g.shake = 0.35;
  burst(g, OWL_X, g.y, color, 18);
  popup(g, `-${amount} ENERGY`, "#FF5C7A", true);
  g.cues |= CUE.hit;
}

function smash(g: Game, s: SpawnedEntity, score: number, label: string): void {
  s.gone = true;
  const b = Score.addBonus(g.score, score, scoreMult(g));
  g.shake = Math.max(g.shake, 0.28);
  const sx = s.x - g.worldX + s.w / 2;
  burstAt(g, Math.max(OWL_X, sx), g.y, "#B06A3C", 16);
  burstAt(g, Math.max(OWL_X, sx), g.y, "#FFD27A", 8);
  popup(g, `${label} +${Math.round(b)}`, "#FFD27A", false);
  g.cues |= CUE.boom;
}

/* ───────────────────────── 이펙트 ───────────────────────── */

const COLOR_HEX: Record<Color, string> = { R: "#FF4D4D", B: "#3DD9EB", P: "#A855F7" };

function popup(g: Game, text: string, color: string, big: boolean): void {
  // 같은 자리에 겹치지 않게 조금씩 위로 쌓는다
  const stack = g.popups.filter((p) => p.life > p.max - 0.25).length;
  g.popups.push({ text, x: OWL_X + 30, y: g.y - 34 - stack * 20, color, life: big ? 1.1 : 0.8, max: big ? 1.1 : 0.8, big });
  if (g.popups.length > 24) g.popups.shift();
}

/** 문구 그림 팝업 — 크게 튀어나오고 같은 색 불꽃이 터진다 */
function artPopup(g: Game, art: PopupArt, text: string, color: string, n?: number): void {
  const stack = g.popups.filter((p) => p.life > p.max - 0.25).length;
  const y = g.y - 40 - stack * 24;
  g.popups.push({ text, x: OWL_X + 44, y, color, life: 1.0, max: 1.0, big: true, art, n });
  if (g.popups.length > 24) g.popups.shift();
  burstAt(g, OWL_X + 60, y, color, 8);
}

/** 자세는 더 센 것이 이긴다 (피격·기절·부활은 줍기 연출에 덮이지 않는다) */
const POSE_RANK: Record<PoseKind, number> = { hit: 5, dizzy: 4, revive: 4, golden: 3, turbo: 3, victory: 2, happy: 2, energy: 1, score: 1 };

function setPose(g: Game, k: PoseKind, t: number): void {
  if (g.pose && g.pose.t > 0 && POSE_RANK[g.pose.k] > POSE_RANK[k]) return;
  g.pose = { k, t };
}

/** 색 변경 연출 길이 */
export const SWAP_SEC = 0.35;

function tickPopups(g: Game, dt: number): void {
  for (let i = g.popups.length - 1; i >= 0; i--) {
    const p = g.popups[i];
    p.life -= dt;
    p.y -= 42 * dt;
    if (p.life <= 0) g.popups.splice(i, 1);
  }
}

function die(g: Game, cause: DeathCause): void {
  g.status = "dead";
  g.deathCause = cause;
  g.deathAt = 0;
  g.shake = 0.4;
  g.flash = 0.3;
  g.flashColor = "#FF4D4D";
  g.feverT = 0;
  g.cues |= CUE.death;
  burst(g, OWL_X, g.y, cause === "wall" ? "#FF5C7A" : "#8D97BA", 28);
}

function tickEffects(g: Game, dt: number): void {
  g.flash = Math.max(0, g.flash - dt);
  g.swapT = Math.max(0, g.swapT - dt);
  if (g.pose) {
    g.pose.t -= dt;
    if (g.pose.t <= 0) g.pose = null;
  }
  for (let i = g.pickups.length - 1; i >= 0; i--) {
    g.pickups[i].life -= dt;
    if (g.pickups[i].life <= 0) g.pickups.splice(i, 1);
  }
  g.shake = Math.max(0, g.shake - dt);
  for (let i = g.particles.length - 1; i >= 0; i--) {
    const p = g.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 420 * dt;
    if (p.life <= 0) g.particles.splice(i, 1);
  }
  tickPopups(g, dt);
  if (g.banner && g.time > g.banner.until) g.banner = null;
}

export function burst(g: Game, x: number, y: number, color: string, count: number): void {
  burstAt(g, x, y, color, count);
}

function burstAt(g: Game, x: number, y: number, color: string, count: number): void {
  // 파티클 상한 128 (§14)
  const room = Math.max(0, 128 - g.particles.length);
  for (let i = 0; i < Math.min(count, room); i++) {
    const a = (Math.PI * 2 * i) / count + g.rand();
    const sp = 80 + g.rand() * 200;
    g.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.45, max: 0.45, color, r: 2 + g.rand() * 2 });
  }
}

export function currentRaw(g: Game, includeEnergy = true): number {
  return Score.rawScore({
    meters: Math.floor(g.meters),
    s: g.score,
    energyLeft: Math.round(g.energy.value),
    includeEnergy,
  });
}

export function finalStats(g: Game): FlightStats {
  return Score.buildStats({
    meters: g.meters,
    durationSec: g.time,
    s: g.score,
    energyLeft: g.energy.value,
    phaseMax: g.phaseMax,
    stageMax: g.stageMax,
    size: g.size,
    owlEnergyFound: g.owlEnergyFound,
  });
}

/** 현재 단계 정의 (HUD용) */
export function currentStageDef(g: Game) {
  return stageDef(g.stage);
}

export { bugY };
export type { Entity };
