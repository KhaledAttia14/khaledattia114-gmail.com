import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Seoudi PIM", template: "%s · Seoudi PIM" },
  description: "Product Information Management & Content Operations for Seoudi Supermarket",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
