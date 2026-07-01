import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../utils/cn.js";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary";
};

export function Button({
  children,
  className,
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn("senvo-button", `senvo-button--${variant}`, className)}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
