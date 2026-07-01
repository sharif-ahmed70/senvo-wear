import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SENVO Wear Storefront",
  description: "Foundation for the future SENVO Wear customer storefront.",
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
