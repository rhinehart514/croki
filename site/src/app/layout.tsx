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
  title: "Croki | You built it. Now get people using it.",
  description:
    "You can already build. Croki takes the app you shipped to its first real users, works on your real Claude or Codex repo, and brings back what they do so you know what to build next. You approve every send.",
  applicationName: "Croki",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Croki",
    title: "Croki | You built it. Now get people using it.",
    description:
      "The build tools stop at 'it's live.' Croki starts there: it gets what you shipped in front of real users, and nothing goes out without your say-so.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Croki | You built it. Now get people using it.",
    description:
      "The build tools stop at 'it's live.' Croki starts there: it gets what you shipped in front of real users, and nothing goes out without your say-so.",
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
