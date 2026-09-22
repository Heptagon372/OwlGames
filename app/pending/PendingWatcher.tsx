"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";

/** 승인되면(verified=true) 자동으로 로비로 (§4) — Realtime + 20초 폴링 백업 */
export function PendingWatcher({ userId }: { userId: string | null }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase || !userId) return;

    const channel = supabase
      .channel("pending-verify")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
        (payload) => {
          if ((payload.new as { verified?: boolean }).verified) router.replace("/lobby");
        },
      )
      .subscribe();

    const poll = setInterval(async () => {
      const { data } = await supabase.from("profiles").select("verified").eq("id", userId).maybeSingle();
      if (data?.verified) router.replace("/lobby");
    }, 20_000);

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [userId, router]);

  return null;
}
