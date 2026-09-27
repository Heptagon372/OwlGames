// 🧩 아울리스 — 배경음악 (DECISIONS §5-29)
//
// 곡은 두 곡뿐이다. 초반은 여유로운 "Night City Groove", **후반(또는 필드가 위험할 때)** 은
// 더 긴장감 있는 "Neon City Pulse" 로 크로스페이드한다.
// 효과음은 플랫폼 합성음(`lib/sound.ts` 의 `playSfx`)을 그대로 쓴다 — 여기는 BGM 만 다룬다.

import { playMusic } from "@/lib/sound";
import { levelOf } from "./config";

export const BGM = {
  /** 초반 — AI LEVEL 이 낮고 필드가 안전할 때 */
  early: "/assets/owlis-bgm/night-city-groove.mp3",
  /** 후반 — AI LEVEL 이 높거나 위기(CRITICAL)일 때 */
  late: "/assets/owlis-bgm/neon-city-pulse.mp3",
} as const;

/** 표시 AI LEVEL 이 이 값 이상이면 후반 곡 (1~5, 5 = 마지막 단계) */
export const LATE_LEVEL = 4;

export type OwlisScene = "early" | "late" | "off";

/**
 * 지금 난이도에 맞는 곡을 고른다. 매 프레임 불러도 된다 (같은 곡이면 `playMusic` 이 아무것도 안 한다).
 * `peak` = 표시 AI LEVEL 기준 내부 난이도(`g.diff.peak`), `critical` = 필드 위기.
 */
export function sceneOf(peak: number, critical: boolean): OwlisScene {
  return critical || levelOf(peak) >= LATE_LEVEL ? "late" : "early";
}

export function setBgm(scene: OwlisScene): void {
  if (scene === "off") return playMusic(null, 1.2);
  // 후반 곡으로는 빠르게(긴장이 바로 얹히게), 다시 초반 곡으로는 천천히 돌아온다.
  playMusic(scene === "late" ? BGM.late : BGM.early, scene === "late" ? 0.7 : 1.6);
}
