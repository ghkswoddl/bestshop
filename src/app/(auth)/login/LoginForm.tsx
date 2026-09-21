"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, TextField } from "@/components/ui";
import { AlertTriangleIcon } from "@/components/ui/icons";
import { loginAction, type LoginState } from "@/lib/auth-actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" fullWidth disabled={pending}>
      {pending ? "로그인 중..." : "로그인"}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="mt-xl flex flex-col gap-lg">
      <TextField
        name="employeeNo"
        label="사번"
        placeholder="사번을 입력하세요"
        autoComplete="username"
        required
      />
      <TextField
        name="password"
        type="password"
        label="비밀번호"
        placeholder="비밀번호를 입력하세요"
        autoComplete="current-password"
        required
      />
      {state.error && (
        <p
          role="alert"
          className="flex items-center gap-xs rounded-control bg-error/10 px-md py-sm text-caption text-error"
        >
          <AlertTriangleIcon className="shrink-0" />
          {state.error}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
