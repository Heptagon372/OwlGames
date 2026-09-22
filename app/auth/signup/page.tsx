import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "./SignUpForm";
import { Logo } from "@/components/brand/Logo";
import { DemoBanner } from "@/components/DemoBanner";
import { getAppConfig } from "@/lib/queries";

export const metadata: Metadata = { title: "회원가입" };

export default async function SignUpPage() {
  const config = await getAppConfig();
  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16">
      <DemoBanner />
      <header className="py-5">
        <Logo size="sm" />
      </header>
      <h1 className="mb-1 mt-4 text-2xl font-black">회원가입</h1>
      <p className="mb-6 text-sm text-mute">
        학번으로 가입한 뒤, S.OWL 부스에서 학생증 확인을 받으면 바로 플레이할 수 있어요.
      </p>
      <SignUpForm studentIdPattern={config.student_id_pattern} />
      <p className="mt-6 text-center text-sm text-mute">
        이미 계정이 있나요?{" "}
        <Link href="/auth/login" className="font-bold text-aqua hover:underline">
          로그인
        </Link>
      </p>
    </div>
  );
}
