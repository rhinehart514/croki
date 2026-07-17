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
  title: "Drover | The founder-controlled Product and GTM system",
  description:
    "Drover is building one founder-controlled venture canvas for understanding, manipulating, and executing the full Product and go-to-market system, with exact authority at the world boundary.",
  applicationName: "Drover",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Drover",
    title: "Drover | The founder-controlled Product and GTM system",
    description:
      "Drover is building one venture canvas for Product and go-to-market, directed through conversation and held under exact founder authority.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Drover | The founder-controlled Product and GTM system",
    description:
      "Drover is building one venture canvas for Product and go-to-market, directed through conversation and held under exact founder authority.",
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
