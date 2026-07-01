import type { ReactNode } from "react";

export type ApplicationShellProps = {
  appName: string;
  eyebrow: string;
  children: ReactNode;
};

export function ApplicationShell({
  appName,
  eyebrow,
  children,
}: ApplicationShellProps) {
  return (
    <main className="senvo-shell">
      <div className="senvo-shell__inner">
        <p className="senvo-shell__eyebrow">{eyebrow}</p>
        <h1 className="senvo-shell__title">{appName}</h1>
        {children}
      </div>
    </main>
  );
}
