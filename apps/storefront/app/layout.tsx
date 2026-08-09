import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "SENVO Wear",
  description: "Everyday clothing, ready for delivery across Bangladesh.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link className="brand" href="/">
            SENVO <span>WEAR</span>
          </Link>
          <nav aria-label="Store">
            <Link href="/">Shop</Link>
            <Link href="/cart">Bag</Link>
          </nav>
        </header>
        {children}
        <footer>
          Designed for everyday Bangladesh. Cash on delivery available.
        </footer>
      </body>
    </html>
  );
}
