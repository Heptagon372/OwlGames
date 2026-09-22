import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/auth/actions";

export function SignOutButton({ label = "로그아웃" }: { label?: string }) {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-mute hover:bg-white/5 hover:text-ink"
      >
        <LogOut className="size-4" />
        {label}
      </button>
    </form>
  );
}
