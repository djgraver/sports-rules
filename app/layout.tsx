import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rules Ref",
  appleWebApp: { capable: true, title: "Rules Ref", statusBarStyle: "default" },
  description: "Plain-language answers to rules questions for amateur sport in Australia, with citations to the official rulebooks.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#14532d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
