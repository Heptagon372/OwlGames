/**
 * 소리 (§13)
 *
 * - **효과음(합성)** — 플랫폼 UI 는 오디오 파일 없이 WebAudio 로 그때그때 합성한다(`PATTERNS`).
 *   사각파 + 짧은 엔벌로프라 8비트 아케이드 느낌이 나고, 용량이 0이다.
 * - **효과음(샘플)** — 아울 서바이버즈처럼 녹음된 소리가 필요한 게임은 `preloadSamples` → `playSample`.
 *   아직 못 받았으면 false 를 돌려주니, 부르는 쪽이 합성음으로 대신한다.
 * - **배경음악** — `playMusic(url)` 한 줄. 같은 곡이면 아무것도 안 하고, 다른 곡이면 크로스페이드한다.
 *
 * 브라우저 자동재생 정책 때문에 AudioContext 는 **첫 사용자 입력 때** 만든다.
 * 소리 길: 합성음·샘플 → master(전체 음량) / 배경음악 → music(배경음악 음량) → master
 */

import { DEFAULT_SOUND, readSound, writeSound, type SoundPrefs } from "./prefs";

export type Sfx =
  | "tap"
  | "ok"
  | "fail"
  | "level"
  | "coin"
  | "start"
  | "rank"
  | "tick"
  | "alarm"
  | "boom"
  | "lock"
  | "chain"
  | "thud"
  | "send"
  // 🦉 아울러닝 2.0
  | "perfect"
  | "near"
  | "laser"
  | "lockOn"
  | "hit"
  | "fever"
  | "power"
  | "legend"
  // 🍳 아울 레스토랑
  | "chop"
  | "sizzle"
  | "ding"
  | "serve"
  | "bug"
  | "glitch";

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
  // ⏱️ 아울 서바이버즈 — 시간 정지 "틱…" / 보스 경고 / 폭발
  tick: [{ f: 1760, t: 0, d: 0.03, type: "square", gain: 0.3 }],
  alarm: [
    { f: 440, t: 0, d: 0.14, type: "sawtooth", gain: 0.35 },
    { f: 330, t: 0.16, d: 0.2, type: "sawtooth", gain: 0.35 },
  ],
  boom: [
    { f: 110, t: 0, d: 0.12, type: "sawtooth", gain: 0.5 },
    { f: 55, t: 0.08, d: 0.25, type: "square", gain: 0.4 },
  ],
  rank: [
    { f: 659, t: 0, d: 0.1 },
    { f: 880, t: 0.1, d: 0.1 },
    { f: 1047, t: 0.2, d: 0.1 },
    { f: 1319, t: 0.3, d: 0.3 },
  ],
  // 🧩 아울리스 — 블록 굳음 / 연쇄(음높이는 pitch 로 올린다) / 방해 블록 착지 / 공격 발사
  lock: [{ f: 196, t: 0, d: 0.05, type: "triangle", gain: 0.35 }],
  chain: [
    { f: 660, t: 0, d: 0.06 },
    { f: 990, t: 0.05, d: 0.12, type: "triangle" },
  ],
  thud: [
    { f: 98, t: 0, d: 0.14, type: "square", gain: 0.45 },
    { f: 73, t: 0.06, d: 0.16, type: "sawtooth", gain: 0.3 },
  ],
  send: [
    { f: 440, t: 0, d: 0.05, type: "sawtooth", gain: 0.25 },
    { f: 880, t: 0.04, d: 0.08, type: "sawtooth", gain: 0.25 },
    { f: 1760, t: 0.1, d: 0.08, type: "square", gain: 0.18 },
  ],
  // 🦉 아울러닝 2.0 — PERFECT · NEAR MISS · 레이저 발사 · 락온 · 피격 · FEVER · COLOR POWER · 전설
  perfect: [
    { f: 1047, t: 0, d: 0.05, type: "triangle" },
    { f: 1568, t: 0.04, d: 0.09, type: "triangle" },
  ],
  near: [{ f: 1760, t: 0, d: 0.05, type: "sine", gain: 0.25 }],
  laser: [
    { f: 1200, t: 0, d: 0.08, type: "sawtooth", gain: 0.3 },
    { f: 600, t: 0.05, d: 0.18, type: "sawtooth", gain: 0.3 },
  ],
  lockOn: [
    { f: 1318, t: 0, d: 0.05, gain: 0.25 },
    { f: 1318, t: 0.12, d: 0.05, gain: 0.25 },
    { f: 1318, t: 0.24, d: 0.05, gain: 0.25 },
  ],
  hit: [
    { f: 180, t: 0, d: 0.1, type: "sawtooth", gain: 0.45 },
    { f: 90, t: 0.06, d: 0.16, type: "square", gain: 0.35 },
  ],
  fever: [
    { f: 523, t: 0, d: 0.07 },
    { f: 784, t: 0.06, d: 0.07 },
    { f: 1047, t: 0.12, d: 0.07 },
    { f: 1568, t: 0.18, d: 0.07 },
    { f: 2093, t: 0.24, d: 0.24 },
  ],
  power: [
    { f: 220, t: 0, d: 0.14, type: "sawtooth", gain: 0.4 },
    { f: 440, t: 0.08, d: 0.14, type: "square" },
    { f: 880, t: 0.16, d: 0.22, type: "square" },
  ],
  legend: [
    { f: 1319, t: 0, d: 0.08, type: "triangle" },
    { f: 1760, t: 0.08, d: 0.08, type: "triangle" },
    { f: 2637, t: 0.16, d: 0.26, type: "triangle" },
  ],
  // 🍳 아울 레스토랑 — 썰기 / 지글지글 / 조리 완료 / 제출 / 버그 등장 / 게임 오버 글리치
  chop: [
    { f: 520, t: 0, d: 0.03, type: "square", gain: 0.22 },
    { f: 440, t: 0.06, d: 0.03, type: "square", gain: 0.18 },
  ],
  sizzle: [
    { f: 2400, t: 0, d: 0.12, type: "sawtooth", gain: 0.07 },
    { f: 2150, t: 0.05, d: 0.12, type: "sawtooth", gain: 0.05 },
  ],
  ding: [
    { f: 1568, t: 0, d: 0.07, type: "triangle", gain: 0.35 },
    { f: 2093, t: 0.06, d: 0.16, type: "triangle", gain: 0.3 },
  ],
  serve: [
    { f: 659, t: 0, d: 0.06 },
    { f: 880, t: 0.05, d: 0.06 },
    { f: 1319, t: 0.1, d: 0.12 },
  ],
  bug: [
    { f: 300, t: 0, d: 0.05, type: "square", gain: 0.28 },
    { f: 330, t: 0.07, d: 0.05, type: "square", gain: 0.28 },
    { f: 280, t: 0.14, d: 0.08, type: "sawtooth", gain: 0.28 },
  ],
  glitch: [
    { f: 90, t: 0, d: 0.1, type: "sawtooth", gain: 0.5 },
    { f: 1400, t: 0.05, d: 0.05, type: "square", gain: 0.3 },
    { f: 700, t: 0.12, d: 0.04, type: "square", gain: 0.3 },
    { f: 60, t: 0.14, d: 0.35, type: "square", gain: 0.45 },
  ],
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
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
    musicBus = ctx.createGain();
    musicBus.gain.value = prefs.music;
    musicBus.connect(master);
    for (const s of samples.values()) decode(s);
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
  const unit = (v: number) => Math.min(1, Math.max(0, v));
  prefs = { on: next.on, volume: unit(next.volume), music: unit(next.music) };
  loaded = true;
  writeSound(prefs);
  if (master) master.gain.value = prefs.volume;
  if (musicBus) musicBus.gain.value = prefs.music;
  if (!prefs.on) {
    if (ctx) void ctx.suspend();
    active?.el.pause();
  } else {
    if (ctx?.state === "suspended") void ctx.resume();
    syncMusic(true);
  }
}

