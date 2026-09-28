/**
 * PC 키 설정 — 게임마다 "동작 → 키(KeyboardEvent.code) 두 개까지".
 * 기기에만 저장한다(localStorage, `lib/prefs.ts` 와 같은 이유). 모바일은 설정 화면에 나오지 않는다.
 *
 * 게임은 `useKeymap(game)` 으로 받은 ref 를 keydown 에서 `actionOf(map, e.code)` 로 읽는다 —
 * 설정이 바뀌면 같은 탭(`KEYS_EVENT`)·다른 탭(`storage`) 모두 ref 가 새 값으로 바뀐다.
 */
"use client";

import { useEffect, useRef, useState } from "react";

export const KEYS_KEY = "owl-keys";
export const KEYS_EVENT = "owl-keys-change";

/** 동작 순서 = 설정 화면에 나오는 순서. 값은 기본 키 (앞이 주 키) */
export const DEFAULT_KEYS = {
  flight: {
    flap: ["Space", "ArrowUp"],
    colorR: ["KeyA", "Digit1"],
    colorB: ["KeyS", "Digit2"],
    colorP: ["KeyD", "Digit3"],
    cycle: ["ShiftLeft", "ShiftRight"],
    skill: ["KeyQ", "KeyE"],
    pause: ["KeyP", "Escape"],
  },
  survive: {
    up: ["KeyW", "ArrowUp"],
    down: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    pick1: ["Digit1", "Numpad1"],
    pick2: ["Digit2", "Numpad2"],
    pick3: ["Digit3", "Numpad3"],
    reroll: ["KeyR"],
    pause: ["KeyP", "Escape"],
  },
  owlis: {
    left: ["ArrowLeft"],
    right: ["ArrowRight"],
    soft: ["ArrowDown"],
    rotR: ["KeyX", "ArrowUp"],
    rotL: ["KeyZ", "ControlLeft"],
    hard: ["Space"],
    hold: ["KeyC", "ShiftLeft"],
    pause: ["Escape", "KeyP"],
  },
  chef: {
    plate1: ["Digit1"],
    plate2: ["Digit2"],
    plate3: ["Digit3"],
    next: ["Space", "Enter"],
    undo: ["Backspace"],
    trash: ["Delete"],
    board: ["KeyQ"],
    pan: ["KeyW"],
    pot: ["KeyE"],
    oven: ["KeyR"],
    mixer: ["KeyT"],
    pause: ["Escape"],
  },
} as const satisfies Record<string, Record<string, readonly string[]>>;

export type KeyGame = keyof typeof DEFAULT_KEYS;
export const KEY_GAMES = Object.keys(DEFAULT_KEYS) as KeyGame[];
export type KeyAction<G extends KeyGame> = keyof (typeof DEFAULT_KEYS)[G] & string;
export type Keymap<G extends KeyGame> = Record<KeyAction<G>, string[]>;

/** 한 동작에 붙일 수 있는 키 수 */
export const KEYS_PER_ACTION = 2;

/** 설정에서 막는 키 — 브라우저·OS 가 먼저 가져가거나 탭 이동에 필요하다 */
const BLOCKED = new Set(["Tab", "MetaLeft", "MetaRight", "ContextMenu", "F5", "F11", "F12"]);
export const isBindable = (code: string) => !!code && !BLOCKED.has(code);

export function actionsOf<G extends KeyGame>(game: G): KeyAction<G>[] {
  return Object.keys(DEFAULT_KEYS[game]) as KeyAction<G>[];
}

export function defaultKeymap<G extends KeyGame>(game: G): Keymap<G> {
  const out = {} as Keymap<G>;
  for (const a of actionsOf(game)) out[a] = [...(DEFAULT_KEYS[game] as Record<string, readonly string[]>)[a]];
  return out;
}

type Stored = Partial<Record<KeyGame, Record<string, string[]>>>;

function readAll(): Stored {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEYS_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === "object" ? (v as Stored) : {};
  } catch {
    return {};
  }
}

/** 저장된 값 + 기본값. 저장값이 망가졌거나 동작이 새로 생겼으면 그 동작만 기본값 */
export function readKeymap<G extends KeyGame>(game: G): Keymap<G> {
  const map = defaultKeymap(game);
  const saved = readAll()[game];
  if (!saved) return map;
  for (const a of actionsOf(game)) {
    const keys = saved[a];
    if (Array.isArray(keys) && keys.every((k) => typeof k === "string" && isBindable(k))) {
      map[a] = keys.slice(0, KEYS_PER_ACTION);
    }
  }
  return map;
}

