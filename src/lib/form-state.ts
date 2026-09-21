// `useActionState` 로 주고받는 폼 결과 타입.
// "use server" 파일은 async 함수만 export 할 수 있어 상수/타입은 여기에 둔다.

export interface FormState {
  error: string | null;
  /** 성공 직후 한 번만 true. 모달을 닫는 신호로 쓴다. */
  ok?: boolean;
}

export const EMPTY_FORM_STATE: FormState = { error: null };
