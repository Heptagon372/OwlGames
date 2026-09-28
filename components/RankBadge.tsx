import { cn } from "@/lib/cn";
import { rankInfo } from "@/lib/rank";

/** public/assets/ranks/*.webp 한 칸(정사각) 크기 = scripts/slice-rank-badges.py 의 CELL.
 *  뱃지 몸통은 칸의 약 70% — 칸을 ART_SCALE 배로 그려야 몸통이 px 크기가 된다 */
const ART_SCALE = 1.45;

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

/** 30종 랭크 뱃지 (사용자 그림 — DECISIONS §5-47). 챌린저는 파티클, 이름 글자는 발광·무지개 */
export function RankBadge({ rankIdx, size = "md", withLabel, className }: Props) {
  const r = rankInfo(rankIdx);
  const px = SIZES[size];
  const [light] = r.colors;

  const badge = (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center", !withLabel && className)}
      style={{ width: px, height: px * 1.08 }}
      role="img"
      aria-label={`${r.name} 랭크`}
      title={r.name}
    >
      {/* 사용자 제공 뱃지 그림 (scripts/slice-rank-badges.py). 발광 여백이 있어서 칸보다 크게 그린다 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/assets/ranks/rank-${String(r.idx).padStart(2, "0")}.webp`}
        alt=""
        draggable={false}
        className="pointer-events-none absolute max-w-none select-none"
        style={{ width: px * ART_SCALE, height: px * ART_SCALE, left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
      />
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
