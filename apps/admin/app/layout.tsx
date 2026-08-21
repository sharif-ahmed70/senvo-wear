import type { Metadata } from "next";
import { AdminSessionGate } from "./_components/admin-session-gate";
import "./globals.css";

export const metadata: Metadata = {
  title: "SENVO Wear Admin",
  description: "SENVO Wear operations administration.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AdminSessionGate>{children}</AdminSessionGate>
      </body>
    </html>
  );
}
