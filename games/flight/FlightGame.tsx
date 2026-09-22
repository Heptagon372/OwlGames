"use client";

import { useEffect, useRef } from "react";
import { COLORS, fitCanvas, font, mulberry32, onResize, roundRect } from "../core/canvas";
import { startLoop } from "../core/loop";
import type { GameComponentProps } from "../core/types";

const MAX_SEC = 180; // §7.2 세션 검증 상한
const GRAVITY = 1250;
const FLAP = -400;
const PX_PER_M = 18;

type Lamp = { kind: "lamp"; x: number; gapY: number; gap: number; passed: boolean };
type Wire = { kind: "wire"; x: number; y: number; w: number };
type Bug = { kind: "bug"; x: number; y: number; baseY: number; amp: number; phase: number };
type Item = { kind: "coffee" | "star"; x: number; y: number; taken: boolean };
type Entity = Lamp | Wire | Bug | Item;

/** 🦉 올빼미 비행 — 원버튼 아케이드 (§7.2) */
export function FlightGame({ onEnd }: GameComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const endedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // StrictMode의 재마운트(정리 → 재실행)에서도 다시 플레이할 수 있게 초기화
    endedRef.current = false;

    let { w, h } = fitCanvas(canvas);
    const offResize = onResize(() => ({ w, h } = fitCanvas(canvas)));
    const rnd = mulberry32(Date.now() & 0xffff);

    const groundH = 56;
    let owlY = h * 0.42;
    let vy = 0;
    let wing = 0;
    let travelled = 0; // px
    let stars = 0;
    let elapsed = 0;
    let wall = 0; // 시작 전 대기까지 포함한 실제 경과 (세션 상한 방어)
    let invincible = 0;
    let started = false;
    let dead = false;
    let nextSpawnX = 320;
    const entities: Entity[] = [];
    const puffs: { x: number; y: number; life: number }[] = [];
    // 배경 빌딩 (패럴랙스)
    const buildings = Array.from({ length: 22 }, (_, i) => ({
      x: i * 90 + rnd() * 40,
      w: 50 + rnd() * 46,
      h: 60 + rnd() * 120,
      lights: Math.floor(rnd() * 6),
    }));

    const speed = () => Math.min(340, 165 + travelled * 0.006);
    const owlX = () => Math.min(120, w * 0.28);

    const flap = () => {
      if (dead) return;
      started = true;
      vy = FLAP;
      wing = 1;
      puffs.push({ x: owlX() - 12, y: owlY + 10, life: 0.4 });
    };

    const onPointer = (e: Event) => {
      e.preventDefault();
      flap();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.key === "w") {
        e.preventDefault();
        flap();
      }
    };
    canvas.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);

    const finish = () => {
      if (endedRef.current) return;
      endedRef.current = true;
      loop.stop();
      cleanup();
      const meters = Math.floor(travelled / PX_PER_M);
      onEnd(meters + stars * 20, { meters, stars, duration_sec: Math.round(elapsed) });
    };

    const cleanup = () => {
      offResize();
      canvas.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };

    const spawn = () => {
      const roll = rnd();
      const top = 40;
      const bottom = h - groundH - 40;
      if (roll < 0.58) {
        const gap = Math.max(132, 210 - travelled * 0.004);
        const gapY = top + gap / 2 + rnd() * Math.max(10, bottom - top - gap);
        entities.push({ kind: "lamp", x: w + 40, gapY, gap, passed: false });
        nextSpawnX = 260 + rnd() * 120;
      } else if (roll < 0.8) {
        entities.push({ kind: "wire", x: w + 40, y: top + rnd() * (bottom - top), w: 90 + rnd() * 90 });
        nextSpawnX = 200 + rnd() * 120;
      } else {
        const baseY = top + 40 + rnd() * (bottom - top - 80);
        entities.push({ kind: "bug", x: w + 30, y: baseY, baseY, amp: 30 + rnd() * 50, phase: rnd() * 6.28 });
        nextSpawnX = 220 + rnd() * 140;
      }
      // 아이템
      if (rnd() < 0.42) {
        entities.push({
          kind: rnd() < 0.25 ? "coffee" : "star",
          x: w + 40 + 120 + rnd() * 160,
          y: 60 + rnd() * (h - groundH - 140),
          taken: false,
        });
      }
    };

    const hit = (cx: number, cy: number, r: number, rx: number, ry: number, rw: number, rh: number) => {
      const nx = Math.max(rx, Math.min(cx, rx + rw));
      const ny = Math.max(ry, Math.min(cy, ry + rh));
      return (nx - cx) ** 2 + (ny - cy) ** 2 < r * r;
    };

    const loop = startLoop((dt) => {
      wall += dt;
      if (started && !dead) elapsed += dt;
      const sp = speed();
      const ox = owlX();
      const r = 15;

      if (started && !dead) {
        vy = Math.min(760, vy + GRAVITY * dt);
        owlY += vy * dt;
        travelled += sp * dt;
        invincible = Math.max(0, invincible - dt);
        wing = Math.max(0, wing - dt * 3);

        nextSpawnX -= sp * dt;
        if (nextSpawnX <= 0) spawn();

        // 천장·바닥
        if (owlY < r) {
          owlY = r;
          vy = 0;
        }
        if (owlY > h - groundH - r) dead = true;

        for (let i = entities.length - 1; i >= 0; i--) {
          const e = entities[i];
          e.x -= sp * dt;
          if (e.x < -220) {
            entities.splice(i, 1);
            continue;
          }
          if (e.kind === "lamp") {
            const poleW = 26;
            const topH = e.gapY - e.gap / 2;
            const botY = e.gapY + e.gap / 2;
            if (
              !invincible &&
              (hit(ox, owlY, r, e.x, 0, poleW, topH) || hit(ox, owlY, r, e.x, botY, poleW, h - groundH - botY))
            ) {
              dead = true;
            }
          } else if (e.kind === "wire") {
            if (!invincible && hit(ox, owlY, r, e.x, e.y - 3, e.w, 6)) dead = true;
          } else if (e.kind === "bug") {
            e.y = e.baseY + Math.sin(elapsed * 2 + e.phase) * e.amp;
            if (!invincible && (ox - e.x) ** 2 + (owlY - e.y) ** 2 < (r + 13) ** 2) dead = true;
          } else if (!e.taken && (ox - e.x) ** 2 + (owlY - e.y) ** 2 < (r + 18) ** 2) {
            e.taken = true;
            if (e.kind === "star") stars++;
            else invincible = 3;
            entities.splice(i, 1);
          }
        }
      }

      for (let i = puffs.length - 1; i >= 0; i--) {
        puffs[i].life -= dt;
        puffs[i].x -= sp * dt;
        if (puffs[i].life <= 0) puffs.splice(i, 1);
      }

      // ---- 그리기 ----
      ctx.clearRect(0, 0, w, h);
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#0b1020");
      grad.addColorStop(1, "#141b33");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // 달 + 별
      ctx.fillStyle = "rgba(255,226,170,0.9)";
      ctx.beginPath();
      ctx.arc(w - 60, 62, 26, 0, 7);
      ctx.fill();
      ctx.fillStyle = "rgba(20,27,51,1)";
      ctx.beginPath();
      ctx.arc(w - 72, 54, 24, 0, 7);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      for (let i = 0; i < 40; i++) {
        const sx = (i * 137.5 - travelled * 0.06) % (w + 40);
        const sy = (i * 61.8) % (h - groundH - 80);
        ctx.fillRect(sx < 0 ? sx + w + 40 : sx, sy, 2, 2);
      }

      // 빌딩 실루엣
      ctx.fillStyle = "#0f1730";
      for (const b of buildings) {
        const bx = ((b.x - travelled * 0.25) % (buildings.length * 90)) + buildings.length * 90;
        const x = bx % (buildings.length * 90);
        if (x > w + 100) continue;
        const y = h - groundH - b.h;
        ctx.fillRect(x, y, b.w, b.h);
        ctx.fillStyle = "rgba(255,176,32,0.35)";
        for (let i = 0; i < b.lights; i++) {
          ctx.fillRect(x + 8 + (i % 3) * 14, y + 12 + Math.floor(i / 3) * 18, 6, 8);
        }
        ctx.fillStyle = "#0f1730";
      }

      // 장애물 · 아이템
      for (const e of entities) {
        if (e.kind === "lamp") {
          const poleW = 26;
          const topH = e.gapY - e.gap / 2;
          const botY = e.gapY + e.gap / 2;
          ctx.fillStyle = "#232e55";
          ctx.strokeStyle = "rgba(61,217,235,0.35)";
          ctx.lineWidth = 1.5;
          roundRect(ctx, e.x, -10, poleW, topH + 10, 6);
          ctx.fill();
          ctx.stroke();
          roundRect(ctx, e.x, botY, poleW, h - groundH - botY, 6);
          ctx.fill();
          ctx.stroke();
          // 가로등 불빛
          ctx.fillStyle = "rgba(255,176,32,0.9)";
          ctx.beginPath();
          ctx.arc(e.x + poleW / 2, topH - 2, 7, 0, 7);
          ctx.fill();
          ctx.fillStyle = "rgba(255,176,32,0.12)";
          ctx.beginPath();
          ctx.moveTo(e.x + poleW / 2, topH);
          ctx.lineTo(e.x - 26, topH + 74);
          ctx.lineTo(e.x + poleW + 26, topH + 74);
          ctx.closePath();
          ctx.fill();
        } else if (e.kind === "wire") {
          ctx.strokeStyle = "rgba(255,92,122,0.85)";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.quadraticCurveTo(e.x + e.w / 2, e.y + 12, e.x + e.w, e.y);
          ctx.stroke();
        } else if (e.kind === "bug") {
          ctx.font = "26px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("🐛", e.x, e.y + 9);
        } else {
          ctx.font = "26px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(e.kind === "coffee" ? "☕" : "⭐", e.x, e.y + 9);
        }
      }

      // 바닥
      ctx.fillStyle = "#0a0f1f";
      ctx.fillRect(0, h - groundH, w, groundH);
      ctx.strokeStyle = "rgba(61,217,235,0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h - groundH + 0.5);
      ctx.lineTo(w, h - groundH + 0.5);
      ctx.stroke();
      ctx.fillStyle = "rgba(61,217,235,0.12)";
      for (let x = -((travelled * 0.6) % 40); x < w; x += 40) ctx.fillRect(x, h - groundH + 14, 22, 3);

      // 날갯짓 자국
      for (const p of puffs) {
        ctx.globalAlpha = Math.max(0, p.life * 1.6);
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10 * (1 - p.life), 0, 7);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // 부엉이
      ctx.save();
      ctx.translate(ox, owlY);
      ctx.rotate(Math.max(-0.5, Math.min(0.9, vy / 900)));
      if (invincible > 0) {
        ctx.shadowColor = COLORS.neon;
        ctx.shadowBlur = 22;
      }
      // 날개
      ctx.fillStyle = "#2a3665";
      ctx.beginPath();
      ctx.ellipse(-4, wing > 0.4 ? -8 : 6, 13, 7, wing > 0.4 ? -0.6 : 0.5, 0, 7);
      ctx.fill();
      // 몸
      ctx.fillStyle = "#3a4a86";
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, 7);
      ctx.fill();
      // 귀깃
      ctx.fillStyle = "#2a3665";
      ctx.beginPath();
      ctx.moveTo(-11, -11);
      ctx.lineTo(-6, -22);
      ctx.lineTo(-2, -12);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(11, -11);
      ctx.lineTo(6, -22);
      ctx.lineTo(2, -12);
      ctx.closePath();
      ctx.fill();
      // 눈 · 부리
      ctx.fillStyle = "#0b1020";
      ctx.beginPath();
      ctx.arc(4, -4, 6, 0, 7);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-6, -4, 6, 0, 7);
      ctx.fill();
      ctx.fillStyle = COLORS.neon;
      ctx.beginPath();
      ctx.arc(4.5, -4, 3, 0, 7);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-5.5, -4, 3, 0, 7);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(17, 3);
      ctx.lineTo(10, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // HUD
      const meters = Math.floor(travelled / PX_PER_M);
      ctx.textAlign = "left";
      ctx.font = font(800, 13);
      ctx.fillStyle = COLORS.mute;
      ctx.fillText("DISTANCE", 12, 20);
      ctx.font = font(800, 22);
      ctx.fillStyle = COLORS.aqua;
      ctx.fillText(`${meters}m`, 12, 44);
      ctx.textAlign = "right";
      ctx.font = font(800, 18);
      ctx.fillStyle = COLORS.neon;
      ctx.fillText(`⭐ ${stars}`, w - 12, 30);
      if (invincible > 0) {
        ctx.font = font(800, 13);
        ctx.fillStyle = COLORS.neonSoft;
        ctx.fillText(`☕ ${invincible.toFixed(1)}s`, w - 12, 52);
      }

      if (!started) {
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(11,16,32,0.72)";
        roundRect(ctx, w / 2 - 130, h / 2 - 44, 260, 88, 16);
        ctx.fill();
        ctx.fillStyle = COLORS.ink;
        ctx.font = font(800, 16);
        ctx.fillText("화면을 탭해서 날아오르기", w / 2, h / 2 - 6);
        ctx.fillStyle = COLORS.mute;
        ctx.font = font(600, 13);
        ctx.fillText("탭 · 클릭 · 스페이스 = 날갯짓", w / 2, h / 2 + 20);
      }

      if (dead || elapsed >= MAX_SEC || wall >= MAX_SEC) finish();
    });

    return () => {
      endedRef.current = true;
      loop.stop();
      cleanup();
    };
  }, [onEnd]);

  return (
    <div className="h-full">
      <canvas ref={canvasRef} className="absolute inset-0 touch-none" aria-label="올빼미 비행 게임 화면" />
    </div>
  );
}
