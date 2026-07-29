import type { Metadata } from "next";
import { AdminAppFrame } from "./_components/admin-app-frame";
import { adminFoundationSession } from "./_lib/admin-access";
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
        <AdminAppFrame session={adminFoundationSession}>
          {children}
        </AdminAppFrame>
      </body>
    </html>
  );
}