/**
 * 효과음 한 번. 소리가 꺼져 있거나 WebAudio 가 없으면 조용히 넘어간다.
 * `pitch` 는 모든 음의 주파수에 곱한다 (연쇄가 길어질수록 높아지는 소리처럼).
 */
export function playSfx(name: Sfx, pitch = 1): void {
  const ac = ensure();
  if (!ac || !master) return;
  const now = ac.currentTime;
  for (const n of PATTERNS[name]) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = n.type ?? "square";
    osc.frequency.setValueAtTime(n.f * pitch, now + n.t);
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

/* ── 샘플 효과음 ─────────────────────────────────────────────── */

type Sample = { bytes: Promise<ArrayBuffer | null>; buf: AudioBuffer | null; decoding: boolean };
const samples = new Map<string, Sample>();

function decode(s: Sample): void {
  if (!ctx || s.buf || s.decoding) return;
  s.decoding = true;
  const ac = ctx;
  void s.bytes
    .then((b) => (b ? ac.decodeAudioData(b) : null))
    .then((buf) => {
      s.buf = buf;
    })
    .catch(() => undefined);
}

/** 파일을 미리 받아 둔다. 디코딩은 AudioContext 가 생긴 뒤(첫 입력)에 한다 */
export function preloadSamples(urls: readonly string[]): void {
  if (typeof window === "undefined") return;
  installUnlock();
  for (const url of urls) {
    if (samples.has(url)) continue;
    const s: Sample = {
      bytes: fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null),
      buf: null,
      decoding: false,
    };
    samples.set(url, s);
    decode(s);
  }
}

