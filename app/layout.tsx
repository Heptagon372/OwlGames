import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import { BrowserSupportNotice } from "@/components/BrowserSupportNotice";
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

// 아케이드 HUD용 (영문·숫자 전용 — 한글은 Pretendard)
// 외부 에셋: Orbitron, SIL Open Font License 1.1 — public/assets/CREDITS.md
const arcade = localFont({
  src: "../public/assets/orbitron/orbitron-variable.ttf",
  variable: "--font-orbitron",
  weight: "400 900",
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
  themeColor: "#070b18",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${pretendard.variable} ${jetbrains.variable} ${arcade.variable}`}>
      <body className="antialiased">
        <div className="night-sky" aria-hidden />
        {children}
        <BrowserSupportNotice />
        <div className="scanlines" aria-hidden />
      </body>
    </html>
  );
}
