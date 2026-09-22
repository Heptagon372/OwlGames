"use client";

import { QRCodeSVG } from "qrcode.react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, TermLabel } from "@/components/ui/Card";
import { formatCountdown } from "@/lib/format";
import { expireStale, issueRedeemCode } from "@/lib/rpc";
import type { IssuedCode, RedeemCodeRow } from "@/lib/types";

type Props = { unused: number; initialCode: RedeemCodeRow | null; ttlMin: number };

/** 코드 발급 + QR (§8.1). 만료되면 티켓은 서버에서 자동으로 미사용 상태로 돌아온다 */
export function TicketIssuer({ unused, initialCode, ttlMin }: Props) {
  const router = useRouter();
  const [count, setCount] = useState(Math.max(1, Math.min(unused, 1)));
  const [code, setCode] = useState<IssuedCode | null>(
    initialCode ? { code: initialCode.code, ticket_count: initialCode.ticket_count, expires_at: initialCode.expires_at } : null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // 만료 정리는 지연 처리라, 티켓 화면에 들어오면 한 번 돌리고 최신 상태를 다시 읽는다
  useEffect(() => {
    let alive = true;
    expireStale().then(() => alive && router.refresh());
    return () => {
      alive = false;
    };
  }, [router]);

  const remainSec = useMemo(() => (code ? (new Date(code.expires_at).getTime() - now) / 1000 : 0), [code, now]);
  const expired = Boolean(code) && remainSec <= 0;

  useEffect(() => {
    if (expired) router.refresh();
  }, [expired, router]);

  async function issue() {
    setPending(true);
    setError(null);
    try {
      setCode(await issueRedeemCode(count));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "코드 발급에 실패했어요");
    } finally {
      setPending(false);
    }
  }

  if (unused === 0 && !code) {
    return (
      <Card className="mt-4 text-center text-sm text-mute">
        아직 사용할 티켓이 없어요. 게임을 플레이해서 <span className="font-bold text-ink">랭크를 올리면</span> 티켓을 받아요.
      </Card>
    );
  }

  if (code && !expired) {
    return (
      <Card className="mt-4 text-center">
        <TermLabel className="text-left">redeem --code</TermLabel>
        <p className="mt-3 text-sm text-mute">🦉 S.OWL 부스로 와서 이 코드를 보여주세요</p>
        <p className="num mt-3 text-[40px] font-black tracking-[0.25em] text-neon text-glow">{code.code}</p>
        <div className="mx-auto mt-4 w-fit rounded-2xl bg-white p-3">
          <QRCodeSVG value={code.code} size={148} level="M" marginSize={0} />
        </div>
        <p className="mt-4 text-sm">
          뽑기 <span className="num font-bold text-ink">{code.ticket_count}회</span> ·{" "}
          <span className="num font-bold text-aqua">{formatCountdown(remainSec)}</span> 후 만료
        </p>
        <p className="mt-1 text-xs text-dim">만료되면 티켓은 자동으로 돌아오니 다시 발급받으면 돼요.</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={issue} disabled={pending}>
          <RefreshCw className="size-4" />
          다시 발급 (이전 코드 무효)
        </Button>
        {error && <p className="mt-2 text-sm text-alert">{error}</p>}
      </Card>
    );
  }

  return (
    <Card className="mt-4">
      <TermLabel>redeem --issue</TermLabel>
      <p className="mb-4 mt-2 text-sm text-mute">부스에서 사용할 코드를 발급해요. 몇 회 뽑을까요?</p>
      <div className="flex items-center justify-center gap-5">
        <Button
          variant="outline"
          size="sm"
          className="size-12 rounded-full p-0"
          aria-label="줄이기"
          onClick={() => setCount((c) => Math.max(1, c - 1))}
          disabled={count <= 1}
        >
          <Minus className="size-5" />
        </Button>
        <span className="num w-20 text-center text-4xl font-black text-neon">{count}</span>
        <Button
          variant="outline"
          size="sm"
          className="size-12 rounded-full p-0"
          aria-label="늘리기"
          onClick={() => setCount((c) => Math.min(unused, c + 1))}
          disabled={count >= unused}
        >
          <Plus className="size-5" />
        </Button>
      </div>
      <p className="mt-2 text-center text-xs text-dim">보유 {unused}장 중 선택</p>
      {error && <p className="mt-3 text-center text-sm text-alert">{error}</p>}
      <Button className="mt-5" size="lg" block onClick={issue} disabled={pending || unused === 0}>
        {pending ? "발급 중..." : `뽑기 코드 발급 (${ttlMin}분 유효)`}
      </Button>
    </Card>
  );
}
