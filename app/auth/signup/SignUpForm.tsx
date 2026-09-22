"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signUpAction, type AuthState } from "../actions";
import { Button } from "@/components/ui/Button";
import { Field, FormError, TerminalCard } from "@/components/ui/Field";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" block disabled={pending}>
      {pending ? "가입 중..." : "가입하고 인증 대기"}
    </Button>
  );
}

export function SignUpForm({ studentIdPattern }: { studentIdPattern: string }) {
  const [state, action] = useActionState<AuthState, FormData>(signUpAction, null);

  return (
    <TerminalCard title="owl@sowl:~$ signup">
      <form action={action} className="grid gap-4">
        <Field label="이름" name="name" required maxLength={20} autoComplete="name" placeholder="홍길동" />
        <Field
          label="학번"
          name="student_id"
          required
          mono
          inputMode="numeric"
          pattern={studentIdPattern.replace(/^\^|\$$/g, "")}
          placeholder="202612345"
          autoComplete="username"
          hint="숫자 9자리 · 학생증 확인에 사용돼요"
        />
        <Field label="비밀번호" name="password" type="password" required minLength={6} autoComplete="new-password" hint="6자 이상" />
        <Field label="비밀번호 확인" name="password2" type="password" required minLength={6} autoComplete="new-password" />
        <FormError message={state?.error} />
        <SubmitButton />
      </form>
    </TerminalCard>
  );
}
