"use client";

import { useEffect, useRef, useState } from "react";
import { COLORS, fitCanvas, font, onResize, roundRect } from "../core/canvas";
import { startLoop } from "../core/loop";
import type { GameComponentProps } from "../core/types";
import { TYPER_WORDS, type TyperDifficulty } from "@/data/typer-words";

const DURATION = 60;
const FIREWALL_STEP = 20;

type Block = {
  text: string;
  x: number;
  y: number;
  vy: number;
  w: number;
  diff: TyperDifficulty;
};

type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string };

const DIFF_COLOR: Record<TyperDifficulty, string> = {
  easy: COLORS.aqua,
  normal: COLORS.neon,
  hard: COLORS.alert,
};

/** 경과 시간에 따른 난이도 가중치 */
function pickDifficulty(t: number): TyperDifficulty {
  const r = Math.random();
  if (t < 20) return r < 0.7 ? "easy" : "normal";
  if (t < 40) return r < 0.3 ? "easy" : r < 0.8 ? "normal" : "hard";
  return r < 0.15 ? "easy" : r < 0.6 ? "normal" : "hard";
}

function comboMul(streak: number): number {
  if (streak >= 10) return 2;
  if (streak >= 6) return 1.5;
  if (streak >= 3) return 1.2;
  return 1;
}

