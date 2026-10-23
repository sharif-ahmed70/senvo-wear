import type { Metadata } from "next";
import { Bodoni_Moda, Jost } from "next/font/google";
import "./globals.css";
import { StorefrontShell } from "./_components/storefront-shell";
import { CustomerAuthProvider } from "./_components/customer-auth-provider";

const displayFont = Bodoni_Moda({
  axes: ["opsz"],
  display: "swap",
  subsets: ["latin"],
  variable: "--font-bodoni",
});
const sansFont = Jost({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-jost",
});

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
    <html className={`${displayFont.variable} ${sansFont.variable}`} lang="en">
      <body>
        <CustomerAuthProvider>
          <StorefrontShell>{children}</StorefrontShell>
        </CustomerAuthProvider>
      </body>
    </html>
  );
}
