"use client";

// 🧩 아울리스 — PC 키 안내 (게임 화면 아래 한 줄). 키 이름은 설정의 키 설정(`lib/keybinds.ts`)에서 온다.
// 마우스가 있는 기기에서만 보인다 (`pc:` 변형).

import { useTranslations } from "next-intl";
import { actionsOf, primaryLabel, useKeymapState } from "@/lib/keybinds";
import { GRAD, glassStyle } from "../theme";

export const KEY_HINTS_H = 34;

export function KeyHints() {
  const t = useTranslations("hud.owlis.controls");
  const map = useKeymapState("owlis");

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 hidden items-center justify-center gap-x-3 gap-y-1 px-3 pb-2 text-[11px] text-[#98a3c6] pc:flex"
      style={{ height: KEY_HINTS_H }}
    >
      {actionsOf("owlis").map((a) => {
        const k = primaryLabel(map, a);
        if (!k) return null;
        return (
          <span key={a} className="inline-flex items-center gap-1 whitespace-nowrap">
            <kbd
              className="num rounded-md px-1.5 py-0.5 text-[11px] font-bold text-[#e9edfb]"
              style={glassStyle({ from: GRAD.aqua, via: GRAD.violet, to: GRAD.aqua })}
            >
              {k}
            </kbd>
            {t(a)}
          </span>
        );
      })}
    </div>
  );
}
