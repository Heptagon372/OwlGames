import type { Metadata } from "next";
import { MapPin, Clock } from "lucide-react";
import { PendingWatcher } from "./PendingWatcher";
import { Logo } from "@/components/brand/Logo";
import { OwlMark } from "@/components/brand/OwlMark";
import { DemoBanner } from "@/components/DemoBanner";
import { Card, TermLabel } from "@/components/ui/Card";
import { SignOutButton } from "@/components/SignOutButton";
import { getAppConfig, getMyProfile } from "@/lib/queries";

export const metadata: Metadata = { title: "학번 인증 대기중" };

export default async function PendingPage() {
  const [profile, config] = await Promise.all([getMyProfile(), getAppConfig()]);
  const booth = config.booth_location;

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16">
      <DemoBanner />
      <header className="flex items-center justify-between py-5">
        <Logo size="sm" />
        <SignOutButton />
      </header>

      <Card className="mt-6 text-center">
        <OwlMark sleepy className="mx-auto size-24 animate-float" />
        <h1 className="mt-4 text-xl font-black">학번 인증 대기중</h1>
        <p className="mt-2 text-sm leading-relaxed text-mute">
          {profile ? `${profile.name} 님, ` : ""}S.OWL 부스에서 <span className="font-bold text-ink">학생증</span>을 보여주면
          <br />
          부원이 확인 후 바로 승인해드려요.
        </p>
        {profile && (
          <p className="num mt-4 inline-block rounded-full border border-line bg-night px-4 py-2 text-sm text-neon">
            {profile.student_id}
          </p>
        )}
        <div className="mt-6 flex items-center justify-center gap-2 font-mono text-xs text-aqua">
          <span className="size-2 animate-pulse rounded-full bg-aqua" />
          승인되면 자동으로 로비로 이동합니다
        </div>
      </Card>

      <section className="mt-6">
        <TermLabel>booth --location</TermLabel>
        <Card className="mt-2 grid gap-3">
          <p className="flex items-center gap-2 font-bold">
            <MapPin className="size-4 text-neon" />
            {booth.building} {booth.floor} · {booth.spot}
          </p>
          <p className="flex items-center gap-2 text-sm text-mute">
            <Clock className="size-4 text-neon" />
            {config.open_hours.start} ~ {config.open_hours.end} (KST)
          </p>
          {booth.note && <p className="text-xs text-dim">{booth.note}</p>}
        </Card>
      </section>

      <PendingWatcher userId={profile?.id ?? null} />
    </div>
  );
}
