import type { ReactNode, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { AlertTriangleIcon } from "./icons";

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
}

export function TextArea({ label, hint, error, className, id, rows = 3, ...props }: TextAreaProps) {
  const areaId = id ?? props.name;
  return (
    <div className="flex w-full flex-col gap-xs">
      {label && (
        <label htmlFor={areaId} className="text-caption font-medium text-gray-700">
          {label}
        </label>
      )}
      <textarea
        id={areaId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        className={cn(
          "w-full rounded-control border bg-white px-md py-sm text-body text-gray-900 placeholder:text-gray-400 disabled:bg-gray-100 disabled:text-gray-400",
          error ? "border-error focus:border-error" : "border-gray-200 focus:border-lg-red",
          className,
        )}
        {...props}
      />
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
