// 🔊 아울 서바이버즈 소리 — 효과음(Kenney CC0 샘플)과 배경음악 목록
//
// 엔진은 소리를 모른다. 사건이 나면 `world.cues` 에 CUE 비트만 세우고,
// 화면(index.tsx)이 매 프레임 비트를 꺼내 `playCues` 로 넘긴다.
// 한 프레임에 적 30마리가 죽어도 비트는 하나라서 소리는 한 번 — 여기에 더해 `gap` 으로 간격을 준다.
//
// 샘플을 아직 못 받았으면 합성음(`fallback`)으로 대신한다 → 파일이 없어도 게임은 조용하지 않다.
// 새 파일을 넣으면 public/assets/CREDITS.md 에 출처를 적을 것.

import type { BossKind } from "./data/stages";
import { CUE } from "./engine/world";
import { playMusic, playSample, playSfx, preloadSamples, type Sfx } from "@/lib/sound";

const A = "/assets";

type SoundDef = {
  /** 번갈아 쓰는 변형들 — 같은 소리가 반복돼도 덜 거슬리게 */
  files: string[];
  gain: number;
  /** 최소 간격(초) — 이보다 자주 오면 버린다 */
  gap: number;
  /** 재생 속도 흔들기 (±) — 음높이가 조금씩 달라진다 */
  jitter?: number;
  /** 샘플이 준비 안 됐을 때 대신 낼 합성음 */
  fallback?: Sfx;
};

export type SoundId = keyof typeof SOUNDS;

export const SOUNDS = {
  // 진행
  tick: { files: [`${A}/kenney-interface-sounds/tick_001.mp3`], gain: 0.9, gap: 0.05, fallback: "tick" },
  go: { files: [`${A}/kenney-interface-sounds/confirmation_001.mp3`], gain: 0.8, gap: 0.2, fallback: "start" },
  stage: { files: [`${A}/kenney-interface-sounds/confirmation_002.mp3`], gain: 0.7, gap: 0.5, fallback: "ok" },
  level: { files: [`${A}/kenney-digital-audio/phaserUp6.mp3`], gain: 0.7, gap: 0.15, fallback: "level" },
  evo: { files: [`${A}/kenney-digital-audio/zapThreeToneUp.mp3`], gain: 0.8, gap: 0.5, fallback: "rank" },

  // 부엉이
  hit: {
    files: [0, 1, 2].map((n) => `${A}/kenney-impact-sounds/impactPunch_medium_00${n}.mp3`),
    gain: 0.9,
    gap: 0.12,
    jitter: 0.06,
    fallback: "fail",
  },
  shield: { files: [`${A}/kenney-sci-fi-sounds/forceField_000.mp3`], gain: 0.6, gap: 0.3 },
  dodge: { files: [`${A}/kenney-digital-audio/phaseJump1.mp3`], gain: 0.5, gap: 0.2 },
  revive: { files: [`${A}/kenney-digital-audio/powerUp11.mp3`], gain: 0.9, gap: 0.5, fallback: "level" },
  death: {
    files: [`${A}/kenney-music-jingles/jingles_NES11.mp3`],
    gain: 0.8,
    gap: 1,
    fallback: "fail",
  },
  heal: { files: [`${A}/kenney-digital-audio/powerUp7.mp3`], gain: 0.45, gap: 0.25 },
  pickup: { files: [`${A}/kenney-interface-sounds/glass_002.mp3`], gain: 0.28, gap: 0.05, jitter: 0.12 },

  // 적
  kill: {
    files: [0, 1, 2, 3].map((n) => `${A}/kenney-impact-sounds/impactGlass_light_00${n}.mp3`),
    gain: 0.3,
    gap: 0.045,
    jitter: 0.1,
  },
  elite: {
    files: [0, 1].map((n) => `${A}/kenney-impact-sounds/impactGlass_medium_00${n}.mp3`),
    gain: 0.6,
    gap: 0.1,
    jitter: 0.05,
  },
  boom: {
    files: [0, 2].map((n) => `${A}/kenney-sci-fi-sounds/explosionCrunch_00${n}.mp3`),
    gain: 0.6,
    gap: 0.12,
    jitter: 0.05,
    fallback: "boom",
  },

  // 보스
  alarm: { files: [], gain: 1, gap: 0.3, fallback: "alarm" },
  bossIn: { files: [`${A}/kenney-sci-fi-sounds/lowFrequency_explosion_000.mp3`], gain: 0.9, gap: 1 },
  bossDown: {
    files: [`${A}/kenney-music-jingles/jingles_NES12.mp3`],
    gain: 0.85,
    gap: 1,
    fallback: "rank",
  },

  // 내 공격 — 가장 자주 나는 소리라 작게, 간격을 넓게
  shot: {
    files: [0, 2, 3].map((n) => `${A}/kenney-sci-fi-sounds/laserSmall_00${n}.mp3`),
    gain: 0.16,
    gap: 0.09,
    jitter: 0.08,
  },
  zap: {
    files: [0, 2].map((n) => `${A}/kenney-sci-fi-sounds/laserRetro_00${n}.mp3`),
    gain: 0.16,
    gap: 0.12,
    jitter: 0.08,
  },
  slash: {
    files: [`${A}/kenney-rpg-audio/knifeSlice.mp3`, `${A}/kenney-rpg-audio/knifeSlice2.mp3`],
    gain: 0.22,
    gap: 0.12,
    jitter: 0.08,
  },

  // 카드 (레벨업 화면)
  cardOpen: { files: [`${A}/kenney-interface-sounds/maximize_001.mp3`], gain: 0.6, gap: 0.2 },
  cardPick: { files: [`${A}/kenney-interface-sounds/select_002.mp3`], gain: 0.8, gap: 0.05, fallback: "tap" },
  reroll: { files: [`${A}/kenney-interface-sounds/switch_001.mp3`], gain: 0.7, gap: 0.1, fallback: "tap" },
  skip: { files: [`${A}/kenney-interface-sounds/back_001.mp3`], gain: 0.7, gap: 0.1, fallback: "tap" },
} satisfies Record<string, SoundDef>;

