import { cn } from "@/lib/cn";

export function Card({
  className,
  solid,
  glow,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  solid?: boolean;
  /** 시안→바이올렛 헤어라인 + 바깥 글로우 (강조 카드) */
  glow?: boolean;
}) {
  return (
    <div
      className={cn(solid ? "card-solid" : "card", glow && "grad-line glow-iris", "p-5", className)}
      {...props}
    />
  );
}

/** 터미널 프롬프트풍 섹션 라벨: `> ranking --top 10` */
export function TermLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("font-mono text-xs tracking-wide text-aqua/70", className)}>
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
  tone?: "mute" | "neon" | "aqua" | "ok" | "alert" | "amber";
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    mute: "border-line-strong bg-white/5 text-mute",
    neon: "border-neon/40 bg-neon/12 text-neon-soft shadow-[0_0_16px_-6px_rgb(167_139_250/0.8)]",
    aqua: "border-aqua/40 bg-aqua/12 text-aqua shadow-[0_0_16px_-6px_rgb(34_211_238/0.8)]",
    ok: "border-ok/40 bg-ok/12 text-ok",
    alert: "border-alert/40 bg-alert/12 text-alert",
    amber: "border-amber/40 bg-amber/12 text-amber-soft",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap backdrop-blur-sm",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** 숫자 하나를 크게 보여주는 유리 타일 (레퍼런스의 Balance / Available credit) */
export function StatTile({
  label,
  value,
  sub,
  tone,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "neon" | "aqua" | "amber";
  className?: string;
}) {
  const color = tone === "aqua" ? "text-aqua" : tone === "amber" ? "text-amber-soft" : tone === "neon" ? "text-neon-soft" : "text-ink";
  return (
    <div className={cn("card px-4 py-3", className)}>
      <p className="text-[11px] font-semibold text-mute">{label}</p>
      <p className={cn("num mt-0.5 text-xl font-black tracking-tight", color)}>{value}</p>
      {sub && <p className="num mt-0.5 text-[11px] text-dim">{sub}</p>}
    </div>
  );
}
