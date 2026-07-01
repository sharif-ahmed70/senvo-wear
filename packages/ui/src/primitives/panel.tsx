import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../utils/cn.js";

export type PanelProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
};

export function Panel({ children, className, ...props }: PanelProps) {
  return (
    <section className={cn("senvo-panel", className)} {...props}>
      {children}
    </section>
  );
}
