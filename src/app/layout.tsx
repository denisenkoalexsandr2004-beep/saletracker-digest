import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";

import "./globals.css";

const montserrat = Montserrat({
  subsets: ["cyrillic", "latin"],
  display: "swap",
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  title: {
    default: "Дайджест Платформы Сейл Трекер",
    template: "%s — Сейл Трекер",
  },
  description:
    "Персональные сигналы рынка для поставщиков и закупщиков розничных сетей.",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html data-scroll-behavior="smooth" lang="ru">
      <body className={montserrat.variable}>
        <a className="skip-link" href="#main-content">
          К основному содержанию
        </a>
        {children}
      </body>
    </html>
  );
}
