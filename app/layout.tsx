import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const pretendard = localFont({
  src: "../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "45 920",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "아울게임즈 OWL GAMES",
    template: "%s · 아울게임즈",
  },
  description: "S.OWL 부스 미니게임 — 플레이하고 랭크를 올려 부스에서 뽑기에 도전하세요.",
  applicationName: "OWL GAMES",
};

export const viewport: Viewport = {
  themeColor: "#0b1020",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${pretendard.variable} ${jetbrains.variable}`}>
      <body className="antialiased">
        <div className="night-sky" aria-hidden />
        {children}
        <div className="scanlines" aria-hidden />
      </body>
    </html>
  );
}
