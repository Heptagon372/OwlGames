"use client";

import { useEffect } from "react";
import { OwlMark } from "@/components/brand/OwlMark";
import { Button, ButtonLink } from "@/components/ui/Button";

/** 페이지에서 예외가 나도 흰 화면 대신 안내를 보여준다 (브라우저 종류와 무관하게) */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[owlgames]", error);
  }, [error]);

  return (
    <div className="grid min-h-dvh-safe place-items-center px-6 text-center">
      <div className="w-full max-w-sm">
        <OwlMark sleepy className="mx-auto size-24" />
        <h1 className="mt-6 text-xl font-black">문제가 생겼어요</h1>
        <p className="mt-2 text-sm leading-relaxed text-mute">
          잠시 후 다시 시도해주세요. 계속 같은 화면이 뜨면 S.OWL 부스로 알려주세요.
        </p>
        {error.digest && <p className="num mt-3 text-[11px] text-dim">오류 코드 {error.digest}</p>}
        <div className="mt-6 grid gap-2">
          <Button block onClick={reset}>
            다시 시도
          </Button>
          <ButtonLink href="/" variant="outline" block>
            처음으로
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
