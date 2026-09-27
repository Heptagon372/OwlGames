// 🧩 아울리스 — 색 (§37~§40 NEON CYBER OWL) · 네온 + 유리 UI (DECISIONS §5-21)
//
// 화면 문법은 플랫폼 디자인 시스템(§5-10 리퀴드 글래스)과 같다:
//   짙은 남색 위에 반투명 유리판 · 1px 시안→바이올렛→마젠타 헤어라인 · 바깥으로 번지는 부드러운 발광 · 알약 모양 버튼.
// 게임은 다크 한 가지라 플랫폼 유틸(.glass — 라이트에서 값이 바뀐다) 대신 여기 상수로 직접 그린다.
// DOM 글자색도 같은 이유로 `text-ink` 같은 테마 토큰 대신 고정 색(text-[#e9edfb] 등)을 쓴다 — 라이트 테마에서도 게임 화면은 어둡다.
//
// 색 역할
//   · 플레이어 필드 = 시안 → 바이올렛 / AI 필드 = 바이올렛 → 마젠타 → LEVEL 이 오를수록 붉은 경고 (§39)
//   · 블록 4색은 **색 + 도형**으로 구분한다 (색각 이상·작은 화면에서도 헷갈리지 않게)
//       1 시안 ◆  2 바이올렛 ●  3 마젠타 ▲  4 옐로 ★
//   · 방해 블록 = 어두운 유리 + 붉은 균열 (§12)
//   · 앰버(#ffb020)는 플랫폼에서 부엉이·에너지·티켓 전용이라 블록 노랑은 다른 톤을 쓴다
// 렌더는 색을 직접 쓰지 말고 여기 값을 거친다.

import type { CSSProperties } from "react";
import { COLORS } from "@/games/core/canvas";

export const OWLIS = {
  bg: "#050814",
  bg2: "#0b1030",
  grid: "rgba(120,150,255,0.07)",
  /** 유리판 바탕 (반투명) */
  glass: "rgba(22,28,58,0.62)",
  glassHi: "rgba(255,255,255,0.08)",
  panel: "rgba(16,24,50,0.78)",
  panelLine: "rgba(170,190,255,0.16)",
  text: COLORS.ink,
  dim: COLORS.mute,
  player: COLORS.aqua,
  ai: COLORS.neon,
  aiHot: COLORS.magenta,
  danger: COLORS.alert,
  gold: "#fde68a",
  fever: "#c084fc",
  /** 블록 색 (index = 셀 값) — 0·5 는 안 쓴다 */
  block: ["", "#22d3ee", "#a78bfa", "#f472d0", "#facc15"] as readonly string[],
  /** 블록 밝은 쪽 (유리 윗면) */
  blockLight: ["", "#a5f3fc", "#ddd6fe", "#fbcfe8", "#fef08a"] as readonly string[],
  /** 블록 안쪽 (어두운 톤) */
  blockDeep: ["", "#0b3b4a", "#2a2160", "#4a1540", "#4a3a08"] as readonly string[],
  garbage: "#3a4060",
  garbageDeep: "#161a2c",
  garbageCrack: "#ff5c7a",
} as const;

/** 그라데이션 3색 — 시안 → 바이올렛 → 마젠타 (레퍼런스 헤어라인·링·게이지) */
export const GRAD = {
  cyan: "#5eead4",
  aqua: COLORS.aqua,
  violet: COLORS.neon,
  magenta: COLORS.magenta,
} as const;

/** 블록마다 다른 도형 (접근성) */
export const GLYPH = ["", "diamond", "circle", "triangle", "star"] as const;
export type Glyph = (typeof GLYPH)[number];

/** AI LEVEL 에 따른 AI 쪽 색 — 보라 → 자홍 → 붉은 경고 (§39, §40). a·b = 테두리 그라데이션 양 끝 */
export function aiTone(d: number): { line: string; a: string; b: string; eye: string; body: string; hot: number } {
  if (d < 2) return { line: "#a78bfa", a: "#818cf8", b: "#c084fc", eye: "#67e8f9", body: "#1b1640", hot: 0 };
  if (d < 3) return { line: "#b794f6", a: "#a78bfa", b: "#d8b4fe", eye: "#e0e7ff", body: "#1d1444", hot: 0.1 };
  if (d < 4) return { line: "#d17af0", a: "#a78bfa", b: "#e879f9", eye: "#f9a8d4", body: "#22123f", hot: 0.25 };
  if (d < 5) return { line: "#e879f9", a: "#c084fc", b: "#fb7185", eye: "#fb7185", body: "#240f38", hot: 0.45 };
  if (d < 6) return { line: "#c026d3", a: "#e879f9", b: "#ff3d6e", eye: "#ff3355", body: "#12061d", hot: 0.7 };
  return { line: "#ff3d7f", a: "#ff3d7f", b: "#ff7a45", eye: "#ff1f3d", body: "#0c0410", hot: 1 };
}

/**
 * DOM 유리판 — 반투명 바탕 + 1px 그라데이션 헤어라인 (mask 없이 border-box 배경 두 겹으로).
 * `fill` 을 주면 그라데이션으로 채운 알약(주 버튼)이 된다.
 */
export function glassStyle(opts: { from?: string; via?: string; to?: string; fill?: boolean; glow?: string } = {}): CSSProperties {
  const from = opts.from ?? GRAD.aqua;
  const via = opts.via ?? GRAD.violet;
  const to = opts.to ?? GRAD.magenta;
  const line = `linear-gradient(135deg, ${from}, ${via}, ${to})`;
  if (opts.fill) {
    return {
      background: `linear-gradient(100deg, ${from}, ${via}) padding-box, linear-gradient(135deg, #ffffffaa, ${to}) border-box`,
      border: "1px solid transparent",
      boxShadow: `0 0 24px ${opts.glow ?? from}66, inset 0 1px 0 rgba(255,255,255,0.45)`,
    };
  }
  return {
    // 반투명 유리 층 아래에 불투명 남색을 한 겹 — 없으면 테두리용 그라데이션이 판 전체로 비쳐 뿌옇게 된다
    background: `linear-gradient(180deg, rgba(58,70,130,0.34), rgba(14,18,40,0.2)) padding-box, linear-gradient(${OWLIS.bg2}, ${OWLIS.bg2}) padding-box, ${line} border-box`,
    border: "1px solid transparent",
    // 네온 번짐 — 테두리 가운데 색이 늘 은은하게, 강조할 때(glow)는 더 세게
    boxShadow: `0 0 ${opts.glow ? 26 : 14}px ${opts.glow ?? via}${opts.glow ? "77" : "44"}, inset 0 0 12px ${via}22, inset 0 1px 0 rgba(255,255,255,0.10), 0 10px 30px rgba(0,0,0,0.35)`,
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
  };
}
