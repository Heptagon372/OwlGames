import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { BrowserSupportNotice } from "@/components/BrowserSupportNotice";
import { SoundBoot } from "@/components/SoundBoot";
import { SUPABASE_URL } from "@/lib/env";
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
  // hud(게임 HUD 문구, 전체 번역의 2/3) 는 게임 화면에서만 쓴다 — 로비·랭킹은 20~30초마다 새로 고치므로
  // 여기서 같이 실어 보내면 폰마다 그만큼을 계속 다시 받는다. 게임 화면이 자기 것만 더 얹는다.
  const shell = Object.fromEntries(Object.entries(messages).filter(([k]) => k !== "hud"));
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
        {/* Supabase 로 갈 DNS·TLS 를 미리 열어 둔다 — 첫 조회가 연결부터 기다리지 않게 */}
        {SUPABASE_URL && (
          <>
            <link rel="preconnect" href={SUPABASE_URL} crossOrigin="" />
            <link rel="dns-prefetch" href={SUPABASE_URL} />
          </>
        )}
      </head>
      <body className="antialiased">
        <div className="night-sky" aria-hidden />
        <div className="sky-day" aria-hidden />
        <NextIntlClientProvider locale={locale} messages={shell}>
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
