import Link from "next/link";
import { cn } from "@/lib/cn";
import { OwlMark } from "./OwlMark";

export function Logo({ href = "/", className, size = "md" }: { href?: string; className?: string; size?: "sm" | "md" }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2", className)} aria-label="아울게임즈 홈">
      <OwlMark className={size === "sm" ? "size-7" : "size-9"} />
      <span className="leading-none">
        <span className={cn("block font-mono font-bold tracking-tight", size === "sm" ? "text-sm" : "text-base")}>
          OWL<span className="text-neon">_</span>GAMES
        </span>
        <span className="block font-mono text-[10px] tracking-[0.2em] text-mute">S.OWL · 아울게임즈</span>
      </span>
    </Link>
  );
}
