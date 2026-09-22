// 고정 타임스텝 루프 (기획서 §14) — 누적자 방식, 탭 복귀 시 dt 클램프
import { CFG } from "../config";

export type Loop = { stop: () => void; setPaused: (p: boolean) => void };

export function startFixedLoop(step: (dt: number) => void, draw: () => void): Loop {
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let paused = false;
  let running = true;

  const frame = (now: number) => {
    if (!running) return;
    const elapsed = Math.min(CFG.physics.maxFrameSec, (now - last) / 1000);
    last = now;
    if (!paused) {
      acc += elapsed;
      let guard = 0;
      while (acc >= CFG.physics.dt && guard++ < 8) {
        step(CFG.physics.dt);
        acc -= CFG.physics.dt;
      }
    }
    draw();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    setPaused(p: boolean) {
      if (p === paused) return;
      paused = p;
      last = performance.now();
      acc = 0;
    },
  };
}
