"use client";

import { QRCodeSVG } from "qrcode.react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Card, TermLabel } from "@/components/ui/Card";
import { formatCountdown } from "@/lib/format";
import { expireStale, issueRedeemCode } from "@/lib/rpc";
import type { IssuedCode, RedeemCodeRow } from "@/lib/types";

type Props = { unused: number; initialCode: RedeemCodeRow | null; ttlMin: number };

/** 코드 발급 + QR (§8.1). 만료되면 티켓은 서버에서 자동으로 미사용 상태로 돌아온다 */
export function TicketIssuer({ unused, initialCode, ttlMin }: Props) {
  const t = useTranslations("issuer");
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
      setError(e instanceof Error ? e.message : t("failed"));
    } finally {
      setPending(false);
    }
  }

  if (unused === 0 && !code) {
    return (
      <Card className="mt-4 text-center text-sm text-mute">
        {t.rich("noTicket", { b: (c) => <span className="font-bold text-ink">{c}</span> })}
      </Card>
    );
  }

  if (code && !expired) {
    return (
      <Card className="mt-4 text-center">
        <TermLabel className="text-left">redeem --code</TermLabel>
        <p className="mt-3 text-sm text-mute">{t("showCode")}</p>
        <p className="num mt-3 text-[40px] font-black tracking-[0.25em] text-neon text-glow">{code.code}</p>
        <div className="mx-auto mt-4 w-fit rounded-2xl bg-white p-3">
          <QRCodeSVG value={code.code} size={148} level="M" marginSize={0} />
        </div>
        <p className="mt-4 text-sm">
          {t.rich("draws", {
            count: code.ticket_count,
            time: formatCountdown(remainSec),
            n: (c) => <span className="num font-bold text-ink">{c}</span>,
            t: (c) => <span className="num font-bold text-aqua">{c}</span>,
          })}
        </p>
        <p className="mt-1 text-xs text-dim">{t("expiryNote")}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={issue} disabled={pending}>
          <RefreshCw className="size-4" />
          {t("reissue")}
        </Button>
        {error && <p className="mt-2 text-sm text-alert">{error}</p>}
      </Card>
    );
  }

  return (
    <Card className="mt-4">
      <TermLabel>redeem --issue</TermLabel>
      <p className="mb-4 mt-2 text-sm text-mute">{t("prompt")}</p>
      <div className="flex items-center justify-center gap-5">
        <Button
          variant="outline"
          size="sm"
          className="size-12 rounded-full p-0"
          aria-label={t("minus")}
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
          aria-label={t("plus")}
          onClick={() => setCount((c) => Math.min(unused, c + 1))}
          disabled={count >= unused}
        >
          <Plus className="size-5" />
        </Button>
      </div>
      <p className="mt-2 text-center text-xs text-dim">{t("held", { count: unused })}</p>
      {error && <p className="mt-3 text-center text-sm text-alert">{error}</p>}
      <Button className="mt-5" size="lg" block onClick={issue} disabled={pending || unused === 0}>
        {pending ? t("pending") : t("issue", { min: ttlMin })}
      </Button>
    </Card>
  );
}
