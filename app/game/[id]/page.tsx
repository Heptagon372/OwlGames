import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
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

  const [profile, open, config] = await Promise.all([getMyProfile(), getIsOpen(), getAppConfig()]);
  if (!profile) redirect("/auth/login");
  if (!profile.verified) redirect("/pending");
  if (!open) redirect("/lobby?closed=1");

  return <GameShell game={id} points={{ base: config.game_points.base, rate: config.game_points.per_min[id] ?? 0 }} />;
}
