"use client";

// 진리표 — "이 입력이면 이 출력이 나와야 한다"는 요구사항표 (기획서 §5).
// 줄을 누르면 그 조합이 회로에 그대로 들어가서, 왜 틀렸는지 눈으로 따라갈 수 있다.
import { rowIndex } from "../engine/circuit";
import type { Puzzle, RowResult } from "../types";
import { cn } from "@/lib/cn";

type Props = {
  puzzle: Puzzle;
  rows: RowResult[];
  bits: number[];
  onPickRow: (bits: number[]) => void;
};

export function TruthTable({ puzzle, rows, bits, onPickRow }: Props) {
  const n = puzzle.inputs.length;
  const active = rowIndex(n, bits);
  // 16줄(입력 4개)까지 나올 수 있어서 8줄이 넘으면 두 칸으로 접는다
  const cols = rows.length > 8 ? 2 : 1;
  const per = Math.ceil(rows.length / cols);
  const groups = Array.from({ length: cols }, (_, c) => rows.slice(c * per, (c + 1) * per));

  return (
    <div className="flex gap-2">
      {groups.map((group, gi) => (
        <table key={gi} className="num w-full table-fixed text-[11px]">
          <thead>
            <tr className="text-dim">
              {puzzle.inputs.map((name) => (
                <th key={name} className="pb-1 font-bold">
                  {name}
                </th>
              ))}
              <th className="pb-1 font-bold text-neon">OUT</th>
              <th className="w-5 pb-1" aria-label="상태" />
            </tr>
          </thead>
          <tbody>
            {group.map((r, ri) => {
              const row = gi * per + ri;
              const rowBits = Array.from({ length: n }, (_, j) => (row >> (n - 1 - j)) & 1);
              const isActive = row === active;
              const wrong = r.actual !== null && !r.ok;
              return (
                <tr
                  key={row}
                  onClick={() => onPickRow(rowBits)}
                  className={cn(
                    "cursor-pointer transition-colors",
                    isActive && "bg-aqua/15",
                    wrong && !isActive && "bg-alert/10",
                  )}
                >
                  {rowBits.map((b, j) => (
                    <td key={j} className={cn("py-0.5 text-center", b ? "text-ink" : "text-dim")}>
                      {b}
                    </td>
                  ))}
                  <td className={cn("py-0.5 text-center font-bold", r.expected ? "text-neon" : "text-mute")}>
                    {r.expected}
                  </td>
                  <td className="py-0.5 text-center">
                    {r.actual === null ? (
                      <span className="text-dim">·</span>
                    ) : r.ok ? (
                      <span className="text-ok">✓</span>
                    ) : (
                      <span className="text-alert">✗</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
    </div>
  );
}