/**
 * 받아 둔 샘플을 한 번 재생한다. 소리가 꺼져 있으면 true(할 일 없음),
 * 아직 준비가 안 됐으면 false — 부르는 쪽이 합성음으로 대신할 수 있게.
 */
export function playSample(url: string, opts: { gain?: number; rate?: number } = {}): boolean {
  if (!getSoundPrefs().on) return true;
  const ac = ensure();
  const s = samples.get(url);
  if (!ac || !master || !s?.buf) {
    if (s) decode(s);
    return false;
  }
  const src = ac.createBufferSource();
  src.buffer = s.buf;
  src.playbackRate.value = opts.rate ?? 1;
  const g = ac.createGain();
  g.gain.value = opts.gain ?? 1;
  src.connect(g);
  g.connect(master);
  src.start();
  return true;
}

/* ── UI 클릭음 ──────────────────────────────────────────────── */

/** 버튼·링크 클릭음 (사용자 제공 샘플). 아직 안 받았으면 합성음 `tap` 으로 대신한다 */
export const UI_CLICK = "/assets/ui/button-click.mp3";

/** 버튼·링크를 눌렀을 때의 소리 — `SoundBoot` 와 설정 화면이 같은 소리를 쓴다 */
export function playClick(gain = 0.7): void {
  if (typeof window === "undefined") return;
  preloadSamples([UI_CLICK]);
  if (!playSample(UI_CLICK, { gain })) playSfx("tap");
}

/* ── 레벨업·랭크업 징글 ─────────────────────────────────────── */

/** 레벨업·랭크업 연출(`LevelUpOverlay`)의 사용자 제공 샘플. 아직 안 받았으면 합성음으로 대신한다 */
export const LEVEL_UP = "/assets/ui/level-up.mp3";
export const RANK_UP = "/assets/ui/rank-up.mp3";

export function preloadLevelUp(): void {
  preloadSamples([LEVEL_UP, RANK_UP]);
}

export function playLevelUp(kind: "level" | "rank"): void {
  if (typeof window === "undefined") return;
  preloadLevelUp();
  if (kind === "rank") {
    if (!playSample(RANK_UP, { gain: 0.9 })) playSfx("legend");
  } else if (!playSample(LEVEL_UP, { gain: 0.8 })) playSfx("level");
}

/* ── 배경음악 ───────────────────────────────────────────────── */

/**
 * <audio> 두 개를 번갈아 쓰며 크로스페이드한다.
 * 긴 곡을 AudioBuffer 로 풀면 모바일 메모리가 모자라서, 스트리밍되는 <audio> 를
 * MediaElementSource 로 WebAudio 에 꽂는다 (iOS 는 <audio>.volume 을 무시해서 GainNode 로 조절).
 */
type Deck = { el: HTMLAudioElement; gain: GainNode | null; url: string | null; stop: ReturnType<typeof setTimeout> | null };
const decks: Deck[] = [];
let active: Deck | null = null;
let wanted: string | null = null;
let fadeSec = 0.8;
/** 없거나 못 읽는 곡 — 다시 시도하지 않는다 */
const broken = new Set<string>();

/** iOS 는 사용자 입력 안에서 한 번 play() 한 <audio> 만 나중에 마음대로 틀 수 있다 — 무음 WAV 로 한 번 틀어 둔다 */
let silent = "";
function silentWav(): string {
  if (silent) return silent;
  const n = 64;
  const b = new Uint8Array(44 + n);
  const v = new DataView(b.buffer);
  const str = (o: number, t: string) => {
    for (let i = 0; i < t.length; i++) b[o + i] = t.charCodeAt(i);
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + n, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // 모노
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, "data");
  v.setUint32(40, n, true);
  b.fill(128, 44);
  silent = `data:audio/wav;base64,${btoa(String.fromCharCode(...b))}`;
  return silent;
}

