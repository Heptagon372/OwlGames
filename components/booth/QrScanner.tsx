"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";

/** QR 스캔 (html5-qrcode 동적 import — 필요할 때만 로드) */
export function QrScanner({ open, onClose, onScan }: { open: boolean; onClose: () => void; onScan: (text: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const scanner = new Html5Qrcode("qr-reader");
        scannerRef.current = scanner as unknown as { stop: () => Promise<void>; clear: () => void };
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (text) => {
            onScan(text.trim());
            onClose();
          },
          () => {},
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "카메라를 열 수 없어요");
      }
    })();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      s?.stop()
        .then(() => s.clear())
        .catch(() => {});
    };
  }, [open, onScan, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="QR 스캔">
      <div id="qr-reader" className="overflow-hidden rounded-2xl border border-line" />
      {error && <p className="mt-3 text-sm text-alert">{error}</p>}
      <p className="mt-3 text-xs text-dim">방문자 화면의 QR을 비춰주세요. 잘 안 되면 코드를 직접 입력해도 돼요.</p>
    </Modal>
  );
}
