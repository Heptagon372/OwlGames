"use client";

import { useEffect } from "react";
import { playSfx } from "@/lib/sound";

/**
 * 버튼·링크를 누르면 짧은 클릭음 (§13).
 * 버튼마다 onClick 을 다는 대신 문서 전체에서 한 번만 듣는다 —
 * `components/ui/Button.tsx` 는 서버 컴포넌트에서도 쓰이기 때문에 핸들러를 달 수 없다.
 * 소리를 끄면 `lib/sound.ts` 가 알아서 아무것도 하지 않는다.
 */
export function SoundBoot() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.("button, a[href], [role='button']");
      if (!el || el.hasAttribute("data-no-sfx")) return;
      playSfx("tap");
    };
    // capture 단계 — 중간에서 이벤트를 막는 컴포넌트가 있어도 소리는 난다
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
