// Supabase 연결 정보. 없으면 조회는 빈 값을 돌려주고 로그인·게임은 막힌다 (가짜 데이터는 없다 — DECISIONS §5-22).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** 학번 → Supabase Auth 이메일 (§11). 유저에게는 학번만 보인다. */
export function studentEmail(studentId: string): string {
  return `${studentId}@owlgames.local`;
}
