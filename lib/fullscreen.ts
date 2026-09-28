"use client";

// 게임 화면 전체화면 — 폰 브라우저(크롬·엣지·삼성 인터넷)의 주소창·하단 버튼을 치운다 (DECISIONS §5-40)
// 아이폰 사파리는 요소 전체화면을 지원하지 않는다 → 홈 화면에 추가(manifest display: fullscreen)로 대신한다.
import { useEffect, useState } from "react";

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
type LockableOrientation = ScreenOrientation & { lock?: (o: "landscape" | "portrait" | "any") => Promise<void> };

export function canFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.documentElement as FsEl;
  return Boolean(el.requestFullscreen || el.webkitRequestFullscreen);
}

export function isFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  const d = document as FsDoc;
  return Boolean(d.fullscreenElement || d.webkitFullscreenElement);
}

/** 터치 기기(폰·태블릿)인가 — PC 는 자동 전체화면을 하지 않는다 */
export function isTouchDevice(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

/** 사용자 탭 안에서 불러야 한다. 실패해도 조용히 넘어간다. landscape 면 가로로 잠가 본다(안드로이드) */
export async function enterFullscreen(orientation?: "landscape"): Promise<void> {
  if (!canFullscreen() || isFullscreen()) return lockOrientation(orientation);
  const el = document.documentElement as FsEl;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    else await el.webkitRequestFullscreen?.();
  } catch {
    return;
  }
  await lockOrientation(orientation);
}

async function lockOrientation(orientation?: "landscape"): Promise<void> {
  if (!orientation || typeof screen === "undefined") return;
  try {
    await (screen.orientation as LockableOrientation | undefined)?.lock?.(orientation);
  } catch {
    // 지원하지 않는 브라우저 — 게임의 "가로로 돌려주세요" 안내가 대신한다
  }
}

export async function exitFullscreen(): Promise<void> {
  if (!isFullscreen()) return;
  const d = document as FsDoc;
  try {
    screen.orientation?.unlock?.();
  } catch {
    // 무시
  }
  try {
    if (d.exitFullscreen) await d.exitFullscreen();
    else await d.webkitExitFullscreen?.();
  } catch {
    // 무시
  }
}

/** 전체화면 여부 + 지원 여부 (버튼 표시용) */
export function useFullscreen(): { supported: boolean; active: boolean } {
  const [state, setState] = useState({ supported: false, active: false });
  useEffect(() => {
    const sync = () => setState({ supported: canFullscreen(), active: isFullscreen() });
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);
  return state;
}
