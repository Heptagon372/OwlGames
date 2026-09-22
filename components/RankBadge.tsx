import { cn } from "@/lib/cn";
import { rankInfo } from "@/lib/rank";

const SIZES = { xs: 22, sm: 32, md: 48, lg: 72, xl: 132 } as const;
type Size = keyof typeof SIZES;

type Props = {
  rankIdx: number;
  size?: Size;
  /** 옆에 랭크 이름 표시 */
  withLabel?: boolean;
  className?: string;
};

// 챌린저 파티클 위치 (결정적 값 — SSR/CSR 동일)
const SPARKS = [
  { left: "12%", delay: "0s", dx: "-6px" },
  { left: "30%", delay: "0.9s", dx: "4px" },
  { left: "50%", delay: "0.3s", dx: "0px" },
  { left: "68%", delay: "1.4s", dx: "-3px" },
  { left: "86%", delay: "0.6s", dx: "6px" },
  { left: "40%", delay: "1.9s", dx: "8px" },
];

/** 17종 랭크 뱃지 (§13) — 육각형 프레임 + 그라데이션, 상위 랭크는 발광·무지개·파티클 */
export function RankBadge({ rankIdx, size = "md", withLabel, className }: Props) {
  const r = rankInfo(rankIdx);
  const px = SIZES[size];
  const [light, dark] = r.colors;

  const frameStyle: React.CSSProperties =
    r.effect === "rainbow" ? {} : { background: `linear-gradient(145deg, ${light} 0%, ${dark} 100%)` };

  const badge = (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center",
        r.effect === "glow" && "animate-pulse-glow",
        r.effect === "challenger" && "animate-pulse-glow",
        !withLabel && className,
      )}
      style={
        {
          width: px,
          height: px * 1.08,
          "--glow": r.effect === "glow" ? "rgb(255 255 255 / 0.8)" : "rgb(255 176 32 / 0.85)",
          filter: r.effect ? undefined : `drop-shadow(0 2px ${Math.max(2, px / 10)}px ${dark}88)`,
        } as React.CSSProperties
      }
      role="img"
      aria-label={`${r.name} 랭크`}
      title={r.name}
    >
      <span
        className={cn("hex absolute inset-0", r.effect === "rainbow" && "rainbow-fill animate-hue")}
        style={frameStyle}
      />
      <span
        className="hex absolute"
        style={{
          inset: Math.max(2, px * 0.09),
          background: `linear-gradient(170deg, color-mix(in srgb, ${dark} 55%, #0b1020) 0%, #0b1020 85%)`,
        }}
      />
      {/* 상단 하이라이트 */}
      <span
        className="hex absolute opacity-60"
        style={{
          inset: Math.max(2, px * 0.09),
          background: "linear-gradient(180deg, rgb(255 255 255 / 0.22), transparent 45%)",
        }}
      />
      {size !== "xs" && (
        <span
          className="relative font-mono font-black leading-none tracking-tight"
          style={{
            fontSize: px * 0.3,
            color: r.effect === "rainbow" ? "#fff" : light,
            textShadow: `0 0 ${px / 8}px ${light}99`,
          }}
        >
          {r.short}
        </span>
      )}
      {r.effect === "challenger" && px >= 48 && (
        <span className="pointer-events-none absolute inset-x-0 bottom-1/4 top-0" aria-hidden>
          {SPARKS.map((s, i) => (
            <span
              key={i}
              className="absolute bottom-0 size-1.5 animate-spark rounded-full bg-neon-soft shadow-[0_0_8px_#ffb020]"
              style={{ left: s.left, animationDelay: s.delay, "--dx": s.dx } as React.CSSProperties}
            />
          ))}
        </span>
      )}
    </span>
  );

  if (!withLabel) return badge;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {badge}
      <span className="font-bold" style={{ color: r.effect === "rainbow" ? undefined : light }}>
        {r.effect === "rainbow" ? (
          <span className="bg-linear-to-r from-[#ff6fd8] via-neon to-aqua bg-clip-text text-transparent">{r.name}</span>
        ) : (
          r.name
        )}
      </span>
    </span>
  );
}
