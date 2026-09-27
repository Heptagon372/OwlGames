// 저사양 기기 렌더 해상도 자동 조절 (기획서 §14 저사양 감지의 캔버스 공통판 — DECISIONS §5-38)
//
// 폰에서 캔버스 비용의 대부분은 픽셀 채우기(발광 shadowBlur·그라데이션·반투명 겹침)다.
// 프레임이 계속 밀리면 DPR 을 2 → 1.5 → 1 로 한 단계씩 내린다 — 채울 픽셀이 단계마다 약 절반이 된다.
// 내리기만 한다: 오르내리면 화면이 번갈아 흐려졌다 선명해진다.

/** 이보다 느린 구간이 이어지면 내린다 */
const TARGET_FPS = 45;
/** fps 를 재는 구간 길이 */
const WINDOW_MS = 1000;
/** 느린 구간이 몇 번 이어져야 내리는가 */
const BAD_WINDOWS = 2;
/** 시작 직후(그림 디코드·JIT)는 재지 않는다 */
const WARMUP_MS = 2000;
/** 이보다 긴 프레임 틈은 탭 전환·일시정지 — 구간을 버린다 */
const GAP_MS = 250;
const STEPS = [2, 1.5, 1];

export type DprGovernor = {
  /** 지금 써야 할 DPR */
  readonly dpr: number;
  /** 매 그리기마다 부른다. DPR 이 바뀌었으면 true — 캔버스 크기를 다시 맞출 것 */
  frame(now: number): boolean;
};

export function createDprGovernor(): DprGovernor {
  let dpr = Math.min(2, window.devicePixelRatio || 1);
  let start = -1;
  let last = 0;
  let winStart = 0;
  let frames = 0;
  let bad = 0;

  return {
    get dpr() {
      return dpr;
    },
    frame(now) {
      if (start < 0) {
        start = last = winStart = now;
        return false;
      }
      const gap = now - last;
      last = now;
      if (gap > GAP_MS || now - start < WARMUP_MS) {
        winStart = now;
        frames = 0;
        return false;
      }
      frames++;
      const span = now - winStart;
      if (span < WINDOW_MS) return false;
      const fps = (frames * 1000) / span;
      winStart = now;
      frames = 0;
      bad = fps < TARGET_FPS ? bad + 1 : 0;
      if (bad < BAD_WINDOWS) return false;
      bad = 0;
      const next = STEPS.find((s) => s < dpr - 0.01);
      if (next === undefined) return false;
      dpr = next;
      return true;
    },
  };
}