function makeDecks(ac: AudioContext): void {
  if (decks.length || !musicBus) return;
  for (let i = 0; i < 2; i++) {
    const el = new Audio();
    el.loop = true;
    el.preload = "auto";
    let gain: GainNode | null = null;
    try {
      gain = ac.createGain();
      gain.gain.value = 0;
      ac.createMediaElementSource(el).connect(gain);
      gain.connect(musicBus);
    } catch {
      gain = null;
    }
    const deck: Deck = { el, gain, url: null, stop: null };
    el.addEventListener("error", () => {
      if (!deck.url) return;
      broken.add(deck.url);
      if (active === deck) active = null;
      deck.url = null;
    });
    decks.push(deck);
  }
}

function fade(d: Deck, to: number, sec: number): void {
  if (!d.gain || !ctx) return;
  const g = d.gain.gain;
  const now = ctx.currentTime;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(to, now + Math.max(0.01, sec));
}

function syncMusic(force = false): void {
  const ac = ensure();
  if (!ac) return;
  makeDecks(ac);
  // 파일을 받는 것 자체가 트래픽이다 — 로비 배경음악만 3MB 가 넘는다.
  // 그래서 (1) 배경음악 음량이 0이면(MusicDock 음소거) 아예 받지 않고,
  // (2) 첫 입력 전에는 받지 않는다 (브라우저가 어차피 재생을 막으므로 첫 입력 때 unlock 이 다시 부른다).
  const playable = prefs.music > 0 && primed;
  const url = wanted && !broken.has(wanted) && playable ? wanted : null;
  const current = active?.url ?? null;
  if (current === url) {
    // 같은 곡 — 소리를 다시 켰거나 첫 입력이 들어왔을 때만 이어서 튼다
    if (force && active && url && active.el.paused && !document.hidden) void active.el.play().catch(() => undefined);
    return;
  }

  const old = active;
  if (old) {
    fade(old, 0, fadeSec);
    if (old.stop) clearTimeout(old.stop);
    old.stop = setTimeout(() => {
      old.stop = null;
      if (active !== old) {
        old.el.pause();
        old.url = null;
      }
    }, fadeSec * 1000 + 50);
  }
  active = null;
  if (!url) return;

  const next = decks.find((d) => d !== old) ?? decks[0];
  if (!next) return;
  if (next.stop) {
    clearTimeout(next.stop);
    next.stop = null;
  }
  next.url = url;
  next.el.src = url;
  if (next.gain) next.gain.gain.value = 0;
  fade(next, 1, fadeSec);
  active = next;
  if (!document.hidden) void next.el.play().catch(() => undefined);
}

/**
 * 배경음악을 바꾼다. null 이면 끈다. 매 프레임 불러도 된다 (같은 곡이면 바로 돌아간다).
 * 첫 입력 전이면 기억해 뒀다가 첫 입력 때 튼다.
 */
export function playMusic(url: string | null, fade = 0.8): void {
  if (typeof window === "undefined" || url === wanted) return;
  installUnlock();
  wanted = url;
  fadeSec = fade;
  syncMusic();
}

export function stopMusic(fade = 0.8): void {
  playMusic(null, fade);
}

/* ── 첫 입력 · 탭 전환 ──────────────────────────────────────── */

let unlockInstalled = false;
let primed = false;

function installUnlock(): void {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;
  const unlock = () => {
    const ac = ensure();
    if (!ac) return;
    makeDecks(ac);
    if (!primed) {
      primed = true;
      for (const d of decks) {
        if (d.url) continue;
        d.el.src = silentWav();
        void d.el
          .play()
          .then(() => {
            if (!d.url) d.el.pause();
          })
          .catch(() => undefined);
      }
    }
    for (const s of samples.values()) decode(s);
    syncMusic(true);
  };
  for (const ev of ["pointerdown", "keydown", "touchend"]) window.addEventListener(ev, unlock, { capture: true, passive: true });

  // 다른 탭·앱으로 가면 음악을 멈추고, 돌아오면 이어서 튼다
  document.addEventListener("visibilitychange", () => {
    if (!active) return;
    if (document.hidden) active.el.pause();
    else if (getSoundPrefs().on) void active.el.play().catch(() => undefined);
  });
}
