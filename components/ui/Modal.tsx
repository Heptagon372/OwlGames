"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

type Props = {
  open: boolean;
  onClose?: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** 바깥 클릭·ESC로 닫기 허용 */
  dismissible?: boolean;
};

/** 모바일에서는 아래에서 올라오는 시트, 넓은 화면에서는 가운데 모달 */
export function Modal({ open, onClose, title, children, className, dismissible = true }: Props) {
  const t = useTranslations("modal");
  useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal>
      <button
        type="button"
        aria-label={t("close")}
        className="absolute inset-0 cursor-default bg-black/65 backdrop-blur-sm"
        onClick={dismissible ? onClose : undefined}
      />
      <div
        className={cn(
          "card-solid relative max-h-[92dvh] w-full max-w-md animate-rise overflow-y-auto rounded-b-none p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:rounded-b-[20px]",
          className,
        )}
      >
        {(title || (dismissible && onClose)) && (
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="text-lg font-extrabold">{title}</div>
            {dismissible && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="-m-2 grid size-11 place-items-center rounded-xl text-mute hover:bg-white/5 hover:text-ink"
                aria-label={t("close")}
              >
                <X className="size-5" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
