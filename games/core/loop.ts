/** requestAnimationFrame 루프 (게임 엔진 라이브러리 없이 직접 구현 — §0) */
export type LoopHandle = { stop: () => void };

export function startLoop(step: (dt: number, elapsed: number) => void): LoopHandle {
  let raf = 0;
  let last = performance.now();
  const start = last;
  let running = true;

  const tick = (now: number) => {
    if (!running) return;
    // 탭 전환 등으로 프레임이 크게 벌어지면 물리가 튀므로 0.05초로 자른다
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt, (now - start) / 1000);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}
