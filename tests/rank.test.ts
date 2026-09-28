import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { estimatePoints } from "@/lib/games";
import { maskName } from "@/lib/format";
import { DEFAULT_CONFIG } from "@/lib/config";
import { effectiveRow, orderProblems, tierKeys } from "@/lib/gacha";
import {
  CHALLENGER_POINTS,
  MAX_LEVEL,
  MAX_RANK,
  MAX_TIER,
  RANKS,
  challengerBonusAt,
  challengerBonusCount,
  cumPoints,
  levelFromPoints,
  levelProgress,
  pointsToNext,
  rankFromPoints,
  tierFromRank,
} from "@/lib/rank";

// DECISIONS §5-47 — 랭크 v2 (서버 식은 20261020000000_rank_v2.sql)
const RANK_SQL = readFileSync(join(process.cwd(), "supabase/migrations/20261020000000_rank_v2.sql"), "utf8");

describe("레벨 곡선 (rank_v2: base 50 · step 9)", () => {
  it("Lv100 누적은 49,500P = 챌린저", () => {
    expect(cumPoints(100)).toBe(49500);
    expect(cumPoints(100)).toBe(CHALLENGER_POINTS);
  });

  it("L → L+1 필요 포인트 = 50 + 9L", () => {
    expect(pointsToNext(1)).toBe(59);
    expect(pointsToNext(50)).toBe(500);
    expect(cumPoints(3) - cumPoints(2)).toBe(pointsToNext(2));
  });

  it("포인트 → 레벨 경계", () => {
    expect(levelFromPoints(0)).toBe(1);
    expect(levelFromPoints(58)).toBe(1);
    expect(levelFromPoints(59)).toBe(2);
    expect(levelFromPoints(49499)).toBe(99);
    expect(levelFromPoints(49500)).toBe(100);
    expect(levelFromPoints(999999)).toBe(MAX_LEVEL);
  });

  it("만렙 진행도는 100%", () => {
    expect(levelProgress(49500).ratio).toBe(1);
    expect(levelProgress(49500).need).toBe(0);
  });

  it("DB 기본값과 같다", () => {
    expect(RANK_SQL).toContain(`'{"base":${DEFAULT_CONFIG.level_curve.base},"step":${DEFAULT_CONFIG.level_curve.step}}'`);
  });
});

