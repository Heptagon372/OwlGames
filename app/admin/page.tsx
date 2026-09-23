import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { Logo } from "@/components/brand/Logo";
import { DemoBanner } from "@/components/DemoBanner";
import { OpenStatus } from "@/components/OpenStatus";
import { SignOutButton } from "@/components/SignOutButton";
import { Chip } from "@/components/ui/Card";
import { getAppConfig, getIsOpen, getMyProfile } from "@/lib/queries";

export const metadata: Metadata = { title: "관리자" };

export default async function AdminPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/auth/login");
  if (profile.role !== "admin") redirect(profile.role === "staff" ? "/booth" : "/lobby");

  const [config, open] = await Promise.all([getAppConfig(), getIsOpen()]);

  return (
    <div className="min-h-dvh-safe">
      <DemoBanner />
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex items-center gap-3">
          <Logo size="sm" href="/lobby" />
          <Chip tone="neon">ADMIN</Chip>
        </div>
        <div className="flex items-center gap-3">
          <OpenStatus open={open} hours={config.open_hours} />
          <SignOutButton />
        </div>
      </header>
      <main className="pt-6">
        <AdminPanel config={config} meId={profile.id} />
      </main>
    </div>
  );
}
