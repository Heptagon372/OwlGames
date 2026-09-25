"use client";

// 서버 컴포넌트 화면을 주기적으로 새로 고쳐 "실시간"처럼 보이게 한다.
// (랭킹·전광판처럼 남이 올린 점수가 바로 반영돼야 하는 화면에서 쓴다)
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function LiveRefresh({ intervalMs = 20_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      if (!document.hidden) router.refresh();
    };
    const t = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, intervalMs]);

  return null;
}
