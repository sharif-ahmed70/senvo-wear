import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SENVO Wear POS",
  description: "Foundation for the future SENVO Wear showroom POS.",
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
