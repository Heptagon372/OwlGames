"use client";

// 회로 보드 — SVG (기획서 §10: 선·노드·신호 흐름은 SVG가 캔버스보다 압도적으로 쉽다)
// 신호가 1인 배선은 앰버로 발광 + 점이 흐르고, 색뿐 아니라 실선/점선 + 0·1 라벨로도 구분한다 (§12 접근성).
import { ARITY, GATE_LABEL } from "../engine/gates";
import { evalColumns, rowIndex } from "../engine/circuit";
import type { Gate, Placement, Puzzle } from "../types";
import { cn } from "@/lib/cn";

const COL_W = 168;
/** 입력 핀 ↔ 첫 슬롯 열 사이 간격 — 좁으면 배선이 핀에 가려 안 보인다 */
const LEAD_W = 112;
const SLOT_W = 104;
const SLOT_H = 58;
const PIN_X = 46;

type Props = {
  puzzle: Puzzle;
  placement: Placement;
  /** 현재 입력 스위치 상태 (길이 = inputs.length) */
  bits: number[];
  /** 지금 고른 부품을 꽂을 수 있는 칸 (아쿠아로 강조) */
  placeable: boolean[];
  onSlotTap: (slot: number) => void;
  onInputToggle: (index: number) => void;
};

export function CircuitBoard({ puzzle, placement, bits, placeable, onSlotTap, onInputToggle }: Props) {
  const n = puzzle.inputs.length;
  const row = rowIndex(n, bits);
  const columns = evalColumns(puzzle, placement);

  // 슬롯 깊이 = 배선을 따라간 단계 수 → 열 위치
  const depth = puzzle.slots.map(() => 0);
  puzzle.slots.forEach((slot, i) => {
    let d = 0;
    for (const src of slot.inputs) if (src.kind === "slot") d = Math.max(d, depth[src.index] + 1);
    depth[i] = d;
  });
  const colCount = Math.max(...depth) + 1;

  const perCol: number[][] = Array.from({ length: colCount }, () => []);
  depth.forEach((d, i) => perCol[d].push(i));

  const height = Math.max(210, Math.max(n, ...perCol.map((c) => c.length)) * 78 + 40);
  const outX = PIN_X + LEAD_W + colCount * COL_W;
  const width = outX + 70;

  const slotPos = (i: number) => {
    const col = depth[i];
    const list = perCol[col];
    const k = list.indexOf(i);
    const x = PIN_X + LEAD_W + col * COL_W;
    const y = ((k + 1) * height) / (list.length + 1);
    return { x, y };
  };
  const inputPos = (i: number) => ({ x: PIN_X, y: ((i + 1) * height) / (n + 1) });

  const slotValue = (i: number): number | null => {
    const col = columns[i];
    return col === null ? null : (col >> row) & 1;
  };

  const sourceValue = (src: { kind: "input" | "slot"; index: number }): number | null =>
    src.kind === "input" ? bits[src.index] : slotValue(src.index);

  const outValue = slotValue(puzzle.outputSlot);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="회로도">
      <defs>
        <linearGradient id="slotFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b2447" />
          <stop offset="1" stopColor="#141b33" />
        </linearGradient>
      </defs>

      {/* 배선 */}
      {puzzle.slots.map((slot, i) =>
        slot.inputs.map((src, k) => {
          const from = src.kind === "input" ? inputPos(src.index) : slotPos(src.index);
          const to = slotPos(i);
          const fromX = src.kind === "input" ? from.x + 16 : from.x + SLOT_W / 2;
          const portCount = slot.inputs.length;
          const toY = to.y - SLOT_H / 2 + ((k + 1) * SLOT_H) / (portCount + 1);
          const toX = to.x - SLOT_W / 2;
          const v = sourceValue(src);
          // 꽂힌 게이트가 안 쓰는 배선 (예: 2선 칸의 NOT은 첫 배선만 쓴다) — 끊긴 선으로 그린다
          const gate = placement[i];
          const used = gate ? k < ARITY[gate] : true;
          const on = used && v === 1;
          const mid = (fromX + toX) / 2;
          return (
            <g key={`${i}-${k}`}>
              <path
                d={`M ${fromX} ${from.y} C ${mid} ${from.y}, ${mid} ${toY}, ${toX} ${toY}`}
                fill="none"
                stroke={
                  !used ? "rgba(140,160,210,0.15)" : on ? "#FFB020" : v === 0 ? "rgba(140,160,210,0.45)" : "rgba(140,160,210,0.2)"
                }
                strokeWidth={on ? 3 : 2}
                strokeDasharray={!used ? "3 7" : v === null ? "6 6" : "none"}
                style={on ? { filter: "drop-shadow(0 0 5px rgba(255,176,32,0.8))" } : undefined}
              />
              {/* MUX의 첫 배선은 선택선 */}
              {used && gate === "MUX" && k === 0 && (
                <text x={toX - 12} y={toY + 4} textAnchor="end" fontSize="9" fontWeight="700" fill="#3DD9EB">
                  SEL
                </text>
              )}
              {on && (
                <circle r="3.5" fill="#FFE08A">
                  <animateMotion
                    dur="1.1s"
                    repeatCount="indefinite"
                    path={`M ${fromX} ${from.y} C ${mid} ${from.y}, ${mid} ${toY}, ${toX} ${toY}`}
                  />
                </circle>
              )}
            </g>
          );
        }),
      )}

      {/* 출력 배선 */}
      {(() => {
        const from = slotPos(puzzle.outputSlot);
        const on = outValue === 1;
        return (
          <path
            d={`M ${from.x + SLOT_W / 2} ${from.y} L ${outX - 26} ${height / 2}`}
            fill="none"
            stroke={on ? "#FFB020" : outValue === 0 ? "rgba(140,160,210,0.45)" : "rgba(140,160,210,0.2)"}
            strokeWidth={on ? 3 : 2}
            strokeDasharray={outValue === null ? "6 6" : "none"}
          />
        );
      })()}

      {/* 입력 핀 (탭하면 0/1 토글 — 회로가 살아있는 걸 직접 본다) */}
      {puzzle.inputs.map((name, i) => {
        const { x, y } = inputPos(i);
        const on = bits[i] === 1;
        return (
          <g
            key={name}
            className="cursor-pointer"
            onClick={() => onInputToggle(i)}
            role="button"
            aria-label={`입력 ${name} ${on ? 1 : 0}`}
          >
            <circle cx={x} cy={y} r="17" fill={on ? "#FFB020" : "#141b33"} stroke={on ? "#FFE08A" : "#4a5a86"} strokeWidth="2" />
            <text x={x} y={y + 5} textAnchor="middle" fontSize="15" fontWeight="800" fill={on ? "#0b1020" : "#8d97ba"}>
              {name}
            </text>
            <text x={x} y={y + 32} textAnchor="middle" fontSize="11" fontWeight="700" fill={on ? "#FFB020" : "#5b6588"}>
              {bits[i]}
            </text>
          </g>
        );
      })}

      {/* 슬롯 */}
      {puzzle.slots.map((slot, i) => {
        const { x, y } = slotPos(i);
        const gate = placement[i];
        const v = slotValue(i);
        const open = placeable[i] === true;
        return (
          <g key={i} className="cursor-pointer" onClick={() => onSlotTap(i)} role="button" aria-label={`슬롯 ${i + 1}`}>
            <rect
              x={x - SLOT_W / 2}
              y={y - SLOT_H / 2}
              width={SLOT_W}
              height={SLOT_H}
              rx="12"
              fill="url(#slotFill)"
              stroke={open ? "#3DD9EB" : gate ? "#FFB020" : "rgba(140,160,210,0.4)"}
              strokeWidth={open ? 3 : 2}
              strokeDasharray={gate ? "none" : "7 5"}
            />
            <text
              x={x}
              y={y + 6}
              textAnchor="middle"
              fontSize={gate ? 17 : 22}
              fontWeight="800"
              fill={gate ? "#FFD27A" : "#5b6588"}
            >
              {gate ? GATE_LABEL[gate as Gate] : "?"}
            </text>
            {v !== null && (
              <text x={x + SLOT_W / 2 - 12} y={y - SLOT_H / 2 + 16} textAnchor="middle" fontSize="11" fontWeight="700" fill={v ? "#FFB020" : "#5b6588"}>
                {v}
              </text>
            )}
          </g>
        );
      })}

      {/* 출력 램프 */}
      <g>
        <circle
          cx={outX}
          cy={height / 2}
          r="22"
          fill={outValue === 1 ? "#FFB020" : "#141b33"}
          stroke={outValue === 1 ? "#FFE08A" : "#4a5a86"}
          strokeWidth="2.5"
          style={outValue === 1 ? { filter: "drop-shadow(0 0 14px rgba(255,176,32,0.8))" } : undefined}
        />
        <text
          x={outX}
          y={height / 2 + 6}
          textAnchor="middle"
          fontSize="16"
          fontWeight="900"
          fill={outValue === 1 ? "#0b1020" : "#8d97ba"}
        >
          {outValue === null ? "?" : outValue}
        </text>
        <text x={outX} y={height / 2 + 44} textAnchor="middle" fontSize="11" fill="#8d97ba">
          🔒 OUT
        </text>
      </g>
    </svg>
  );
}

export function SlotHint({ className }: { className?: string }) {
  return (
    <p className={cn("text-center text-xs text-dim", className)}>
      부품을 고른 뒤 빈 칸을 누르면 꽂혀요 · 꽂힌 칸을 그냥 누르면 빠져요 · 입력(A·B·C)을 눌러 직접 확인해 보세요
    </p>
  );
}
