import { OwlMark } from "@/components/brand/OwlMark";
import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh-safe place-items-center px-6 text-center">
      <div>
        <OwlMark sleepy className="mx-auto size-24" />
        <p className="num mt-6 text-5xl font-black text-neon">404</p>
        <p className="mt-2 text-mute">부엉이가 찾지 못한 페이지예요.</p>
        <ButtonLink href="/" className="mt-6">
          처음으로
        </ButtonLink>
      </div>
    </div>
  );
}
