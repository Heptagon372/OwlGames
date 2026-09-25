"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAppConfig } from "@/lib/queries";
import { getAdminSupabase, getServerSupabase } from "@/lib/supabase/server";
import { isDemo, studentEmail } from "@/lib/env";

export type AuthState = { error?: string } | null;


function field(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

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
  const password = String(form.get("password") ?? "");
  const password2 = String(form.get("password2") ?? "");

  const config = await getAppConfig();
  if (name.length < 2 || name.length > 20) return { error: t("errName") };
  if (!new RegExp(config.student_id_pattern).test(studentId)) return { error: t("errStudentId") };
  if (password.length < 6) return { error: t("errPassword") };
  if (password !== password2) return { error: t("errPasswordMatch") };

  if (isDemo) redirect("/pending");

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
  const password = String(form.get("password") ?? "");
  if (!studentId || !password) return { error: t("errEmpty") };

  if (isDemo) redirect("/lobby");

  const supabase = await getServerSupabase();
  if (!supabase) return { error: t("errServer") };

  const { error } = await supabase.auth.signInWithPassword({
    email: studentEmail(studentId),
    password,
  });
  if (error) return { error: t("errBadLogin") };

  redirect("/lobby");
}

export async function signOutAction() {
  const supabase = await getServerSupabase();
  await supabase?.auth.signOut();
  redirect("/");
}
