import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import ko from "../messages/ko.json";

/** 중첩 객체를 "a.b.c" 키 목록으로 편다. 배열은 길이까지 본다 (규칙 목록이 짧아지면 잡힌다) */
function flatten(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return [`${prefix}[]=${value.length}`, ...value.flatMap((v, i) => flatten(v, `${prefix}.${i}`))];
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

/** {name} 자리 표시자 (ICU plural 안의 # 은 제외) */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort();
}

function leaves(value: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (typeof value === "string") {
    out[prefix] = value;
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => leaves(v, `${prefix}.${i}`, out));
    return out;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) leaves(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

describe("messages (ko/en)", () => {
  it("두 언어의 키가 정확히 같다", () => {
    const a = flatten(ko).sort();
    const b = flatten(en).sort();
    expect(b.filter((k) => !a.includes(k)), "한국어에 없는 영어 키").toEqual([]);
    expect(a.filter((k) => !b.includes(k)), "영어에 없는 한국어 키").toEqual([]);
  });

  it("같은 키는 같은 자리 표시자를 쓴다", () => {
    const a = leaves(ko);
    const b = leaves(en);
    for (const [key, text] of Object.entries(a)) {
      const other = b[key];
      if (other === undefined) continue;
      // plural 문법을 쓰는 쪽은 자리 표시자가 늘어나므로 "한쪽이 다른 쪽을 포함"만 본다
      const ka = placeholders(text);
      const kb = placeholders(other);
      const missing = ka.filter((p) => !kb.includes(p));
      expect(missing, `${key} — 영어 문구에 빠진 자리 표시자`).toEqual([]);
    }
  });

  it("빈 문구가 없다", () => {
    for (const [locale, dict] of [["ko", ko], ["en", en]] as const) {
      for (const [key, text] of Object.entries(leaves(dict))) {
        expect(text.trim().length, `${locale}:${key}`).toBeGreaterThan(0);
      }
    }
  });
});
