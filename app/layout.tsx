import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { BrowserSupportNotice } from "@/components/BrowserSupportNotice";
import { SoundBoot } from "@/components/SoundBoot";
import { SCALE_INIT_SCRIPT } from "@/lib/prefs";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  return {
    title: {
      default: t("appName"),
      template: `%s · ${t("appShort")}`,
    },
    description: t("appDesc"),
    applicationName: "OWL GAMES",
  };
}

export const viewport: Viewport = {
  themeColor: "#070b18",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <html
      lang={locale}
      data-theme="dark"
      suppressHydrationWarning
      className={`${pretendard.variable} ${jetbrains.variable} ${arcade.variable}`}
    >
      <head>
        {/* 첫 페인트 전에 테마·화면 크기를 정한다 — 없으면 화면이 한 번 번쩍이거나 글자가 튄다 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT + SCALE_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <div className="night-sky" aria-hidden />
        <div className="sky-day" aria-hidden />
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          {/* 두 컴포넌트 다 번역을 읽으므로 Provider 안에 있어야 한다 */}
          <SoundBoot />
          <BrowserSupportNotice />
        </NextIntlClientProvider>
        <div className="scanlines" aria-hidden />
      </body>
    </html>
  );
}
