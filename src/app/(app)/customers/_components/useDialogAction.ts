"use client";

import { useState, useTransition } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form-state";

/**
 * 모달 폼용 서버 액션 러너.
 *
 * `useActionState` 대신 직접 호출하는 이유: 성공 시 모달을 닫으려면 결과를 보고
 * setState 를 해야 하는데, `useActionState` 의 결과는 effect 로만 관찰할 수 있고
 * effect 안의 setState 는 연쇄 렌더를 유발한다(react-hooks/set-state-in-effect).
 * 트랜지션 콜백에서 닫으면 그 문제가 없다.
 */
export function useDialogAction(
  action: (formData: FormData) => Promise<FormState>,
  onSuccess: () => void,
) {
  const [state, setState] = useState<FormState>(EMPTY_FORM_STATE);
  const [pending, startTransition] = useTransition();

  const run = (formData: FormData) => {
    startTransition(async () => {
      const result = await action(formData);
      setState(result);
      if (result.ok) onSuccess();
    });
  };

  return { error: state.error, pending, run };
}
