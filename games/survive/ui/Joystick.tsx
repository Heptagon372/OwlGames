"use client";

// 가상 조이스틱 (기획서 §2) — 화면 왼쪽 절반 어디를 눌러도 그 지점이 원점.
import { useEffect, useRef, useState } from "react";

const RADIUS = 60;

export type Vec = { x: number; y: number };

export function Joystick({ onChange }: { onChange: (v: Vec) => void }) {
  const [origin, setOrigin] = useState<Vec | null>(null);
  const [knob, setKnob] = useState<Vec>({ x: 0, y: 0 });
  const pointerId = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // 키보드 (PC)
  useEffect(() => {
    const keys = new Set<string>();
    const emit = () => {
      const x = (keys.has("d") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("a") || keys.has("ArrowLeft") ? 1 : 0);
      const y = (keys.has("s") || keys.has("ArrowDown") ? 1 : 0) - (keys.has("w") || keys.has("ArrowUp") ? 1 : 0);
      onChangeRef.current({ x, y });
    };
    const down = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(k)) {
        e.preventDefault();
        keys.add(k);
        emit();
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (keys.delete(k)) emit();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

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
