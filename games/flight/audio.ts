// 🦉 아울러닝 — 배경음악 (DECISIONS §5-31)
//
// 곡은 두 곡뿐이다. 초반은 "Neon Owl Dash", **후반(9단계 = phase 4 부터 · ∞)** 과
// OVERDRIVE 동안은 더 몰아치는 "Overdrive Mode" 로 크로스페이드한다.
// 효과음은 지금처럼 `g.cues` → `playSfx`(합성음) 그대로다 — 여기는 BGM 만 다룬다.

import { playMusic } from "@/lib/sound";

export const BGM = {
  /** 초반 */
  early: "/assets/flight-bgm/neon-owl-dash.mp3",
  /** 후반 · OVERDRIVE */
  late: "/assets/flight-bgm/overdrive-mode.mp3",
} as const;

/** 이 단계부터 후반 곡 (CFG.stages 의 phase 4 시작 = 9단계 STORM) */
export const LATE_STAGE = 9;

export type FlightScene = "early" | "late" | "off";

/** 지금 상황에 맞는 곡. 매 틱 불러도 된다 (같은 곡이면 `playMusic` 이 아무것도 안 한다) */
export function sceneOf(stage: number, overdrive: boolean): FlightScene {
  return overdrive || stage >= LATE_STAGE ? "late" : "early";
}

export function setBgm(scene: FlightScene): void {
  if (scene === "off") return playMusic(null, 1.2);
  // 후반 곡은 빠르게 얹히고, 초반 곡으로는 천천히 돌아온다 (OVERDRIVE 가 끝나도 확 끊기지 않게)
  playMusic(scene === "late" ? BGM.late : BGM.early, scene === "late" ? 0.7 : 1.6);
}
