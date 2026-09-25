import { cn } from "@/lib/cn";

export function Field({
  label,
  hint,
  className,
  mono,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; mono?: boolean }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-sm font-bold text-mute">{label}</span>
      <input
        {...props}
        className={cn(
          "min-h-12 w-full rounded-2xl border border-line bg-white/5 px-4 text-[15px] text-ink outline-none backdrop-blur-sm transition-colors",
          "placeholder:text-dim focus:border-aqua/60 focus:bg-white/8",
          mono && "num tracking-wider",
        )}
      />
      {hint && <span className="mt-1.5 block text-xs text-dim">{hint}</span>}
    </label>
  );
}

/** 터미널 창 느낌의 카드 (로그인·가입) */
export function TerminalCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("card grad-line overflow-hidden p-0", className)}>
      <div className="flex items-center gap-2 border-b border-line bg-white/5 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-alert/70" />
        <span className="size-2.5 rounded-full bg-amber/70" />
        <span className="size-2.5 rounded-full bg-ok/70" />
        <span className="ml-2 font-mono text-xs text-mute">{title}</span>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="animate-shake rounded-tile border border-alert/40 bg-alert/10 px-4 py-3 text-sm text-alert">
      {message}
    </p>
  );
}
