"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import { signUpAction, type AuthState } from "../actions";
import { Button } from "@/components/ui/Button";
import { Field, FormError, TerminalCard } from "@/components/ui/Field";

function SubmitButton() {
  const t = useTranslations("auth");
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" block disabled={pending}>
      {pending ? t("signupPending") : t("signupSubmit")}
    </Button>
  );
}

export function SignUpForm({ studentIdPattern }: { studentIdPattern: string }) {
  const t = useTranslations("auth");
  const [state, action] = useActionState<AuthState, FormData>(signUpAction, null);

  return (
    <TerminalCard title="owl@sowl:~$ signup">
      <form action={action} className="grid gap-4">
        <Field
          label={t("name")}
          name="name"
          required
          maxLength={20}
          autoComplete="name"
          placeholder={t("namePlaceholder")}
        />
        <Field
          label={t("studentId")}
          name="student_id"
          required
          mono
          inputMode="numeric"
          pattern={studentIdPattern.replace(/^\^|\$$/g, "")}
          placeholder="202612345"
          autoComplete="username"
          hint={t("studentIdHint")}
        />
        <Field
          label={t("password")}
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          hint={t("passwordHint")}
        />
        <Field
          label={t("password2")}
          name="password2"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
        />
        <FormError message={state?.error} />
        <SubmitButton />
      </form>
    </TerminalCard>
  );
}
