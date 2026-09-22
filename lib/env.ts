// Supabase 환경변수가 없으면 데모 모드: 가짜 데이터로 모든 화면을 미리 볼 수 있고 DB에는 아무것도 쓰지 않는다.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isDemo = !SUPABASE_URL || !SUPABASE_ANON_KEY;

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** 학번 → Supabase Auth 이메일 (§11). 유저에게는 학번만 보인다. */
export function studentEmail(studentId: string): string {
  return `${studentId}@owlgames.local`;
}
