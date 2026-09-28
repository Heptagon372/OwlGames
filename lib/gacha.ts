// 뽑기 확률표 표시용 계산 (서버 gacha_pick · admin_set_config 와 같은 규칙).
// 실제 추첨은 서버만 한다 — 여기는 화면에 보여 줄 숫자만 만든다.

import type { GachaTable } from "./config";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** 티어 키를 숫자 순서로 ("10" 이 "2" 앞에 오지 않게) */
export function tierKeys(table: GachaTable): string[] {
  return Object.keys(table).sort((a, b) => Number(a) - Number(b));
}

export type EffectiveRow = {
  /** 등수별 실제 확률 — 재고 0 인 등수는 0 */
  odds: number[];
  /** 표에 적힌 꽝 (100 − 합) */
  missBase: number;
  /** 재고 0 인 등수의 확률까지 더한 실제 꽝 */
  miss: number;
  /** 꽝으로 옮겨 간 몫 */
  moved: number;
};

/** 재고 0 인 등수의 확률은 꽝으로 간다 (gacha_pick 이 null 을 돌려준다 — 다른 등수로 나누지 않는다) */
export function effectiveRow(row: number[], soldOut: ReadonlySet<number>): EffectiveRow {
  const missBase = r2(100 - row.reduce((a, b) => a + b, 0));
  let moved = 0;
  const odds = row.map((v, i) => {
    if (!soldOut.has(i + 1)) return v;
    moved += v;
    return 0;
  });
  return { odds, missBase, miss: r2(missBase + moved), moved: r2(moved) };
}

/**
 * 한 줄 안에서 아래 등수일수록 확률이 같거나 높아야 하고 꽝이 가장 커야 한다 (admin_set_config 검사).
 * 어긋난 칸 번호를 돌려준다 — 0부터 등수 칸, row.length = 꽝 칸.
 */
export function orderProblems(row: number[]): number[] {
  const bad: number[] = [];
  for (let k = 1; k < row.length; k++) if (row[k] < row[k - 1]) bad.push(k);
  const miss = r2(100 - row.reduce((a, b) => a + b, 0));
  if (row.length > 0 && miss < row[row.length - 1]) bad.push(row.length);
  return bad;
}
