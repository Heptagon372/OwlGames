import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BoothKiosk } from "@/components/booth/BoothKiosk";
import { Logo } from "@/components/brand/Logo";
import { DemoBanner } from "@/components/DemoBanner";
import { SignOutButton } from "@/components/SignOutButton";
import { OpenStatus } from "@/components/OpenStatus";
import { Chip } from "@/components/ui/Card";
import { getAppConfig, getIsOpen, getMyProfile } from "@/lib/queries";

export const metadata: Metadata = { title: "부스 키오스크" };

export default async function BoothPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/auth/login");
  if (profile.role === "user") redirect("/lobby");

  const [config, open] = await Promise.all([getAppConfig(), getIsOpen()]);

  return (
    <div className="min-h-dvh">
      <DemoBanner />
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex items-center gap-3">
          <Logo size="sm" href="/lobby" />
          <Chip tone="aqua">BOOTH</Chip>
        </div>
        <div className="flex items-center gap-3">
          <OpenStatus open={open} hours={config.open_hours} />
          <span className="text-sm text-mute">{profile.name} 부원</span>
          <SignOutButton />
        </div>
      </header>
      <main className="pt-6">
        <BoothKiosk />
      </main>
    </div>
  );
}
