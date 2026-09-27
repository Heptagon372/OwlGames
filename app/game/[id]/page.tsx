import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { GameShell } from "@/games/GameShell";
import { GAMES, isGameId } from "@/lib/games";
import { getAppConfig, getIsOpen, getMyProfile } from "@/lib/queries";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: isGameId(id) ? GAMES[id].title : "게임" };
}

export function generateStaticParams() {
  return Object.keys(GAMES).map((id) => ({ id }));
}

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isGameId(id)) notFound();

  const [profile, open, config, locale, messages] = await Promise.all([
    getMyProfile(),
    getIsOpen(),
    getAppConfig(),
    getLocale(),
    getMessages(),
  ]);
  if (!profile) redirect("/auth/login");
  if (!profile.verified) redirect("/pending");
  if (!open) redirect("/lobby?closed=1");

  // 루트 레이아웃은 hud 를 뺀 문구만 보낸다 — 이 게임의 HUD 문구만 여기서 얹는다 (다른 게임 것은 안 보낸다)
  const hud = (messages.hud ?? {}) as Record<string, unknown>;
  const gameMessages = { ...messages, hud: { common: hud.common, [id]: hud[id] } };

  return (
    <NextIntlClientProvider locale={locale} messages={gameMessages}>
      <GameShell game={id} points={{ base: config.game_points.base, rate: config.game_points.per_min[id] ?? 0 }} />
    </NextIntlClientProvider>
  );
}
