import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://scaffoldweb.com"),
  title: "Drover | Vibe code your go-to-market",
  description:
    "Drover is a local-first experiment machine for founders. Ground product and go-to-market bets in the real product, keep the work visible, and approve every outward move.",
  applicationName: "Drover",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Drover",
    title: "Drover | Vibe code your go-to-market",
    description:
      "A local-first experiment machine for product and go-to-market work.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Drover | Vibe code your go-to-market",
    description:
      "A local-first experiment machine for product and go-to-market work.",
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#e3e0da",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
