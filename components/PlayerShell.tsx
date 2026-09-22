import Link from "next/link";
import { Gamepad2, Ticket, Trophy, UserRound } from "lucide-react";
import { Logo } from "./brand/Logo";
import { RankBadge } from "./RankBadge";
import { ExpBar } from "./ExpBar";
import { DemoBanner } from "./DemoBanner";
import { cn } from "@/lib/cn";
import { rankInfo } from "@/lib/rank";
import type { Profile } from "@/lib/types";

const NAV = [
  { href: "/lobby", label: "로비", icon: Gamepad2 },
  { href: "/rank", label: "랭킹", icon: Trophy },
  { href: "/ticket", label: "티켓", icon: Ticket },
  { href: "/me", label: "내 기록", icon: UserRound },
];

/** 로비·랭킹·티켓·내기록 공통 셸 (모바일 우선: 하단 탭바) */
export function PlayerShell({
  profile,
  current,
  children,
}: {
  profile: Profile;
  current: string;
  children: React.ReactNode;
}) {
  const r = rankInfo(profile.rank_idx);
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-night/80 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Logo size="sm" href="/lobby" />
          <Link href="/me" className="flex items-center gap-2 rounded-2xl px-2 py-1 hover:bg-white/5">
            <div className="text-right leading-tight">
              <p className="text-sm font-bold">{profile.name}</p>
              <p className="num text-[11px]" style={{ color: r.colors[0] }}>
                {r.name} · Lv {profile.level}
              </p>
            </div>
            <RankBadge rankIdx={profile.rank_idx} size="sm" />
          </Link>
        </div>
        <div className="px-4 pb-3">
          <ExpBar points={profile.total_points} compact />
        </div>
      </header>

      <DemoBanner />

      <main className="flex-1 px-4 pb-28 pt-4">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-2xl border-t border-line bg-night/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        <ul className="grid grid-cols-4">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = current === href;
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-bold transition-colors",
                    active ? "text-neon" : "text-dim hover:text-mute",
                  )}
                >
                  <Icon className={cn("size-5", active && "drop-shadow-[0_0_8px_rgb(255_176_32/0.7)]")} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
