"use client";

import { useState } from "react";
import { Button, Modal, Select, TextArea, TextField } from "@/components/ui";
import { saveApplianceAction } from "@/lib/customer-actions";
import { useDialogAction } from "./useDialogAction";

export interface CategoryOption {
  id: string;
  name: string;
}

export interface ApplianceFormValues {
  id: string;
  categoryId: string;
  modelName: string;
  brand: string;
  purchasedAt: string;
  purchasePrice: string;
  note: string;
}

export function ApplianceDialog({
  customerId,
  categories,
  values,
  triggerLabel,
  triggerVariant = "primary",
}: {
  customerId: string;
  categories: CategoryOption[];
  values?: ApplianceFormValues;
  triggerLabel: string;
  triggerVariant?: "primary" | "secondary" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const { error, pending, run } = useDialogAction(saveApplianceAction, () => setOpen(false));

  const formId = `appliance-form-${values?.id ?? "new"}`;

  return (
    <>
      <Button variant={triggerVariant} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={values ? "보유가전 수정" : "보유가전 추가"}
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
          <input type="hidden" name="customerId" value={customerId} />
          {values && <input type="hidden" name="applianceId" value={values.id} />}
          <div className="grid grid-cols-1 gap-lg sm:grid-cols-2">
            <Select
              name="categoryId"
              label="품목"
              required
              defaultValue={values?.categoryId ?? ""}
              placeholder="품목 선택"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
            <TextField
              name="modelName"
              label="모델명"
              required
              defaultValue={values?.modelName}
              placeholder="OBJET-REF-870"
            />
            <TextField name="brand" label="브랜드" defaultValue={values?.brand ?? "LG"} />
            <TextField
              name="purchasedAt"
              label="구매일"
              type="date"
              defaultValue={values?.purchasedAt}
            />
            <TextField
              name="purchasePrice"
              label="구매가격 (원)"
              inputMode="numeric"
              defaultValue={values?.purchasePrice}
              placeholder="1890000"
            />
          </div>
          <TextArea
            name="note"
            label="상담 메모"
            defaultValue={values?.note}
            hint="추천상품 연계 섹션에 그대로 표시됩니다."
            placeholder="소음 문제로 교체 문의, 4도어 선호"
          />
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
