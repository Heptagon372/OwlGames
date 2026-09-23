"use client";

import { useState } from "react";
import { Minus, Plus, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, Chip, TermLabel } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { boothGrantEnergy } from "@/lib/rpc";
import type { EnergyGrantResult } from "@/lib/types";

/** 부스 미션 보상으로 아울 에너지를 지급한다 (staff) */
const REASONS = ["부스 미션 성공", "보안 퀴즈 정답", "SNS 홍보 인증", "설문 참여", "이벤트 참여"];

export function EnergyGrantPanel() {
  const [studentId, setStudentId] = useState("");
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState(REASONS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<EnergyGrantResult | null>(null);

  async function grant() {
    setBusy(true);
    setError(null);
    try {
      const res = await boothGrantEnergy(studentId.trim(), amount, reason.trim());
      setDone(res);
      setStudentId("");
      setAmount(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "지급에 실패했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <TermLabel>energy --grant</TermLabel>
        <h2 className="mb-4 mt-2 text-2xl font-black">🦉 아울 에너지 지급</h2>

        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            grant();
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-mute">학번</span>
            <input
              value={studentId}
              onChange={(e) => setStudentId(e.target.value.replace(/\D/g, "").slice(0, 12))}
              inputMode="numeric"
              placeholder="202612345"
              autoFocus
              className="num min-h-14 w-full rounded-2xl border border-line bg-night px-4 text-center text-2xl tracking-[0.2em] outline-none focus:border-aqua/60"
            />
          </label>

          <div>
            <span className="mb-1.5 block text-sm font-bold text-mute">개수</span>
            <div className="flex items-center justify-center gap-5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="size-12 rounded-full p-0"
                aria-label="줄이기"
                onClick={() => setAmount((a) => Math.max(1, a - 1))}
                disabled={amount <= 1}
              >
                <Minus className="size-5" />
              </Button>
              <span className="num w-16 text-center text-4xl font-black text-neon">{amount}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="size-12 rounded-full p-0"
                aria-label="늘리기"
                onClick={() => setAmount((a) => Math.min(5, a + 1))}
                disabled={amount >= 5}
              >
                <Plus className="size-5" />
              </Button>
            </div>
            <p className="mt-1 text-center text-xs text-dim">한 번에 1~5개</p>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-bold text-mute">사유</span>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={cn(
                    "min-h-11 rounded-full border px-3 text-sm font-bold transition-colors",
                    reason === r ? "border-neon bg-neon/15 text-neon" : "border-line text-mute hover:text-ink",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 40))}
              placeholder="직접 입력"
              className="mt-2 min-h-12 w-full rounded-2xl border border-line bg-night px-4 text-sm outline-none focus:border-aqua/60"
            />
          </div>

          {error && <p className="text-center font-bold text-alert">{error}</p>}

          <Button type="submit" size="lg" block disabled={busy || studentId.length < 4 || !reason.trim()}>
            <Zap className="size-5" />
            {busy ? "지급 중..." : "에너지 지급"}
          </Button>
        </form>
      </Card>

      <Card className="flex flex-col items-center justify-center text-center">
        {done ? (
          <div className="animate-pop">
            <p className="text-6xl">🦉</p>
            <p className="mt-3 text-3xl font-black text-neon">+{done.granted}</p>
            <p className="mt-2 text-xl font-bold">{done.name}</p>
            <p className="num text-sm text-mute">{done.student_id}</p>
            <Chip tone="aqua" className="mt-4">
              현재 보유 {done.energy}개
            </Chip>
            <p className="mt-4 text-xs text-dim">방문자 화면에서도 바로 반영돼요</p>
          </div>
        ) : (
          <div className="text-sm text-dim">
            <p className="text-5xl">🦉</p>
            <p className="mt-4">미션을 완료한 방문자의 학번을 입력하고</p>
            <p>아울 에너지를 지급하세요.</p>
            <p className="mt-3 text-xs">에너지는 10분마다 1개씩 자동 충전되고, 게임 한 판에 1개가 듭니다.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
