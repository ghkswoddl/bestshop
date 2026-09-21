"use client";

import { useState } from "react";
import { Button, Modal, TextArea, TextField } from "@/components/ui";
import { createCustomerAction, updateCustomerAction } from "@/lib/customer-actions";
import { useDialogAction } from "./useDialogAction";

export interface CustomerFormValues {
  id: string;
  name: string;
  phone: string;
  memberNo: string;
  birthDate: string;
  address: string;
  addressDetail: string;
  email: string;
}

export function CustomerFormDialog({
  mode,
  triggerLabel,
  triggerVariant = "primary",
  values,
}: {
  mode: "create" | "edit";
  triggerLabel: string;
  triggerVariant?: "primary" | "secondary";
  values?: CustomerFormValues;
}) {
  const [open, setOpen] = useState(false);
  const { error, pending, run } = useDialogAction(
    mode === "create" ? createCustomerAction : updateCustomerAction,
    () => setOpen(false),
  );

  const formId = `customer-form-${mode}`;

  return (
    <>
      <Button variant={triggerVariant} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={mode === "create" ? "신규 고객 등록" : "고객 정보 수정"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button type="submit" form={formId} disabled={pending}>
              {pending ? "저장 중..." : "저장"}
            </Button>
          </>
        }
      >
        <form id={formId} action={run} className="flex flex-col gap-lg">
          {values && <input type="hidden" name="customerId" value={values.id} />}
          <div className="grid grid-cols-2 gap-lg">
            <TextField
              name="name"
              label="고객명"
              required
              defaultValue={values?.name}
              placeholder="홍길동"
            />
            <TextField
              name="phone"
              label="휴대폰번호"
              required
              inputMode="tel"
              defaultValue={values?.phone}
              placeholder="010-1234-5678"
              hint="하이픈·공백은 자동으로 정규화됩니다."
            />
            <TextField
              name="memberNo"
              label="회원번호"
              defaultValue={values?.memberNo}
              placeholder="LG10001"
            />
            <TextField name="birthDate" label="생년월일" type="date" defaultValue={values?.birthDate} />
            <TextField name="email" label="이메일" type="email" defaultValue={values?.email} />
            <TextField
              name="addressDetail"
              label="상세주소"
              defaultValue={values?.addressDetail}
              placeholder="101동 1001호"
            />
          </div>
          <TextField name="address" label="주소" defaultValue={values?.address} />
          {mode === "create" && (
            <TextArea name="note" label="상담 메모" placeholder="최초 방문 경위, 관심 품목 등" />
          )}
          {error && (
            <p role="alert" className="text-caption text-error">
              {error}
            </p>
          )}
        </form>
      </Modal>
    </>
  );
}
