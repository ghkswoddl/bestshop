import Link from "next/link";
import type { ComponentProps } from "react";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./Button";

/**
 * 버튼처럼 보이는 내비게이션 링크.
 * `<Link><Button/></Link>` 는 a 안에 button 이 들어가는 잘못된 마크업이라 대신 쓴다.
 */
export function LinkButton({
  variant,
  size,
  fullWidth,
  className,
  ...props
}: ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}) {
  return <Link className={buttonClass({ variant, size, fullWidth, className })} {...props} />;
}
