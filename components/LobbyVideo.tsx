import { cn } from "@/lib/cn";

/**
 * 로비 상단 홍보 영상 (사용자 제공, public/assets/video). 소리 없이 자동 반복 — 장식이라 스크린리더에는 숨긴다.
 * "동작 줄이기"를 켠 기기에서는 영상 대신 포스터 한 장만 보인다.
 */
export function LobbyVideo({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("grad-line relative aspect-[864/496] overflow-hidden rounded-card bg-night glow-iris", className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/video/lobby-poster.jpg" alt="" className="absolute inset-0 size-full object-cover" />
      <video
        className="absolute inset-0 size-full object-cover motion-reduce:hidden"
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
    </div>
  );
}
