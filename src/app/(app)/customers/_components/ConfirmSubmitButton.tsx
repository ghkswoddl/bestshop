"use client";

import { Button, type ButtonProps } from "@/components/ui";

/** 되돌릴 수 없는 폼 제출(삭제 등) 앞에 브라우저 확인창을 띄운다. */
export function ConfirmSubmitButton({
  confirmMessage,
  children,
  variant = "ghost",
  ...props
}: ButtonProps & { confirmMessage: string }) {
  return (
    <Button
      type="submit"
      variant={variant}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
      {...props}
    >
      {children}
    </Button>
  );
}
