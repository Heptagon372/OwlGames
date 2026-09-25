/**
 * 효과음 (§13) — **오디오 파일을 쓰지 않는다.**
 * 플랫폼 UI를 이미지 에셋 없이 그리는 것과 같은 이유로, 소리도 WebAudio 로 그때그때 합성한다.
 * 사각파 + 짧은 엔벌로프라 8비트 아케이드 느낌이 나고, 용량이 0이다.
 *
 * 브라우저 자동재생 정책 때문에 AudioContext 는 **첫 사용자 입력 때** 만든다.
 */

import { DEFAULT_SOUND, readSound, writeSound, type SoundPrefs } from "./prefs";

export type Sfx = "tap" | "ok" | "fail" | "level" | "coin" | "start" | "rank";

type Note = { f: number; t: number; d: number; type?: OscillatorType; gain?: number };

/** 음 하나 = {주파수, 시작(초), 길이(초)} */
const PATTERNS: Record<Sfx, Note[]> = {
  tap: [{ f: 880, t: 0, d: 0.045, type: "square", gain: 0.25 }],
  ok: [
    { f: 784, t: 0, d: 0.07 },
    { f: 1175, t: 0.06, d: 0.1 },
  ],
  fail: [
    { f: 220, t: 0, d: 0.1, type: "sawtooth" },
    { f: 146, t: 0.08, d: 0.16, type: "sawtooth" },
  ],
  coin: [
    { f: 988, t: 0, d: 0.06 },
    { f: 1319, t: 0.05, d: 0.16 },
  ],
  start: [
    { f: 523, t: 0, d: 0.08 },
    { f: 659, t: 0.08, d: 0.08 },
    { f: 784, t: 0.16, d: 0.14 },
  ],
  level: [
    { f: 523, t: 0, d: 0.09 },
    { f: 659, t: 0.09, d: 0.09 },
    { f: 784, t: 0.18, d: 0.09 },
    { f: 1047, t: 0.27, d: 0.22 },
  ],
  rank: [
    { f: 659, t: 0, d: 0.1 },
    { f: 880, t: 0.1, d: 0.1 },
    { f: 1047, t: 0.2, d: 0.1 },
    { f: 1319, t: 0.3, d: 0.3 },
  ],
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let prefs: SoundPrefs = DEFAULT_SOUND;
let loaded = false;

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!loaded) {
    prefs = readSound();
    loaded = true;
  }
  if (!prefs.on) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = prefs.volume;
    master.connect(ctx.destination);
  }
  // 탭을 오래 두면 브라우저가 멈춰 둔다
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function getSoundPrefs(): SoundPrefs {
  if (!loaded) {
    prefs = readSound();
    loaded = true;
  }
  return prefs;
}

export function setSoundPrefs(next: SoundPrefs): void {
  prefs = { on: next.on, volume: Math.min(1, Math.max(0, next.volume)) };
  loaded = true;
  writeSound(prefs);
  if (master) master.gain.value = prefs.volume;
  if (!prefs.on && ctx) void ctx.suspend();
  else if (prefs.on && ctx?.state === "suspended") void ctx.resume();
}

/** 효과음 한 번. 소리가 꺼져 있거나 WebAudio 가 없으면 조용히 넘어간다 */
export function playSfx(name: Sfx): void {
  const ac = ensure();
  if (!ac || !master) return;
  const now = ac.currentTime;
  for (const n of PATTERNS[name]) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = n.type ?? "square";
    osc.frequency.setValueAtTime(n.f, now + n.t);
    // 짧은 어택 + 지수 감쇠 — 클릭 노이즈가 안 나게
    const peak = (n.gain ?? 0.32) * 0.6;
    gain.gain.setValueAtTime(0.0001, now + n.t);
    gain.gain.exponentialRampToValueAtTime(peak, now + n.t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now + n.t);
    osc.stop(now + n.t + n.d + 0.02);
  }
}