/** 🎮 나이트 타이퍼 — 떨어지는 명령어를 타이핑해 방화벽을 막는다 (§7.1) */
export function TyperGame({ onEnd }: GameComponentProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typedRef = useRef("");
  const submitRef = useRef<((value: string) => void) | null>(null);
  const endedRef = useRef(false);
  const [typed, setTyped] = useState("");
  const [shake, setShake] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // StrictMode의 재마운트(정리 → 재실행)에서도 다시 플레이할 수 있게 초기화
    endedRef.current = false;

    let { w, h } = fitCanvas(canvas);

    const blocks: Block[] = [];
    const sparks: Spark[] = [];
    let score = 0;
    let streak = 0;
    let maxStreak = 0;
    let hits = 0;
    let misses = 0;
    let firewall = 0;
    let nextSpawn = 0.4;
    let elapsed = 0;

    const fit = () => {
      // 모바일 키보드가 올라와도 플레이 영역이 보이도록 높이를 실제 보이는 영역에 맞춘다 (§7.1)
      const vv = window.visualViewport;
      if (vv) {
        const top = root.getBoundingClientRect().top;
        root.style.height = `${Math.max(260, vv.offsetTop + vv.height - top)}px`;
      }
      ({ w, h } = fitCanvas(canvas));
    };
    const offResize = onResize(fit);
    fit();

    const spawn = () => {
      const diff = pickDifficulty(elapsed);
      const pool = TYPER_WORDS[diff];
      const text = pool[Math.floor(Math.random() * pool.length)];
      ctx.font = font(600, 15);
      const bw = Math.min(w - 24, ctx.measureText(text).width + 28);
      blocks.push({
        text,
        w: bw,
        x: 12 + Math.random() * Math.max(1, w - bw - 24),
        y: -28,
        vy: 46 + elapsed * 1.7 + (diff === "hard" ? 8 : 0),
        diff,
      });
    };

    const burst = (x: number, y: number, color: string) => {
      for (let i = 0; i < 14; i++) {
        const a = (Math.PI * 2 * i) / 14 + Math.random();
        const s = 60 + Math.random() * 140;
        sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, color });
      }
    };

    const finish = () => {
      if (endedRef.current) return;
      endedRef.current = true;
      loop.stop();
      offResize();
      onEnd(Math.round(score), {
        hits,
        misses,
        max_combo: maxStreak,
        firewall,
        duration_sec: Math.round(elapsed),
      });
    };

    const submit = (value: string) => {
      const text = value.trim();
      if (!text) return;
      // 같은 단어가 여러 개면 가장 아래 것부터 파괴
      let idx = -1;
      for (let i = 0; i < blocks.length; i++) {
        if (blocks[i].text.toLowerCase() === text.toLowerCase() && (idx === -1 || blocks[i].y > blocks[idx].y)) idx = i;
      }
      if (idx === -1) {
        streak = 0;
        setShake((s) => s + 1);
        return;
      }
      const b = blocks[idx];
      const mul = comboMul(streak);
      score += b.text.length * mul * 10;
      streak++;
      maxStreak = Math.max(maxStreak, streak);
      hits++;
      burst(b.x + b.w / 2, b.y, DIFF_COLOR[b.diff]);
      blocks.splice(idx, 1);
    };

    submitRef.current = submit;
    inputRef.current?.focus();

    const loop = startLoop((dt) => {
      elapsed += dt;
      const left = Math.max(0, DURATION - elapsed);

      // 스폰
      nextSpawn -= dt;
      if (nextSpawn <= 0 && left > 0.5) {
        spawn();
        nextSpawn = Math.max(0.62, 1.7 - elapsed * 0.018);
      }

      // 이동
      const floorY = h - 34;
      for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i];
        b.y += b.vy * dt;
        if (b.y >= floorY) {
          blocks.splice(i, 1);
          misses++;
          streak = 0;
          firewall = Math.min(100, firewall + FIREWALL_STEP);
          burst(b.x + b.w / 2, floorY, COLORS.alert);
          setShake((s) => s + 1);
        }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life -= dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += 260 * dt;
        if (s.life <= 0) sparks.splice(i, 1);
      }

      // ---- 그리기 ----
      ctx.clearRect(0, 0, w, h);

      // 배경 격자
      ctx.strokeStyle = "rgba(61,217,235,0.06)";
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 28) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
        ctx.stroke();
      }

      // 방화벽 (바닥)
      const fwH = 26;
      ctx.fillStyle = "rgba(255,92,122,0.12)";
      ctx.fillRect(0, h - fwH, w, fwH);
      ctx.fillStyle = "rgba(255,92,122,0.45)";
      ctx.fillRect(0, h - fwH, (w * firewall) / 100, fwH);
      ctx.strokeStyle = "rgba(255,92,122,0.6)";
      ctx.beginPath();
      ctx.moveTo(0, h - fwH + 0.5);
      ctx.lineTo(w, h - fwH + 0.5);
      ctx.stroke();
      ctx.fillStyle = COLORS.ink;
      ctx.font = font(700, 11);
      ctx.textAlign = "center";
      ctx.fillText(`FIREWALL ${firewall}%`, w / 2, h - fwH / 2 + 4);

      // 블록
      ctx.textAlign = "left";
      for (const b of blocks) {
        const color = DIFF_COLOR[b.diff];
        const matched = b.text.toLowerCase().startsWith(typedRef.current.toLowerCase()) && typedRef.current.length > 0;
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = matched ? 18 : 6;
        ctx.fillStyle = matched ? "rgba(255,176,32,0.18)" : "rgba(20,27,51,0.92)";
        ctx.strokeStyle = matched ? COLORS.neon : color;
        ctx.lineWidth = matched ? 2 : 1.2;
        roundRect(ctx, b.x, b.y - 20, b.w, 28, 8);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.font = font(600, 15);
        const tx = b.x + 14;
        if (matched) {
          const done = b.text.slice(0, typedRef.current.length);
          ctx.fillStyle = COLORS.neon;
          ctx.fillText(done, tx, b.y);
          ctx.fillStyle = COLORS.ink;
          ctx.fillText(b.text.slice(typedRef.current.length), tx + ctx.measureText(done).width, b.y);
        } else {
          ctx.fillStyle = COLORS.ink;
          ctx.fillText(b.text, tx, b.y);
        }
      }

      // 파티클
      for (const s of sparks) {
        ctx.globalAlpha = Math.max(0, s.life * 2);
        ctx.fillStyle = s.color;
        ctx.fillRect(s.x, s.y, 3, 3);
      }
      ctx.globalAlpha = 1;

      // HUD
      ctx.font = font(800, 13);
      ctx.textAlign = "left";
      ctx.fillStyle = COLORS.mute;
      ctx.fillText("SCORE", 12, 20);
      ctx.fillStyle = COLORS.neon;
      ctx.font = font(800, 20);
      ctx.fillText(String(Math.round(score)), 12, 42);

      ctx.textAlign = "right";
      ctx.font = font(800, 13);
      ctx.fillStyle = COLORS.mute;
      ctx.fillText("TIME", w - 12, 20);
      ctx.fillStyle = left < 10 ? COLORS.alert : COLORS.aqua;
      ctx.font = font(800, 20);
      ctx.fillText(left.toFixed(1), w - 12, 42);

      const mul = comboMul(streak);
      if (mul > 1) {
        ctx.textAlign = "center";
        ctx.fillStyle = COLORS.neonSoft;
        ctx.font = font(900, 18);
        ctx.fillText(`COMBO x${mul}`, w / 2, 34);
      }

      // 남은 시간 바
      ctx.fillStyle = "rgba(61,217,235,0.25)";
      ctx.fillRect(0, 0, (w * left) / DURATION, 3);

      if (left <= 0 || firewall >= 100) finish();
    });

    return () => {
      endedRef.current = true;
      submitRef.current = null;
      loop.stop();
      offResize();
    };
  }, [onEnd]);

  // Enter(또는 모바일 전송키) → 게임 루프 안의 submit으로 넘긴다
  const send = () => {
    submitRef.current?.(typedRef.current);
    typedRef.current = "";
    setTyped("");
  };

  return (
    <div ref={rootRef} className="flex h-full flex-col select-none">
      <div className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>
      <form
        className="shrink-0 border-t border-line bg-panel/90 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div
          key={shake}
          className={`flex items-center gap-2 rounded-2xl border border-line bg-night px-3 ${shake ? "animate-shake" : ""}`}
        >
          <span className="font-mono text-sm text-neon">$</span>
          <input
            ref={inputRef}
            value={typed}
            onChange={(e) => {
              typedRef.current = e.target.value;
              setTyped(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              send();
            }}
            className="num min-h-12 w-full bg-transparent text-[16px] text-ink outline-none placeholder:text-dim"
            placeholder="명령어를 입력하고 Enter"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="send"
            aria-label="명령어 입력"
          />
        </div>
      </form>
    </div>
  );
}
