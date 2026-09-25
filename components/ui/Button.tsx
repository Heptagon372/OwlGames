import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "aqua" | "ghost" | "danger" | "outline";
type Size = "md" | "lg" | "sm";

const base =
  "relative inline-flex select-none items-center justify-center gap-2 font-bold transition-[transform,box-shadow,background-color,color,opacity,filter] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";

const variants: Record<Variant, string> = {
  // 시안→바이올렛 그라데이션 + 바깥 글로우 (레퍼런스의 Primary Button)
  primary:
    "grad-fill text-night shadow-[0_0_0_1px_rgb(167_139_250/0.5),0_12px_38px_-10px_rgb(124_58_237/0.85)] " +
    "hover:brightness-110 hover:shadow-[0_0_0_1px_rgb(167_139_250/0.7),0_16px_44px_-8px_rgb(124_58_237/0.95)]",
  aqua: "bg-aqua text-night shadow-aqua hover:brightness-110",
  // 유리 + 그라데이션 헤어라인 (Secondary)
  outline:
    "grad-line glass text-ink hover:text-aqua hover:shadow-[0_0_24px_-8px_rgb(34_211_238/0.6),var(--shadow-card)]",
  ghost: "text-mute hover:bg-white/5 hover:text-ink",
  danger: "border border-alert/50 bg-alert/10 text-alert hover:bg-alert/20",
};

// 모든 버튼 최소 터치 영역 44px (§13)
const sizes: Record<Size, string> = {
  sm: "min-h-11 rounded-xl px-3.5 text-sm",
  md: "min-h-12 rounded-2xl px-5 text-[15px]",
  lg: "min-h-14 rounded-2xl px-7 text-lg",
};

type CommonProps = { variant?: Variant; size?: Size; className?: string; block?: boolean };

export function buttonClass({ variant = "primary", size = "md", block, className }: CommonProps = {}) {
  return cn(base, variants[variant], sizes[size], block && "w-full", className);
}

export function Button({
  variant,
  size,
  block,
  className,
  type = "button",
  ...props
}: CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={buttonClass({ variant, size, block, className })} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  block,
  className,
  ...props
}: CommonProps & React.ComponentProps<typeof Link>) {
  return <Link className={buttonClass({ variant, size, block, className })} {...props} />;
}
