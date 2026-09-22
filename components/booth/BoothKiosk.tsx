"use client";

import { useState } from "react";
import { QrCode, RotateCcw, ScanLine, UserCheck } from "lucide-react";
import { GachaMachine, type GachaState } from "@/components/GachaMachine";
import { QrScanner } from "./QrScanner";
import { PendingList } from "@/components/staff/PendingList";
import { RankBadge } from "@/components/RankBadge";
import { Button } from "@/components/ui/Button";
import { Card, Chip, TermLabel } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { PLACE_EMOJI } from "@/lib/config";
import { formatCountdown } from "@/lib/format";
import { boothDraw, boothLookupCode, boothMarkClaimed } from "@/lib/rpc";
import { rankInfo } from "@/lib/rank";
import type { BoothDrawResult, BoothLookup } from "@/lib/types";

type Step = "input" | "user" | "drawing" | "result";

/** 부스 키오스크 (§8.2) — 태블릿 가로 기준. 결과는 서버 RPC가 준 값만 표시 */
export function BoothKiosk() {
  const [tab, setTab] = useState<"draw" | "approve">("draw");
  const [step, setStep] = useState<Step>("input");
  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState<BoothLookup | null>(null);
  const [result, setResult] = useState<BoothDrawResult | null>(null);
  const [gacha, setGacha] = useState<GachaState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [scanning, setScanning] = useState(false);

  const reset = () => {
    setStep("input");
    setCode("");
    setLookup(null);
    setResult(null);
    setGacha("idle");
    setError(null);
    setClaimed(false);
  };

  async function lookupCode(value: string) {
    const c = value.trim().toUpperCase();
    if (c.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      const data = await boothLookupCode(c);
      setLookup(data);
      setCode(c);
      setStep("user");
    } catch (e) {
      setError(e instanceof Error ? e.message : "코드를 확인할 수 없어요");
    } finally {
      setBusy(false);
    }
  }

  async function draw() {
    if (!lookup) return;
    setStep("drawing");
    setGacha("spinning");
    setError(null);
    const startedAt = Date.now();
    try {
      const res = await boothDraw(lookup.code, lookup.tier);
      // 연출은 최소 3초 (§8.2)
      const wait = Math.max(0, 3000 - (Date.now() - startedAt));
      setTimeout(() => {
        setResult(res);
        setLookup((l) => (l ? { ...l, remaining: res.remaining } : l));
        setGacha("reveal");
        setTimeout(() => setStep("result"), 1200);
      }, wait);
    } catch (e) {
      setError(e instanceof Error ? e.message : "추첨에 실패했어요");
      setGacha("idle");
      setStep("user");
    }
  }

  async function markClaimed() {
    if (!result) return;
    setBusy(true);
    try {
      await boothMarkClaimed(result.draw_id);
      setClaimed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "수령 처리에 실패했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-5 pb-10">
      <div className="mb-5 flex gap-2">
        {[
          { key: "draw" as const, label: "🎰 뽑기", icon: QrCode },
          { key: "approve" as const, label: "가입 승인", icon: UserCheck },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "min-h-12 rounded-2xl border px-5 text-base font-bold transition-colors",
              tab === t.key ? "border-neon bg-neon/15 text-neon" : "border-line text-mute hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "approve" ? (
        <PendingList />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* 좌: 코드 입력 / 유저 카드 */}
          <div>
            {step === "input" && (
              <Card>
                <TermLabel>booth --lookup</TermLabel>
                <h2 className="mb-4 mt-2 text-2xl font-black">코드 입력</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    lookupCode(code);
                  }}
                >
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
                    placeholder="ABC123"
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="뽑기 코드"
                    className="num min-h-20 w-full rounded-2xl border border-line bg-night text-center text-5xl font-black tracking-[0.35em] text-neon uppercase outline-none focus:border-neon/60"
                  />
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <Button type="button" variant="outline" size="lg" onClick={() => setScanning(true)}>
                      <ScanLine className="size-5" /> QR 스캔
                    </Button>
                    <Button type="submit" size="lg" disabled={busy || code.length < 4}>
                      {busy ? "확인 중..." : "조회"}
                    </Button>
                  </div>
                </form>
                {error && <p className="mt-4 text-center font-bold text-alert">{error}</p>}
                <p className="mt-4 text-center text-xs text-dim">
                  방문자 화면의 6자리 코드를 입력하거나 QR을 스캔하세요.
                </p>
              </Card>
            )}

            {lookup && step !== "input" && (
              <Card>
                <TermLabel>user --verify</TermLabel>
                <div className="mt-3 flex items-center gap-4">
                  <RankBadge rankIdx={lookup.rank_idx} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="text-3xl font-black">{lookup.name}</p>
                    <p className="num text-lg text-mute">{lookup.student_id}</p>
                    <p className="mt-1 font-bold" style={{ color: rankInfo(lookup.rank_idx).colors[0] }}>
                      {rankInfo(lookup.rank_idx).name} · Lv {lookup.level} · 티어 T{lookup.tier}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between rounded-tile border border-line bg-night px-4 py-3">
                  <span className="text-sm text-mute">남은 뽑기</span>
                  <span className="num text-2xl font-black text-neon">{lookup.remaining}회</span>
                </div>
                <p className="mt-3 text-center text-xs text-dim">👀 학생증과 이름·학번을 대조해주세요</p>
                {error && <p className="mt-3 text-center font-bold text-alert">{error}</p>}
              </Card>
            )}
          </div>

          {/* 우: 뽑기 */}
          <div>
            <Card className="flex flex-col items-center">
              <GachaMachine state={gacha} className="w-full max-w-[240px]" />

              {step === "user" && (
                <Button
                  size="lg"
                  block
                  className="mt-5"
                  onClick={draw}
                  disabled={!lookup || lookup.remaining <= 0}
                >
                  🎰 뽑기 {lookup && lookup.remaining > 0 ? `(${lookup.remaining}회 남음)` : ""}
                </Button>
              )}

              {step === "result" && result && (
                <div className="mt-5 w-full animate-pop text-center">
                  {result.place ? (
                    <>
                      <p className="text-6xl">{PLACE_EMOJI[result.place - 1]}</p>
                      <p
                        className={cn(
                          "mt-2 text-4xl font-black",
                          result.place <= 2 ? "text-neon text-glow" : "text-ink",
                        )}
                      >
                        {result.place}등 당첨!
                      </p>
                      <p className="mt-1 text-xl font-bold text-neon-soft">{result.prize_name}</p>
                      {result.place <= 2 && (
                        <p className="mt-2 font-mono text-sm tracking-[0.3em] text-aqua">CONGRATULATIONS</p>
                      )}
                      <Button
                        size="lg"
                        block
                        className="mt-5"
                        variant={claimed ? "outline" : "primary"}
                        onClick={markClaimed}
                        disabled={busy || claimed}
                      >
                        {claimed ? "✅ 수령 완료됨" : "✅ 수령 완료"}
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-6xl">🫥</p>
                      <p className="mt-2 text-3xl font-black text-mute">꽝</p>
                      <p className="mt-1 text-sm text-dim">다음 기회에! 아직 기회가 남아있다면 한 번 더</p>
                    </>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => {
                        setResult(null);
                        setClaimed(false);
                        setGacha("idle");
                        setStep("user");
                      }}
                      disabled={!lookup || lookup.remaining <= 0}
                    >
                      다음 뽑기
                    </Button>
                    <Button variant="ghost" size="lg" onClick={reset}>
                      <RotateCcw className="size-5" /> 처음으로
                    </Button>
                  </div>
                </div>
              )}

              {step === "input" && (
                <p className="mt-4 text-center text-sm text-dim">코드를 조회하면 뽑기를 진행할 수 있어요</p>
              )}
              {lookup && step !== "input" && (
                <p className="num mt-4 text-center text-xs text-dim">
                  코드 {lookup.code} · {formatCountdown((new Date(lookup.expires_at).getTime() - Date.now()) / 1000)} 남음
                </p>
              )}
              {step === "user" && lookup?.remaining === 0 && (
                <Chip tone="alert" className="mt-3">
                  남은 뽑기가 없어요
                </Chip>
              )}
            </Card>
          </div>
        </div>
      )}

      <QrScanner open={scanning} onClose={() => setScanning(false)} onScan={(text) => lookupCode(text)} />
    </div>
  );
}
