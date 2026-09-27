// 로그인·가입 시도 제한 (DECISIONS §5-27). 서버 인스턴스 메모리에만 있는 가벼운 방어선이다 —
// 여러 인스턴스로 뜨면 인스턴스마다 따로 센다. 최종 방어는 Supabase Auth 의 자체 rate limit.
//
// 부스 행사는 학교 와이파이 한 IP 로 여러 명이 들어오므로 IP 한도는 넉넉히 두고,
// 무차별 대입은 "학번별 실패 횟수"로 막는다.

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

/** 창 안의 기록만 남긴다 */
function prune(b: Bucket, now: number, windowMs: number): void {
  while (b.hits.length > 0 && now - b.hits[0] >= windowMs) b.hits.shift();
}

/** key 에 대해 windowMs 안에 limit 번을 넘었는지. 넘었으면 풀릴 때까지 남은 ms, 아니면 0 */
export function blockedFor(key: string, limit: number, windowMs: number, now = Date.now()): number {
  const b = buckets.get(key);
  if (!b) return 0;
  prune(b, now, windowMs);
  if (b.hits.length < limit) return 0;
  return windowMs - (now - b.hits[b.hits.length - limit]);
}

/** 시도 1회를 기록한다 */
export function hit(key: string, windowMs: number, now = Date.now()): void {
  let b = buckets.get(key);
  if (!b) {
    // 메모리가 끝없이 늘지 않게 — 넘치면 가장 오래된 키부터 버린다
    if (buckets.size >= MAX_KEYS) {
      const oldest = buckets.keys().next().value;
      if (oldest !== undefined) buckets.delete(oldest);
    }
    b = { hits: [] };
    buckets.set(key, b);
  }
  prune(b, now, windowMs);
  b.hits.push(now);
}

export function reset(key: string): void {
  buckets.delete(key);
}

/** 테스트용 */
export function resetAll(): void {
  buckets.clear();
}

export const LIMITS = {
  /**
   * 학번 하나에 로그인 실패 8번 / 5분.
   * 줄 서 있는 사람이 비밀번호를 몇 번 헷갈렸다고 10분을 막으면 차례를 놓친다 —
   * 무차별 대입은 이 정도로도 못 하고(5분에 8번), 최종 방어는 Supabase Auth 다.
   */
  loginFail: { limit: 8, windowMs: 5 * 60_000 },
  /** IP 하나에 로그인 시도 60번 / 5분 (같은 와이파이 여러 명 고려) */
  loginIp: { limit: 60, windowMs: 5 * 60_000 },
  /**
   * IP 하나에 가입 시도 60번 / 10분.
   * 부스에 줄이 서면 학교 와이파이 한 IP 로 10분에 20명은 금방 넘는다.
   * 가입은 어차피 **학번 중복 + 관리자 승인**으로 한 번 더 걸러진다.
   */
  signupIp: { limit: 60, windowMs: 10 * 60_000 },
} as const;
