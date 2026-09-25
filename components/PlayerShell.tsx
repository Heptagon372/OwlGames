import Link from "next/link";
import { Gamepad2, Ticket, Trophy, UserRound } from "lucide-react";
import { Logo } from "./brand/Logo";
import { RankBadge } from "./RankBadge";
import { ExpBar } from "./ExpBar";
import { DemoBanner } from "./DemoBanner";
import { OwlEnergyBar } from "./OwlEnergyBar";
import { cn } from "@/lib/cn";
import { rankInfo } from "@/lib/rank";
import type { OwlEnergy, Profile } from "@/lib/types";

const NAV = [
  { href: "/lobby", label: "로비", icon: Gamepad2 },
  { href: "/rank", label: "랭킹", icon: Trophy },
  { href: "/ticket", label: "티켓", icon: Ticket },
  { href: "/me", label: "내 기록", icon: UserRound },
];

/** 로비·랭킹·티켓·내기록 공통 셸 (모바일 우선: 하단 탭바) */
export function PlayerShell({
  profile,
  energy,
  current,
  children,
}: {
  profile: Profile;
  energy: OwlEnergy;
  current: string;
  children: React.ReactNode;
}) {
  const r = rankInfo(profile.rank_idx);
  return (
    <div className="mx-auto flex min-h-dvh-safe w-full max-w-2xl flex-col">
      {/* 유리 헤더: 아래쪽에만 시안→바이올렛 헤어라인이 깔린다 */}
      <header className="sticky top-0 z-30 bg-night/60 backdrop-blur-xl backdrop-saturate-150">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Logo size="sm" href="/lobby" />
          <Link href="/me" className="flex items-center gap-2 rounded-2xl px-2 py-1 transition-colors hover:bg-white/5">
            <div className="text-right leading-tight">
              <p className="text-sm font-bold">{profile.name}</p>
              <p className="num text-[11px]" style={{ color: r.colors[0] }}>
                {r.name} · Lv {profile.level}
              </p>
            </div>
            <RankBadge rankIdx={profile.rank_idx} size="sm" />
          </Link>
        </div>
        <div className="flex items-center gap-3 px-4 pb-3">
          <ExpBar points={profile.total_points} compact className="flex-1" />
          <OwlEnergyBar initial={energy} compact />
        </div>
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-neon/45 to-transparent" />
      </header>

      <DemoBanner />

      <main className="flex-1 px-4 pb-28 pt-4">{children}</main>

      {/* 유리 탭바: 선택된 탭만 바이올렛으로 빛나고 위에 그라데이션 헤어라인 */}
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-2xl bg-night/70 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-neon/45 to-transparent" />
        <ul className="grid grid-cols-4">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = current === href;
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-bold transition-colors",
                    active ? "text-neon-soft" : "text-dim hover:text-mute",
                  )}
                >
                  {active && (
                    <span className="grad-fill pointer-events-none absolute left-1/2 top-0 h-0.5 w-10 -translate-x-1/2 rounded-full shadow-[0_0_14px_rgb(167_139_250/0.9)]" />
                  )}
                  <Icon className={cn("relative size-5", active && "drop-shadow-[0_0_10px_rgb(167_139_250/0.9)]")} />
                  <span className="relative">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
