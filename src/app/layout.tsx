import "@fontsource-variable/onest";
import "@fontsource-variable/unbounded";
import "@fontsource/ibm-plex-mono/400.css";
import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Дайджест Платформы Сейл Трекер",
    template: "%s — Сейл Трекер",
  },
  description:
    "Персональные сигналы рынка для поставщиков и закупщиков розничных сетей.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html data-scroll-behavior="smooth" lang="ru">
      <body>{children}</body>
    </html>
  );
}
