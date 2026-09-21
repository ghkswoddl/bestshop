import type { ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { AlertTriangleIcon, ChevronDownIcon } from "./icons";
import { controlBaseClass } from "./TextField";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  placeholder?: string;
}

export function Select({
  label,
  hint,
  error,
  placeholder,
  className,
  id,
  children,
  ...props
}: SelectProps) {
  const selectId = id ?? props.name;
  return (
    <div className="flex w-full flex-col gap-xs">
      {label && (
        <label htmlFor={selectId} className="text-caption font-medium text-gray-700">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          aria-invalid={error ? true : undefined}
          className={cn(
            controlBaseClass,
            "appearance-none pr-3xl",
            error ? "border-error focus:border-error" : "border-gray-200 focus:border-lg-red",
            className,
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {children}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute inset-y-0 right-md my-auto text-gray-700" />
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
