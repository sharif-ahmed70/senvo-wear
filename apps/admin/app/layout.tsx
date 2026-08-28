import type { Metadata } from "next";
import { AdminAppFrame } from "./_components/admin-app-frame";
import { WorkforceLoginWorkspace } from "./_components/workforce-login-workspace";
import { getWorkforceAuthState } from "./_lib/workforce-auth-server";
import "./globals.css";

export const metadata: Metadata = {
  title: "SENVO Wear Admin",
  description: "SENVO Wear operations administration.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const auth = await getWorkforceAuthState();

  return (
    <html lang="en">
      <body>
        {auth.session ? (
          <AdminAppFrame session={auth.session}>{children}</AdminAppFrame>
        ) : (
          <WorkforceLoginWorkspace reason={auth.reason} />
        )}
      </body>
    </html>
  );
}
