import { cn } from "@/lib/cn";

export function Card({
  className,
  solid,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { solid?: boolean }) {
  return <div className={cn(solid ? "card-solid" : "card", "p-5", className)} {...props} />;
}

/** 터미널 프롬프트풍 섹션 라벨: `> ranking --top 10` */
export function TermLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("font-mono text-xs tracking-wide text-aqua/80", className)}>
      <span className="text-neon">&gt;</span> {children}
    </p>
  );
}

export function SectionTitle({
  label,
  title,
  action,
  className,
}: {
  label?: string;
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-end justify-between gap-3", className)}>
      <div>
        {label && <TermLabel>{label}</TermLabel>}
        <h2 className="mt-1 text-lg font-extrabold tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Chip({
  tone = "mute",
  className,
  children,
}: {
  tone?: "mute" | "neon" | "aqua" | "ok" | "alert";
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    mute: "border-line-strong text-mute",
    neon: "border-neon/40 bg-neon/10 text-neon",
    aqua: "border-aqua/40 bg-aqua/10 text-aqua",
    ok: "border-ok/40 bg-ok/10 text-ok",
    alert: "border-alert/40 bg-alert/10 text-alert",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
