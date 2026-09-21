import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { AlertTriangleIcon } from "./icons";

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  /** 값이 있으면 오류 상태로 렌더링한다 (색상 단독이 아닌 아이콘+문구 병행). */
  error?: string;
  suffix?: ReactNode;
}

export const controlBaseClass =
  "h-10 w-full rounded-control border bg-white px-md text-body text-gray-900 placeholder:text-gray-400 disabled:bg-gray-100 disabled:text-gray-400";

export function TextField({
  label,
  hint,
  error,
  suffix,
  className,
  id,
  ...props
}: TextFieldProps) {
  const inputId = id ?? props.name;
  return (
    <div className="flex w-full flex-col gap-xs">
      {label && (
        <label htmlFor={inputId} className="text-caption font-medium text-gray-700">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          className={cn(
            controlBaseClass,
            error ? "border-error focus:border-error" : "border-gray-200 focus:border-lg-red",
            suffix && "pr-3xl",
            className,
          )}
          {...props}
        />
        {suffix && (
          <span className="absolute inset-y-0 right-md flex items-center text-gray-700">
            {suffix}
          </span>
        )}
      </div>
      {error ? (
        <p className="flex items-center gap-xs text-caption text-error">
          <AlertTriangleIcon className="shrink-0" />
          {error}
        </p>
      ) : (
        hint && <p className="text-caption text-gray-700">{hint}</p>
      )}
    </div>
  );
}