describe("랭크 30단계 (누적 포인트)", () => {
  const gaps = RANKS.slice(1).map((r, i) => r.minPoints - RANKS[i].minPoints);

  it("30단계이고 SQL rank_from_points 표와 같다", () => {
    expect(RANKS).toHaveLength(30);
    expect(MAX_RANK).toBe(29);
    const arr = RANK_SQL.match(/unnest\(array\[([\s\S]*?)\]\) with ordinality as t\(min_points/)![1];
    expect(arr.split(",").map((x) => Number(x.trim()))).toEqual(RANKS.map((r) => r.minPoints));
  });

  it("간격은 올라갈수록 길어진다", () => {
    for (let i = 1; i < gaps.length; i++) expect(gaps[i], `${RANKS[i + 1].name}`).toBeGreaterThan(gaps[i - 1]);
  });

  it("마스터 · 영겁 · 태초 · 정점에서 확 멀어진다 (앞 간격의 1.8배 이상, 나머지는 1.2배 이하)", () => {
    const jumps = new Set(["마스터", "영겁", "태초", "정점"]);
    for (let i = 1; i < gaps.length; i++) {
      const r = RANKS[i + 1];
      const ratio = gaps[i] / gaps[i - 1];
      if (jumps.has(r.name)) expect(ratio, r.name).toBeGreaterThanOrEqual(1.8);
      else expect(ratio, r.name).toBeLessThanOrEqual(1.2);
    }
  });

  it("포인트 → 랭크 경계", () => {
    expect(rankFromPoints(0)).toBe(0);
    expect(rankFromPoints(99)).toBe(0);
    expect(rankFromPoints(100)).toBe(1);
    for (const r of RANKS) {
      expect(rankFromPoints(r.minPoints)).toBe(r.idx);
      if (r.idx > 0) expect(rankFromPoints(r.minPoints - 1)).toBe(r.idx - 1);
    }
    expect(rankFromPoints(10_000_000)).toBe(29);
  });

  it("티어 11개 — 경계는 마스터 · 영겁 · 태초 · 정점 · 챌린저 (SQL tier_from_rank 와 같다)", () => {
    expect(MAX_TIER).toBe(11);
    const expected = [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8, 8, 9, 9, 9, 9, 10, 11];
    expect(RANKS.map((r) => tierFromRank(r.idx))).toEqual(expected);
    // SQL 의 when r >= N then T 목록을 읽어 같은 매핑을 만든다
    const body = RANK_SQL.match(/function public\.tier_from_rank[\s\S]*?\$\$([\s\S]*?)\$\$/)![1];
    const rules = [...body.matchAll(/when r >=\s*(\d+) then (\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const sqlTier = (r: number) => rules.find(([min]) => r >= min)?.[1] ?? 1;
    expect(RANKS.map((r) => sqlTier(r.idx))).toEqual(expected);
    // 보너스 티켓(earned_rank_idx 30+)은 챌린저와 같은 티어
    expect(tierFromRank(30)).toBe(11);
    expect(sqlTier(31)).toBe(11);
  });

  it("나무에서 챌린저까지 랭크 티켓은 29장", () => {
    expect(rankFromPoints(CHALLENGER_POINTS) - rankFromPoints(0)).toBe(29);
  });
});

describe("챌린저 보너스 티켓 (challenger_bonus_count 와 같은 정수 계산)", () => {
  it("간격 = 정점 → 챌린저(8,800) × 1.25ⁿ, 100P 단위 올림", () => {
    expect(RANKS[29].minPoints - RANKS[28].minPoints).toBe(8800);
    expect([1, 2, 3, 4, 5].map(challengerBonusAt)).toEqual([60500, 74300, 91600, 113300, 140500]);
    // 간격이 매번 늘어난다
    for (let n = 2; n < 30; n++)
      expect(challengerBonusAt(n + 1) - challengerBonusAt(n)).toBeGreaterThan(challengerBonusAt(n) - challengerBonusAt(n - 1));
  });

  it("누적 포인트 → 보너스 장수", () => {
    expect(challengerBonusCount(0)).toBe(0);
    expect(challengerBonusCount(CHALLENGER_POINTS)).toBe(0);
    expect(challengerBonusCount(60499)).toBe(0);
    expect(challengerBonusCount(60500)).toBe(1);
    expect(challengerBonusCount(74300)).toBe(2);
    expect(challengerBonusCount(2_147_483_647)).toBeGreaterThan(20); // int 끝까지 가도 멈춘다
    for (let n = 1; n <= 12; n++) {
      expect(challengerBonusCount(challengerBonusAt(n))).toBe(n);
      expect(challengerBonusCount(challengerBonusAt(n) - 1)).toBe(n - 1);
    }
  });

  it("SQL 과 상수·식이 같다", () => {
    const fn = RANK_SQL.match(/function public\.challenger_bonus_count[\s\S]*?\$\$([\s\S]*?)\$\$/)![1];
    expect(fn).toContain("v_iv  bigint := 8800;");
    expect(fn).toContain(`v_thr bigint := ${CHALLENGER_POINTS};`);
    expect(fn).toContain("v_iv  := (v_iv * 5 / 4 + 99) / 100 * 100;");
  });
});

describe("뽑기 확률표 (rank_v2)", () => {
  const table = DEFAULT_CONFIG.gacha_table;

  it("티어 11개, 숫자 순서", () => {
    expect(tierKeys(table)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]);
  });

  it("1등은 운영 값(T1~T6) 유지, 챌린저(T11) 5%", () => {
    expect(tierKeys(table).map((t) => table[t][0])).toEqual([0.1, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);
  });

  it("한 줄 안에서 아래 등수(꽝 쪽)가 늘 더 높다", () => {
    for (const t of tierKeys(table)) {
      const row = table[t];
      for (let k = 1; k < row.length; k++) expect(row[k], `T${t} ${k + 1}등`).toBeGreaterThan(row[k - 1]);
      expect(effectiveRow(row, new Set()).miss, `T${t} 꽝`).toBeGreaterThan(row[row.length - 1]);
      expect(orderProblems(row)).toEqual([]);
    }
  });

  it("티어가 오르면 1~5등이 오르고 꽝이 줄어든다", () => {
    const keys = tierKeys(table);
    for (let i = 1; i < keys.length; i++) {
      const [a, b] = [table[keys[i - 1]], table[keys[i]]];
      for (let k = 0; k < 5; k++) expect(b[k]).toBeGreaterThan(a[k]);
      expect(effectiveRow(b, new Set()).miss).toBeLessThan(effectiveRow(a, new Set()).miss);
    }
  });

  it("SQL 기본값과 같다", () => {
    for (const t of tierKeys(table)) {
      const m = RANK_SQL.match(new RegExp(`'${t}',\\s+jsonb_build_array\\(([^)]*)\\)`))!;
      expect(m[1].split(",").map((x) => Number(x.trim())), `T${t}`).toEqual(table[t]);
    }
  });

  it("재고 0 인 등수의 확률은 꽝으로 간다", () => {
    const e = effectiveRow(table["11"], new Set([1, 3]));
    expect(e.odds).toEqual([0, 7, 0, 14, 18, 21]);
    expect(e.missBase).toBe(25);
    expect(e.moved).toBe(15);
    expect(e.miss).toBe(40);
  });

  it("순서가 어긋난 칸을 찾는다", () => {
    expect(orderProblems([1, 3, 2, 4, 5, 6])).toEqual([2]);
    expect(orderProblems([3, 4, 7, 10, 22, 40])).toEqual([6]); // 꽝 14% < 6등 40%
  });
});

describe("포인트 환산 (points v2 — public.game_points 와 같은 식)", () => {
  const cfg = DEFAULT_CONFIG.game_points;
  it("기본 50P + 분당 × 분 + 원점수 ÷ K, 상한 없음", () => {
    expect(estimatePoints("flight", 0, 0, cfg, 100)).toBe(50);
    expect(estimatePoints("flight", 400, 120, cfg, 100)).toBe(50 + 44 + 4);
    expect(estimatePoints("owlis", 999_999, 600, cfg, 40)).toBe(50 + 80 + 24_999);
    expect(estimatePoints("chef", -50, -5, cfg, 150)).toBe(50);
  });
  it("어려운 게임일수록 분당 포인트가 크다 (아울리스 < 레스토랑 < 서바이버즈 ≤ 아울러닝)", () => {
    const r = cfg.per_min;
    expect(r.owlis).toBeLessThan(r.chef);
    expect(r.chef).toBeLessThan(r.survive);
    expect(r.survive).toBeLessThanOrEqual(r.flight);
  });
});

describe("이름 마스킹 (§9)", () => {
  it("가운데 글자를 가린다", () => {
    expect(maskName("홍길동")).toBe("홍*동");
    expect(maskName("김수")).toBe("김*");
    expect(maskName("남궁민수")).toBe("남**수");
    expect(maskName("김")).toBe("김");
  });
});
