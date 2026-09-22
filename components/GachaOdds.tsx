import { cn } from "@/lib/cn";
import { PLACE_EMOJI, type GachaTable } from "@/lib/config";
import type { PrizeRow } from "@/lib/types";

/** 티어별 뽑기 확률표 (§6). 내 티어 강조 */
export function GachaOdds({
  table,
  currentTier,
  prizes,
  className,
}: {
  table: GachaTable;
  currentTier?: number;
  prizes: PrizeRow[];
  className?: string;
}) {
  const tiers = Object.keys(table).sort();
  const names = new Map(prizes.map((p) => [p.place, p.name]));
  const soldOut = new Set(prizes.filter((p) => p.stock <= 0).map((p) => p.place));

  return (
    <div className={cn("no-scrollbar overflow-x-auto", className)}>
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-mute">
            <th className="py-2 pr-2 text-left font-bold">티어</th>
            {[1, 2, 3, 4, 5].map((place) => (
              <th key={place} className="px-1 py-2 text-right font-bold">
                <span className="block text-base leading-none">{PLACE_EMOJI[place - 1]}</span>
                <span className={cn("block", soldOut.has(place) && "text-alert line-through")}>
                  {names.get(place) ?? `${place}등`}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tiers.map((t) => {
            const mine = currentTier === Number(t);
            const row = table[t];
            const sum = row.reduce((a, b) => a + b, 0);
            return (
              <tr
                key={t}
                className={cn("border-b border-line/60 last:border-0", mine && "bg-neon/10 font-bold text-neon")}
              >
                <td className="num py-2 pr-2 text-left">
                  T{t}
                  {mine && <span className="ml-1 text-[10px]">내 티어</span>}
                </td>
                {row.map((v, i) => (
                  <td
                    key={i}
                    className={cn("num px-1 py-2 text-right", soldOut.has(i + 1) && "text-alert line-through")}
                  >
                    {v}%
                  </td>
                ))}
                <td className="sr-only">{sum}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-dim">
        표에 없는 확률은 꽝이에요. 재고가 없는 등수는 추첨에서 제외되고 그 확률은 꽝으로 처리돼요.
      </p>
    </div>
  );
}
