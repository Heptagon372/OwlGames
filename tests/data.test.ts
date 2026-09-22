import { describe, expect, it } from "vitest";
import { TYPER_WORDS, type TyperDifficulty } from "@/data/typer-words";
import { PHISH_CARDS } from "@/data/phish-cards";

describe("나이트 타이퍼 단어 풀 (§7.1)", () => {
  const tiers: TyperDifficulty[] = ["easy", "normal", "hard"];

  it("난이도별 40개 이상", () => {
    for (const t of tiers) expect(TYPER_WORDS[t].length).toBeGreaterThanOrEqual(40);
  });

  it("중복이 없다", () => {
    const all = tiers.flatMap((t) => TYPER_WORDS[t]);
    expect(new Set(all).size).toBe(all.length);
  });

  it("입력 가능한 문자만 쓴다", () => {
    const allowed = /^[a-zA-Z0-9 \-_./@*:=|~+]+$/;
    for (const t of tiers) {
      for (const w of TYPER_WORDS[t]) {
        expect(w, w).toMatch(allowed);
        expect(w.trim(), w).toBe(w);
        expect(w.includes("  "), w).toBe(false);
      }
    }
  });

  it("난이도별 길이 범위", () => {
    for (const w of TYPER_WORDS.easy) expect(w.length, w).toBeLessThanOrEqual(6);
    for (const w of TYPER_WORDS.normal) expect(w.length, w).toBeLessThanOrEqual(12);
    for (const w of TYPER_WORDS.hard) expect(w.length, w).toBeGreaterThanOrEqual(10);
  });
});

describe("피싱 헌터 카드 (§7.3)", () => {
  it("60장 이상, 정상:피싱 = 4:6 근처", () => {
    expect(PHISH_CARDS.length).toBeGreaterThanOrEqual(60);
    const phish = PHISH_CARDS.filter((c) => c.isPhish).length;
    const ratio = phish / PHISH_CARDS.length;
    expect(ratio).toBeGreaterThan(0.55);
    expect(ratio).toBeLessThan(0.65);
  });

  it("id가 유일하고 필수 필드가 있다", () => {
    expect(new Set(PHISH_CARDS.map((c) => c.id)).size).toBe(PHISH_CARDS.length);
    for (const c of PHISH_CARDS) {
      expect(c.body.length, c.id).toBeGreaterThan(0);
      expect(c.explain.length, c.id).toBeGreaterThan(0);
      expect(c.explain.length, c.id).toBeLessThanOrEqual(30);
      if (c.kind === "email") expect(c.title, c.id).toBeTruthy();
      if (c.kind !== "url") expect(c.sender, c.id).toBeTruthy();
    }
  });

  it("종류별로 정상·피싱이 섞여 있다 (한 종류가 정답이 되지 않게)", () => {
    for (const kind of ["url", "sms", "email"] as const) {
      const set = PHISH_CARDS.filter((c) => c.kind === kind);
      expect(set.some((c) => c.isPhish), kind).toBe(true);
      expect(set.some((c) => !c.isPhish), kind).toBe(true);
    }
  });
});
