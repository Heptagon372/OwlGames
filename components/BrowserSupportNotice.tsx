"use client";

import { useEffect, useState } from "react";

// Tailwind v4가 쓰는 최신 CSS(color-mix 등)를 모르는 브라우저에서는 화면이 깨져 보일 수 있다.
// 조용히 깨지는 대신 한 줄로 알려주고, 게임 자체는 그대로 쓸 수 있게 둔다.
const KEY = "owlgames.browser-notice";

function isSupported(): boolean {
  if (typeof window === "undefined" || typeof CSS === "undefined" || !CSS.supports) return true;
  return (
    CSS.supports("color: color-mix(in srgb, red 50%, blue)") &&
    CSS.supports("height: 100dvh") &&
    typeof window.requestAnimationFrame === "function"
  );
}

export function BrowserSupportNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(KEY) === "1";
    } catch {
      // 사생활 보호 모드 등 — 저장이 막혀도 안내는 띄운다
    }
    if (!dismissed && !isSupported()) setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] border-t border-neon/40 bg-night/95 px-4 py-3 text-center text-xs text-neon-soft">
      브라우저가 오래돼서 화면이 조금 깨져 보일 수 있어요. 크롬·사파리 최신 버전을 권장합니다.
      <button
        type="button"
        className="ml-3 min-h-9 rounded-lg border border-line px-3 text-mute"
        onClick={() => {
          setShow(false);
          try {
            window.localStorage.setItem(KEY, "1");
          } catch {
            // 저장 실패는 무시 — 다음 방문에 다시 보일 뿐
          }
        }}
      >
        닫기
      </button>
    </div>
  );
}
