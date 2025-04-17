import type { Metadata } from "next";
import "./globals.css";
import RootProviders from "./providers";

export const metadata: Metadata = {
  title: "Crosspace",
  description: "Scan. Share. Effortlessly. Seamlessly.",
  icons: {
    icon: [
      {
        media: "(prefers-color-scheme: light)",
        url: "/favicon.png",
        href: "/favicon.png",
      },
      {
        media: "(prefers-color-scheme: dark)",
        url: "/favicon-white.png",
        href: "/favicon-white.png",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className="h-full" lang="en" suppressHydrationWarning>
      <body className="h-full">
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}
