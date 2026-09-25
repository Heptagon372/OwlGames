"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import { signInAction, type AuthState } from "../actions";
import { Button } from "@/components/ui/Button";
import { Field, FormError, TerminalCard } from "@/components/ui/Field";

function SubmitButton() {
  const t = useTranslations("auth");
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" block disabled={pending}>
      {pending ? t("loginPending") : t("login")}
    </Button>
  );
}

export function LoginForm() {
  const t = useTranslations("auth");
  const [state, action] = useActionState<AuthState, FormData>(signInAction, null);

  return (
    <TerminalCard title="owl@sowl:~$ login">
      <form action={action} className="grid gap-4">
        <Field
          label={t("studentId")}
          name="student_id"
          required
          mono
          inputMode="numeric"
          placeholder="202612345"
          autoComplete="username"
        />
        <Field label={t("password")} name="password" type="password" required autoComplete="current-password" />
        <FormError message={state?.error} />
        <SubmitButton />
      </form>
    </TerminalCard>
  );
}
