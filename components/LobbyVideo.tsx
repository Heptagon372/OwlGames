"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type NetInfo = { saveData?: boolean; effectiveType?: string };

/**
 * 영상을 받아도 되는 회선인지. 데이터 절약 모드·2G 급에서는 포스터 한 장으로 끝낸다.
 * "동작 줄이기"를 켠 기기도 어차피 영상을 숨기므로 받지 않는다 (CSS 로만 숨기면 2MB 를 그냥 버린다).
 */
function wantsVideo(): boolean {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  const net = (navigator as Navigator & { connection?: NetInfo }).connection;
  if (!net) return true;
  if (net.saveData) return false;
  return !(net.effectiveType && /(^|-)2g$/.test(net.effectiveType));
}

/**
 * 로비 상단 홍보 영상 (사용자 제공, public/assets/video). 소리 없이 자동 반복 — 장식이라 스크린리더에는 숨긴다.
 * 영상은 2MB 가 넘으므로 **로비가 그려진 뒤 한가할 때** 붙인다 — 첫 화면이 영상 때문에 늦어지지 않게.
 * 그때까지(그리고 느린 회선·동작 줄이기에서는 계속) 포스터 한 장만 보인다.
 */
export function LobbyVideo({ className }: { className?: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!wantsVideo()) return;
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback;
    if (idle) {
      const id = idle(() => setShow(true), { timeout: 2000 });
      return () => (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
    }
    const t = setTimeout(() => setShow(true), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      aria-hidden
      className={cn("grad-line relative aspect-[864/496] overflow-hidden rounded-card bg-night glow-iris", className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/video/lobby-poster.jpg" alt="" className="absolute inset-0 size-full object-cover" />
      {show && (
        <video
          className="absolute inset-0 size-full object-cover"
          poster="/assets/video/lobby-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          disablePictureInPicture
        >
          <source src="/assets/video/lobby.webm" type="video/webm" />
          <source src="/assets/video/lobby.mp4" type="video/mp4" />
        </video>
      )}
    </div>
  );
}