export function writeKeymap<G extends KeyGame>(game: G, map: Keymap<G> | null): void {
  const all = readAll();
  if (map) all[game] = map;
  else delete all[game];
  try {
    localStorage.setItem(KEYS_KEY, JSON.stringify(all));
  } catch {
    // 저장 못 해도 이번 화면은 적용된다
  }
  window.dispatchEvent(new Event(KEYS_EVENT));
}

/**
 * `action` 의 `slot` 번째 키를 `code` 로 바꾼다. 같은 게임의 다른 동작이 그 키를 쓰고 있으면
 * 거기서는 뺀다 — 한 키가 두 동작을 동시에 하지 않게.
 */
export function bindKey<G extends KeyGame>(map: Keymap<G>, action: KeyAction<G>, slot: number, code: string): Keymap<G> {
  const next = {} as Keymap<G>;
  for (const a of Object.keys(map) as KeyAction<G>[]) next[a] = map[a].filter((k) => k !== code);
  const keys = next[action];
  if (slot < keys.length) keys[slot] = code;
  else keys.push(code);
  next[action] = keys.slice(0, KEYS_PER_ACTION);
  return next;
}

export function unbindKey<G extends KeyGame>(map: Keymap<G>, action: KeyAction<G>, slot: number): Keymap<G> {
  return { ...map, [action]: map[action].filter((_, i) => i !== slot) };
}

/** 이 키가 무슨 동작인지 (없으면 null) */
export function actionOf<G extends KeyGame>(map: Keymap<G>, code: string): KeyAction<G> | null {
  for (const a of Object.keys(map) as KeyAction<G>[]) if (map[a].includes(code)) return a;
  return null;
}

/** 화면에 띄우는 키 이름 — `KeyA` → `A`, `ArrowUp` → `↑` */
export function keyLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  const named: Record<string, string> = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Space: "Space",
    Enter: "Enter",
    Escape: "Esc",
    Backspace: "⌫",
    Delete: "Del",
    ShiftLeft: "L-Shift",
    ShiftRight: "R-Shift",
    ControlLeft: "L-Ctrl",
    ControlRight: "R-Ctrl",
    AltLeft: "L-Alt",
    AltRight: "R-Alt",
    Semicolon: ";",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Quote: "'",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Minus: "-",
    Equal: "=",
    Backquote: "`",
  };
  return named[code] ?? code;
}

/** 주 키 이름 (키 안내 배지용) — 키가 없으면 빈 문자열 */
export function primaryLabel<G extends KeyGame>(map: Keymap<G>, action: KeyAction<G>): string {
  const k = map[action][0];
  return k ? keyLabel(k) : "";
}

/**
 * 게임 화면용 — 키 설정을 ref 로 들고 있고, 설정이 바뀌면 갱신한다.
 * 이벤트 핸들러는 `ref.current` 를 읽으면 되니 효과를 다시 걸 필요가 없다.
 */
export function useKeymap<G extends KeyGame>(game: G) {
  const ref = useRef<Keymap<G>>(defaultKeymap(game));
  useEffect(() => {
    const load = () => {
      ref.current = readKeymap(game);
    };
    load();
    const onStorage = (e: StorageEvent) => e.key === KEYS_KEY && load();
    window.addEventListener(KEYS_EVENT, load);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(KEYS_EVENT, load);
      window.removeEventListener("storage", onStorage);
    };
  }, [game]);
  return ref;
}

/** 화면에 키 이름을 그릴 때 — 설정이 바뀌면 다시 그린다 (입력 처리는 `useKeymap` 의 ref 로) */
export function useKeymapState<G extends KeyGame>(game: G): Keymap<G> {
  const [map, setMap] = useState<Keymap<G>>(() => defaultKeymap(game));
  useEffect(() => {
    const load = () => setMap(readKeymap(game));
    load();
    const onStorage = (e: StorageEvent) => e.key === KEYS_KEY && load();
    window.addEventListener(KEYS_EVENT, load);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(KEYS_EVENT, load);
      window.removeEventListener("storage", onStorage);
    };
  }, [game]);
  return map;
}
