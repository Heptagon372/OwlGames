import { cn } from "@/lib/cn";

type Props = {
  className?: string;
  /** 눈 깜빡임 */
  blink?: boolean;
  /** 눈 감음 (대기 화면) */
  sleepy?: boolean;
  title?: string;
};

/** S.OWL 부엉이 마크 — 이미지 에셋 없이 SVG 도형으로만 그린다 */
export function OwlMark({ className, blink = true, sleepy = false, title = "S.OWL 부엉이" }: Props) {
  return (
    <svg viewBox="0 0 120 120" className={cn("block", className)} role="img" aria-label={title}>
      <defs>
        <linearGradient id="owl-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a3665" />
          <stop offset="1" stopColor="#141b33" />
        </linearGradient>
        <radialGradient id="owl-iris" cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#ffe6a6" />
          <stop offset="0.55" stopColor="#ffb020" />
          <stop offset="1" stopColor="#c47a00" />
        </radialGradient>
      </defs>
      {/* 귀깃 */}
      <path d="M22 30 L34 6 L46 28 Z" fill="#232e55" stroke="#3dd9eb" strokeOpacity=".35" strokeWidth="1.5" />
      <path d="M98 30 L86 6 L74 28 Z" fill="#232e55" stroke="#3dd9eb" strokeOpacity=".35" strokeWidth="1.5" />
      {/* 몸통 */}
      <path
        d="M60 18 C92 18 106 40 106 66 C106 96 86 114 60 114 C34 114 14 96 14 66 C14 40 28 18 60 18 Z"
        fill="url(#owl-body)"
        stroke="#3dd9eb"
        strokeOpacity=".35"
        strokeWidth="1.5"
      />
      {/* 가슴 무늬 (터미널 프롬프트) */}
      <path d="M46 88 l8 6 -8 6" fill="none" stroke="#3dd9eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity=".75" />
      <rect x="58" y="97" width="16" height="3.5" rx="1.5" fill="#3dd9eb" opacity=".75" />
      {/* 눈 */}
      <g>
        <circle cx="41" cy="54" r="19" fill="#0b1020" stroke="#ffb020" strokeOpacity=".5" strokeWidth="2" />
        <circle cx="79" cy="54" r="19" fill="#0b1020" stroke="#ffb020" strokeOpacity=".5" strokeWidth="2" />
        {sleepy ? (
          <g stroke="#ffb020" strokeWidth="3.5" strokeLinecap="round" fill="none">
            <path d="M30 56 q11 8 22 0" />
            <path d="M68 56 q11 8 22 0" />
          </g>
        ) : (
          <g
            className={blink ? "animate-blink" : undefined}
            style={{ transformOrigin: "60px 54px", transformBox: "view-box" }}
          >
            <circle cx="41" cy="54" r="12" fill="url(#owl-iris)" />
            <circle cx="79" cy="54" r="12" fill="url(#owl-iris)" />
            <circle cx="41" cy="54" r="5.5" fill="#0b1020" />
            <circle cx="79" cy="54" r="5.5" fill="#0b1020" />
            <circle cx="37.5" cy="50" r="2.4" fill="#fff" />
            <circle cx="75.5" cy="50" r="2.4" fill="#fff" />
          </g>
        )}
      </g>
      {/* 부리 */}
      <path d="M60 66 L66 74 L60 82 L54 74 Z" fill="#ffb020" />
    </svg>
  );
}
