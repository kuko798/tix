import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/shell/brand-mark";

export function AuthStage({ children, index = "01" }: { children: ReactNode; index?: string }) {
  return (
    <div className="auth-stage">
      <aside className="auth-scene">
        <Image
          src="/images/season-seats.jpg"
          alt="Stadium seating before the crowd arrives"
          fill
          loading="eager"
          sizes="(min-width: 1024px) 48vw, 0px"
          className="object-cover"
        />
        <div className="auth-scene-shade" />
        <div className="auth-scene-copy">
          <span className="tabular text-xs">{index} / GAME ACCESS</span>
          <p className="font-display mt-5 max-w-md text-5xl uppercase leading-[0.9] text-white xl:text-7xl">
            Every seat should find its fan.
          </p>
          <div className="mt-10 h-px w-full bg-white/35" />
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/75">
            Trade, sell, or request tickets while the official issuer remains the source of transfer.
          </p>
        </div>
      </aside>
      <section className="auth-panel">
        <Link href="/" className="auth-wordmark" aria-label="GameSwap home">
          <BrandMark />
        </Link>
        <div className="auth-form-wrap">{children}</div>
      </section>
    </div>
  );
}