/** CUE 비트 → 소리 (위에서부터 순서대로 낸다) */
const CUE_SOUNDS: [number, SoundId][] = [
  [CUE.death, "death"],
  [CUE.bossDown, "bossDown"],
  [CUE.bossIn, "bossIn"],
  [CUE.alarm, "alarm"],
  [CUE.revive, "revive"],
  [CUE.evo, "evo"],
  [CUE.level, "level"],
  [CUE.stage, "stage"],
  [CUE.boom, "boom"],
  [CUE.hit, "hit"],
  [CUE.shield, "shield"],
  [CUE.dodge, "dodge"],
  [CUE.elite, "elite"],
  [CUE.kill, "kill"],
  [CUE.heal, "heal"],
  [CUE.pickup, "pickup"],
  [CUE.shot, "shot"],
  [CUE.zap, "zap"],
  [CUE.slash, "slash"],
  [CUE.tick, "tick"],
  [CUE.go, "go"],
];

const lastAt: Partial<Record<SoundId, number>> = {};
const turn: Partial<Record<SoundId, number>> = {};

export function playSound(id: SoundId): void {
  const def: SoundDef = SOUNDS[id];
  const now = performance.now() / 1000;
  if (now - (lastAt[id] ?? -Infinity) < def.gap) return;
  lastAt[id] = now;

  if (def.files.length > 0) {
    const k = (turn[id] = ((turn[id] ?? -1) + 1) % def.files.length);
    const rate = def.jitter ? 1 + (Math.random() * 2 - 1) * def.jitter : 1;
    if (playSample(def.files[k], { gain: def.gain, rate })) return;
  }
  if (def.fallback) playSfx(def.fallback);
}

/** 이번 프레임의 CUE 비트를 소리로 */
export function playCues(cues: number): void {
  for (const [bit, id] of CUE_SOUNDS) if (cues & bit) playSound(id);
}

export function preloadSurviveAudio(): void {
  preloadSamples(Object.values(SOUNDS).flatMap((d: SoundDef) => d.files));
}

/* ── 배경음악 ───────────────────────────────────────────────── */

/**
 * 🎵 배경음악 자리 — 파일은 public/assets/survive-bgm/ 에 넣고 여기에 경로를 적는다.
 *   예) run: "/assets/survive-bgm/run.mp3"
 * 비워 둔 자리(null)는 조용하다. 보스별 곡이 없으면 `boss` 를 쓰고, 그것도 없으면 `run` 을 이어서 튼다.
 * 곡은 반복 재생되니 끝과 처음이 이어지는 루프 곡이 좋다. MP3(128~192kbps)를 권장한다.
 */
export const BGM: Record<"lobby" | "run" | "boss" | BossKind, string | null> = {
  /** 시작 화면 */
  lobby: null,
  /** 평소 전투 */
  run: "/assets/survive-bgm/survival-loop.mp3",
  /** 보스 공통 */
  boss: "/assets/survive-bgm/clash-of-titans.mp3",
  /** 보스별 (없으면 boss) */
  hexa: null,
  nona: null,
  trideca: null,
  chrono: null,
};

export type BgmScene = "lobby" | "run" | "boss" | "off";

/** 장면에 맞는 곡을 튼다. 매 프레임 불러도 된다 */
export function setBgm(scene: BgmScene, boss: BossKind | null = null): void {
  if (scene === "off") return playMusic(null, 1.2);
  if (scene === "lobby") return playMusic(BGM.lobby);
  if (scene === "boss") return playMusic((boss && BGM[boss]) || BGM.boss || BGM.run, 0.6);
  playMusic(BGM.run, 1.2);
}
