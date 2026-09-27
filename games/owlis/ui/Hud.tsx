"use client";

// 🧩 아울리스 — 위쪽 HUD (§4): SCORE · AI LEVEL · TIME 유리 알약 + 가운데 배너 (§41 AI EVOLVED 등)

import { useTranslations } from "next-intl";
import { text, type Msg } from "@/games/core/i18n";
import { GRAD, OWLIS, aiTone, glassStyle } from "../theme";
import type { Banner } from "../types";

export type HudState = {
  score: number;
  t: number;
  level: string;
  d: number;
  combo: number;
  banner: Banner | null;
  critical: boolean;
  fever: boolean;
};

/** 배너 톤 → 그라데이션 글자 두 색 */
const TONE: Record<Banner["tone"], [string, string]> = {
  cyan: [GRAD.cyan, GRAD.violet],
  violet: [GRAD.violet, GRAD.magenta],
  red: [GRAD.magenta, OWLIS.danger],
  gold: [OWLIS.gold, GRAD.aqua],
};

function clock(sec: number): string {
  const s = Math.floor(sec);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function Hud({ hud }: { hud: HudState }) {
  const t = useTranslations("hud.owlis");
  const tr = (m: Msg | undefined) => text(t, m);
  const tone = aiTone(hud.d);
  const pill = "rounded-full px-3.5 py-1.5 font-mono";

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 px-3 pt-2">
        <div className={`${pill} min-w-0`} style={glassStyle({ from: GRAD.cyan, via: GRAD.aqua, to: GRAD.violet })}>
          <p className="text-[9px] font-bold tracking-[0.2em] text-[#98a3c6]">{t("score")}</p>
          <p className="num truncate text-lg font-black leading-tight text-[#e9edfb]" style={{ textShadow: `0 0 10px ${GRAD.aqua}` }}>
            {Math.floor(hud.score).toLocaleString()}
          </p>
        </div>
        <div
          className={`${pill} text-center`}
          style={glassStyle({ from: tone.a, via: tone.line, to: tone.b, glow: tone.line })}
        >
          <p className="text-[9px] font-bold tracking-[0.2em]" style={{ color: tone.line }}>
            {t("aiLevel")}
          </p>
          <p className="num text-lg font-black leading-tight" style={{ color: "#fff", textShadow: `0 0 12px ${tone.line}` }}>
            {hud.level}
            <span className="ml-1.5 text-[9px] font-bold text-[#6f7aa0]">D {hud.d.toFixed(2)}</span>
          </p>
        </div>
        <div className={`${pill} text-right`} style={glassStyle({ from: GRAD.violet, via: GRAD.magenta, to: GRAD.aqua })}>
          <p className="text-[9px] font-bold tracking-[0.2em] text-[#98a3c6]">{t("time")}</p>
          <p className="num text-lg font-black leading-tight text-[#e9edfb]" style={{ textShadow: `0 0 10px ${GRAD.violet}` }}>
            {clock(hud.t)}
          </p>
        </div>
      </div>

      {hud.banner && (
        <div className="pointer-events-none absolute inset-x-0 top-[30%] z-20 grid place-items-center px-4 text-center">
          <div key={`${hud.banner.m.k}-${JSON.stringify(hud.banner.m.p ?? {})}`} className="animate-pop">
            <p
              className="font-mono text-3xl font-black tracking-wider sm:text-4xl"
              style={{
                // 네온 — 밝은 심지 + 톤 두 색으로 번지는 빛
                color: "#fbfcff",
                textShadow: `0 0 6px ${TONE[hud.banner.tone][0]}, 0 0 18px ${TONE[hud.banner.tone][0]}, 0 0 36px ${TONE[hud.banner.tone][1]}, 0 2px 0 #050814`,
              }}
            >
              {tr(hud.banner.m)}
            </p>
            {hud.banner.sub && (
              <p
                className="mx-auto mt-2 inline-block rounded-full px-3 py-1 font-mono text-xs font-bold text-[#e9edfb]"
                style={glassStyle({ from: TONE[hud.banner.tone][0], via: TONE[hud.banner.tone][1], to: TONE[hud.banner.tone][0] })}
              >
                {tr(hud.banner.sub)}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
