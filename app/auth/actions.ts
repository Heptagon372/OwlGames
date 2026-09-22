"use server";

import { redirect } from "next/navigation";
import { getAppConfig } from "@/lib/queries";
import { getAdminSupabase, getServerSupabase } from "@/lib/supabase/server";
import { isDemo, studentEmail } from "@/lib/env";

export type AuthState = { error?: string } | null;

const DUP_MESSAGE = "이미 등록된 학번입니다. S.OWL 부스/관리자에게 문의하세요.";

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
  const name = field(form, "name");
  const studentId = field(form, "student_id");
  const password = String(form.get("password") ?? "");
  const password2 = String(form.get("password2") ?? "");

  const config = await getAppConfig();
  if (name.length < 2 || name.length > 20) return { error: "이름을 2~20자로 입력해주세요." };
  if (!new RegExp(config.student_id_pattern).test(studentId)) return { error: "학번 형식이 올바르지 않아요. (숫자 9자리)" };
  if (password.length < 6) return { error: "비밀번호는 6자 이상이어야 해요." };
  if (password !== password2) return { error: "비밀번호가 서로 달라요." };

  if (isDemo) redirect("/pending");

  const email = studentEmail(studentId);
  const admin = getAdminSupabase();

  if (admin) {
    // 학번 중복은 auth 단계에서도 걸리지만, 안내 문구를 정확히 주기 위해 먼저 확인한다
    const { data: dup } = await admin.from("profiles").select("id").eq("student_id", studentId).maybeSingle();
    if (dup) return { error: DUP_MESSAGE };

    // service_role로 이메일 확인 없이 생성 (§11 — 학번@owlgames.local 매핑)
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, student_id: studentId },
    });
    if (error) {
      if (isDuplicateError(error.message)) return { error: DUP_MESSAGE };
      return { error: `가입에 실패했어요: ${error.message}` };
    }
  } else {
    const supabase = await getServerSupabase();
    if (!supabase) return { error: "서버 설정이 올바르지 않아요." };
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, student_id: studentId } },
    });
    if (error) {
      if (isDuplicateError(error.message)) return { error: DUP_MESSAGE };
      return { error: `가입에 실패했어요: ${error.message}` };
    }
  }

  const supabase = await getServerSupabase();
  const { error: signInError } = (await supabase?.auth.signInWithPassword({ email, password })) ?? {};
  if (signInError) return { error: "가입은 됐지만 로그인에 실패했어요. 로그인 화면에서 다시 시도해주세요." };

  redirect("/pending");
}

export async function signInAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const studentId = field(form, "student_id");
  const password = String(form.get("password") ?? "");
  if (!studentId || !password) return { error: "학번과 비밀번호를 입력해주세요." };

  if (isDemo) redirect("/lobby");

  const supabase = await getServerSupabase();
  if (!supabase) return { error: "서버 설정이 올바르지 않아요." };

  const { error } = await supabase.auth.signInWithPassword({
    email: studentEmail(studentId),
    password,
  });
  if (error) return { error: "학번 또는 비밀번호가 올바르지 않아요." };

  redirect("/lobby");
}

export async function signOutAction() {
  const supabase = await getServerSupabase();
  await supabase?.auth.signOut();
  redirect("/");
}
