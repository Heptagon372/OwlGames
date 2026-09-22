"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { fetchPendingUsers } from "@/lib/client-queries";
import { verifyUser } from "@/lib/rpc";
import { timeAgo } from "@/lib/format";
import type { PendingUser } from "@/lib/demo";

/** 가입 승인 (§11) — 학생증 대조 후 승인. staff 이상 */
export function PendingList() {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await fetchPendingUsers());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "목록을 불러오지 못했어요");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  async function approve(u: PendingUser) {
    setBusy(u.id);
    try {
      await verifyUser(u.id);
      setUsers((list) => list.filter((x) => x.id !== u.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "승인에 실패했어요");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-mute">
          대기 <span className="num font-bold text-neon">{users.length}</span>명 · 15초마다 자동 새로고침
        </p>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
          새로고침
        </Button>
      </div>
      {error && <p className="mb-3 text-sm text-alert">{error}</p>}
      <Card className="divide-y divide-line p-0">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-bold">{u.name}</p>
              <p className="num text-xs text-mute">
                {u.student_id} · {timeAgo(u.created_at)}
              </p>
            </div>
            <Button size="sm" onClick={() => approve(u)} disabled={busy === u.id}>
              <Check className="size-4" />
              승인
            </Button>
          </div>
        ))}
        {users.length === 0 && !loading && (
          <p className="px-4 py-10 text-center text-sm text-dim">대기중인 가입 신청이 없어요</p>
        )}
      </Card>
      <p className="mt-3 text-xs text-dim">학생증(학번·이름)을 대조한 뒤 승인해주세요.</p>
    </div>
  );
}
