import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-lg-red text-white hover:bg-lg-red-dark",
  secondary: "bg-white border border-gray-200 text-gray-900 hover:bg-gray-100",
  ghost: "bg-transparent text-lg-red hover:bg-lg-red-light",
};

const SIZE: Record<ButtonSize, string> = {
  md: "h-10 px-lg",
  lg: "h-12 px-xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

/** 버튼처럼 보여야 하는 링크(`LinkButton`)가 같은 토큰을 쓰도록 클래스만 떼어 둔다. */
export function buttonClass(options: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
}): string {
  const { variant = "primary", size = "md", fullWidth, disabled, className } = options;
  return cn(
    "inline-flex items-center justify-center gap-sm rounded-control text-button transition-colors",
    SIZE[size],
    disabled ? "cursor-not-allowed border-0 bg-gray-200 text-gray-400" : VARIANT[variant],
    fullWidth && "w-full",
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  fullWidth,
  className,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={buttonClass({ variant, size, fullWidth, disabled, className })}
      {...props}
    />
  );
}
