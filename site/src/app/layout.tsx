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
  title: "Croki | Code with Claude and Codex without losing the thread.",
  description:
    "A local, founder-native coding environment that keeps your selected Claude or Codex model, exact work, and source-backed product context connected across every change.",
  applicationName: "Croki",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Croki",
    title: "Croki | Code with Claude and Codex without losing the thread.",
    description:
      "Direct Claude or Codex in the real repository, review exact work, and return with the product context that should improve the next change.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Croki | Code with Claude and Codex without losing the thread.",
    description:
      "Direct Claude or Codex in the real repository, review exact work, and return with the product context that should improve the next change.",
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
