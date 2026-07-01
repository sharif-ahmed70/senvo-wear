import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SENVO Wear Admin",
  description: "Foundation for the future SENVO Wear admin operations app.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
