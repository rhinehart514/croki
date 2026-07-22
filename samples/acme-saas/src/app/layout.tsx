import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

const themeBootScript = `
  try {
    const theme = window.localStorage.getItem("acme-theme");
    if (theme === "light" || theme === "dark") {
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    }
  } catch {}
`;

export const metadata: Metadata = {
  title: "Acme",
  description: "A simple task tracker for small teams.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
