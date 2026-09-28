"use client";

// 가상 조이스틱 (기획서 §2) — 화면 왼쪽 절반 어디를 눌러도 그 지점이 원점.
import { useEffect, useRef, useState } from "react";
import { actionOf, useKeymap } from "@/lib/keybinds";

const RADIUS = 60;

export type Vec = { x: number; y: number };

export function Joystick({ onChange }: { onChange: (v: Vec) => void }) {
  const [origin, setOrigin] = useState<Vec | null>(null);
  const [knob, setKnob] = useState<Vec>({ x: 0, y: 0 });
  const pointerId = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // 키보드 (PC) — 키는 설정에서 바꾼다 (lib/keybinds.ts 의 DEFAULT_KEYS.survive)
  const keysRef = useKeymap("survive");
  useEffect(() => {
    const held = new Set<string>();
    const emit = () => {
      const x = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
      const y = (held.has("down") ? 1 : 0) - (held.has("up") ? 1 : 0);
      onChangeRef.current({ x, y });
    };
    const dirOf = (code: string) => {
      const a = actionOf(keysRef.current, code);
      return a === "up" || a === "down" || a === "left" || a === "right" ? a : null;
    };
    // 같은 방향에 키가 두 개(W·↑)일 수 있어서 누른 키를 따로 센다
    const pressed = new Map<string, string>();
    const down = (e: KeyboardEvent) => {
      const dir = dirOf(e.code);
      if (!dir) return;
      e.preventDefault();
      pressed.set(e.code, dir);
      held.add(dir);
      emit();
    };
    const up = (e: KeyboardEvent) => {
      const dir = pressed.get(e.code);
      if (!dir) return;
      pressed.delete(e.code);
      if (![...pressed.values()].includes(dir)) held.delete(dir);
      emit();
    };
    const blur = () => {
      pressed.clear();
      held.clear();
      emit();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [keysRef]);

  return (
    <div
      className="absolute inset-y-0 left-0 w-1/2 touch-none"
      onPointerDown={(e) => {
        e.preventDefault();
        pointerId.current = e.pointerId;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        const rect = e.currentTarget.getBoundingClientRect();
        setOrigin({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        setKnob({ x: 0, y: 0 });
      }}
      onPointerMove={(e) => {
        if (pointerId.current !== e.pointerId || !origin) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const dx = e.clientX - rect.left - origin.x;
        const dy = e.clientY - rect.top - origin.y;
        const d = Math.hypot(dx, dy);
        const clamp = d > RADIUS ? RADIUS / d : 1;
        setKnob({ x: dx * clamp, y: dy * clamp });
        onChangeRef.current({ x: (dx * clamp) / RADIUS, y: (dy * clamp) / RADIUS });
      }}
      onPointerUp={() => {
        pointerId.current = null;
        setOrigin(null);
        setKnob({ x: 0, y: 0 });
        onChangeRef.current({ x: 0, y: 0 });
      }}
      onPointerCancel={() => {
        pointerId.current = null;
        setOrigin(null);
        onChangeRef.current({ x: 0, y: 0 });
      }}
    >
      {origin && (
        <>
          <span
            className="pointer-events-none absolute rounded-full border-2 border-aqua/40"
            style={{ left: origin.x - RADIUS, top: origin.y - RADIUS, width: RADIUS * 2, height: RADIUS * 2 }}
          />
          <span
            className="pointer-events-none absolute size-10 rounded-full bg-aqua/50 shadow-[0_0_20px_rgba(61,217,235,0.6)]"
            style={{ left: origin.x + knob.x - 20, top: origin.y + knob.y - 20 }}
          />
        </>
      )}
    </div>
  );
}
