import { cn } from "@/lib/cn";

type Props = {
  className?: string;
  title?: string;
};

/** S.OWL 부엉이 마크 — 사용자 그림 (scripts/slice-brand.py → public/assets/brand/owl*.webp).
 *  라이트 테마에서는 CSS(.brand-night/.brand-day)가 진한 사본으로 바꿔 끼운다. */
export function OwlMark({ className, title = "S.OWL 부엉이" }: Props) {
  const common = cn("pointer-events-none select-none object-contain", className);
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/brand/owl.webp"
        alt={title}
        width={512}
        height={512}
        draggable={false}
        className={cn("brand-night block", common)}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/brand/owl-light.webp"
        alt=""
        aria-hidden
        width={512}
        height={512}
        draggable={false}
        className={cn("brand-day", common)}
      />
    </>
  );
}
