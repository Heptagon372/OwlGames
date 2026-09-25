"use client";

// 부품 트레이 — 남은 게이트를 골라 슬롯에 꽂는다 (기획서 §5 탭-투-플레이스).
// 기호만 보여주면 비전공자가 못 읽으므로 한 줄 설명을 항상 같이 띄운다 (§12).
import { ARITY, GATE_DESC, GATE_LABEL, GATE_ORDER } from "../engine/gates";
import type { Gate } from "../types";
import { cn } from "@/lib/cn";

type Props = {
  remaining: Partial<Record<Gate, number>>;
  selected: Gate | null;
  onSelect: (gate: Gate | null) => void;
};

export function PartTray({ remaining, selected, onSelect }: Props) {
  const list = GATE_ORDER.filter((g) => remaining[g] !== undefined);

  return (
    <div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {list.map((gate) => {
          const left = remaining[gate] ?? 0;
          const out = left <= 0;
          const on = selected === gate;
          return (
            <button
              key={gate}
              type="button"
              disabled={out}
              onClick={() => onSelect(on ? null : gate)}
              aria-pressed={on}
              className={cn(
                "relative min-h-16 shrink-0 rounded-tile border px-4 py-2 text-center transition-colors",
                on
                  ? "border-aqua bg-aqua/15"
                  : out
                    ? "border-line bg-night/50 opacity-45"
                    : "border-line bg-panel/80 hover:border-neon/60",
              )}
            >
              <span className={cn("num block text-sm font-black", on ? "text-aqua" : out ? "text-dim" : "text-neon")}>
                {GATE_LABEL[gate]}
              </span>
              <span className="num mt-0.5 block text-[10px] text-mute">
                ×{left} · {ARITY[gate]}입력
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 min-h-8 px-1 text-center text-xs text-mute">
        {selected ? (
          <>
            <span className="num font-bold text-aqua">{GATE_LABEL[selected]}</span> — {GATE_DESC[selected]}
          </>
        ) : (
          "부품을 고르고 회로의 빈 칸을 누르세요"
        )}
      </p>
    </div>
  );
}
