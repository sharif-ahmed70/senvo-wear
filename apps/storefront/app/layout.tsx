import type { Metadata } from "next";
import "./globals.css";
import { StorefrontShell } from "./_components/storefront-shell";
import { CustomerAuthProvider } from "./_components/customer-auth-provider";

export const metadata: Metadata = {
  description:
    "Modern clothing and accessories, designed in Dhaka for everyday confidence.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    description: "Made to move with your life.",
    images: [
      {
        alt: "SENVO Wear campaign",
        height: 630,
        url: "/og.png",
        width: 1200,
      },
    ],
    title: "SENVO Wear",
    type: "website",
  },
  title: { default: "SENVO Wear", template: "%s / SENVO Wear" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <CustomerAuthProvider>
          <StorefrontShell>{children}</StorefrontShell>
        </CustomerAuthProvider>
      </body>
    </html>
  );
}
