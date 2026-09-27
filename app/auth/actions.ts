"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAppConfig } from "@/lib/queries";
import { getAdminSupabase, getServerSupabase } from "@/lib/supabase/server";
import { studentEmail } from "@/lib/env";
import { LIMITS, blockedFor, hit, reset } from "@/lib/rate-limit";
import { isValidName, isValidStudentId, passwordProblem } from "@/lib/validate";

export type AuthState = { error?: string } | null;

/** 폼 값은 전부 문자열·길이 상한을 거친다 (파일·거대한 값이 들어와도 여기서 자른다) */
function field(form: FormData, key: string, max = 64): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function secret(form: FormData, key: string): string {
  const v = form.get(key);
  // 72바이트 검사는 passwordProblem 이 한다 — 여기서는 비정상적으로 긴 값만 자른다
  return typeof v === "string" ? v.slice(0, 256) : "";
}

/** 프록시(Vercel 등)가 붙여 주는 원래 IP. 없으면 한 덩어리로 센다 */
async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

const minutes = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));

/** 가입 트리거가 unique 제약에 걸리면 GoTrue가 일반 메시지로 감싸서 준다 */
function isDuplicateError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("already") ||
    m.includes("duplicate") ||
    m.includes("unique") ||
    m.includes("database error saving new user")
  );
}

export async function signUpAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  // 안내 문구도 고른 언어로 나가야 한다 (next-intl 은 서버 액션 안에서도 요청 언어를 안다)
  const t = await getTranslations("auth");
  const dupMessage = t("errDuplicate");
  const name = field(form, "name");
  const studentId = field(form, "student_id");
  const password = secret(form, "password");
  const password2 = secret(form, "password2");

  const ipKey = `signup:${await clientIp()}`;
  const wait = blockedFor(ipKey, LIMITS.signupIp.limit, LIMITS.signupIp.windowMs);
  if (wait > 0) return { error: t("errRateLimited", { min: minutes(wait) }) };
  hit(ipKey, LIMITS.signupIp.windowMs);

  const config = await getAppConfig();
  if (!isValidName(name)) return { error: t("errName") };
  if (!isValidStudentId(studentId, config.student_id_pattern)) return { error: t("errStudentId") };
  const pw = passwordProblem(password, studentId);
  if (pw === "short" || pw === "long") return { error: t("errPassword") };
  if (pw === "same") return { error: t("errPasswordSame") };
  if (password !== password2) return { error: t("errPasswordMatch") };

  const email = studentEmail(studentId);
  const admin = getAdminSupabase();

  if (admin) {
    // 학번 중복은 auth 단계에서도 걸리지만, 안내 문구를 정확히 주기 위해 먼저 확인한다
    const { data: dup } = await admin.from("profiles").select("id").eq("student_id", studentId).maybeSingle();
    if (dup) return { error: dupMessage };

    // service_role로 이메일 확인 없이 생성 (§11 — 학번@owlgames.local 매핑)
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, student_id: studentId },
    });
    if (error) {
      if (isDuplicateError(error.message)) return { error: dupMessage };
      return { error: t("errSignupFailed", { reason: error.message }) };
    }
  } else {
    const supabase = await getServerSupabase();
    if (!supabase) return { error: t("errServer") };
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, student_id: studentId } },
    });
    if (error) {
      if (isDuplicateError(error.message)) return { error: dupMessage };
      return { error: t("errSignupFailed", { reason: error.message }) };
    }
  }

  const supabase = await getServerSupabase();
  const { error: signInError } = (await supabase?.auth.signInWithPassword({ email, password })) ?? {};
  if (signInError) return { error: t("errSignedUpNoLogin") };

  redirect("/pending");
}

export async function signInAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const t = await getTranslations("auth");
  const studentId = field(form, "student_id");
  const password = secret(form, "password");
  if (!studentId || !password) return { error: t("errEmpty") };

  // 형식이 틀린 학번은 Auth 서버에 보내지도 않는다 (이메일 주소로 바뀌는 값이라 문자를 좁힌다)
  const config = await getAppConfig();
  if (!isValidStudentId(studentId, config.student_id_pattern)) return { error: t("errBadLogin") };

  const ipKey = `login-ip:${await clientIp()}`;
  const failKey = `login-fail:${studentId}`;
  const wait = Math.max(
    blockedFor(ipKey, LIMITS.loginIp.limit, LIMITS.loginIp.windowMs),
    blockedFor(failKey, LIMITS.loginFail.limit, LIMITS.loginFail.windowMs),
  );
  if (wait > 0) return { error: t("errRateLimited", { min: minutes(wait) }) };
  hit(ipKey, LIMITS.loginIp.windowMs);

  const supabase = await getServerSupabase();
  if (!supabase) return { error: t("errServer") };

  const { error } = await supabase.auth.signInWithPassword({
    email: studentEmail(studentId),
    password,
  });
  if (error) {
    hit(failKey, LIMITS.loginFail.windowMs);
    return { error: t("errBadLogin") };
  }
  reset(failKey);

  redirect("/lobby");
}

export async function signOutAction() {
  const supabase = await getServerSupabase();
  await supabase?.auth.signOut();
  redirect("/");
}
