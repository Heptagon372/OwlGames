"use client";

// 🧩 아울리스 — DOM HUD: 가운데 배너만 (§41 AI EVOLVED · COUNTER · FEVER …)
// 점수 · TIME · AI LEVEL · 연쇄 수는 뿌요뿌요처럼 캔버스의 필드 옆·아래에 그린다 (render.ts).
// "n COMBO!" 배너는 필드 위 연쇄 팝업과 겹치므로 띄우지 않는다.

import { useTranslations } from "next-intl";
import { text, type Msg } from "@/games/core/i18n";
import { GRAD, OWLIS, glassStyle } from "../theme";
import type { Banner } from "../types";

export type HudState = {
  banner: Banner | null;
};

/** 배너 톤 → 그라데이션 글자 두 색 */
const TONE: Record<Banner["tone"], [string, string]> = {
  cyan: [GRAD.cyan, GRAD.violet],
  violet: [GRAD.violet, GRAD.magenta],
  red: [GRAD.magenta, OWLIS.danger],
  gold: [OWLIS.gold, GRAD.aqua],
};

/** 캔버스 연쇄 팝업이 대신 보여 주는 배너 */
const ON_FIELD = new Set(["combo"]);

export function Hud({ hud }: { hud: HudState }) {
  const t = useTranslations("hud.owlis");
  const tr = (m: Msg | undefined) => text(t, m);
  const b = hud.banner;
  if (!b || ON_FIELD.has(b.m.k)) return null;
  const [c0, c1] = TONE[b.tone];

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[26%] z-20 grid place-items-center px-4 text-center">
      <div key={`${b.m.k}-${JSON.stringify(b.m.p ?? {})}`} className="animate-pop">
        <p
          className="font-mono text-3xl font-black tracking-wider sm:text-4xl"
          style={{
            // 네온 — 밝은 심지 + 톤 두 색으로 번지는 빛
            color: "#fbfcff",
            textShadow: `0 0 6px ${c0}, 0 0 18px ${c0}, 0 0 36px ${c1}, 0 2px 0 #050814`,
          }}
        >
          {tr(b.m)}
        </p>
        {b.sub && (
          <p
            className="mx-auto mt-2 inline-block rounded-full px-3 py-1 font-mono text-xs font-bold text-[#e9edfb]"
            style={glassStyle({ from: c0, via: c1, to: c0 })}
          >
            {tr(b.sub)}
          </p>
        )}
      </div>
    </div>
  );
}
