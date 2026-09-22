import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./LoginForm";
import { Logo } from "@/components/brand/Logo";
import { DemoBanner } from "@/components/DemoBanner";

export const metadata: Metadata = { title: "로그인" };

export default function LoginPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16">
      <DemoBanner />
      <header className="py-5">
        <Logo size="sm" />
      </header>
      <h1 className="mb-1 mt-4 text-2xl font-black">로그인</h1>
      <p className="mb-6 text-sm text-mute">학번과 비밀번호로 들어와요.</p>
      <LoginForm />
      <p className="mt-6 text-center text-sm text-mute">
        아직 계정이 없나요?{" "}
        <Link href="/auth/signup" className="font-bold text-aqua hover:underline">
          회원가입
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-dim">
        비밀번호를 잊었다면 S.OWL 부스로 문의해주세요.
      </p>
    </div>
  );
}
