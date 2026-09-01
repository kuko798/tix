"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { AuthStage } from "@/components/auth/auth-stage";

function VerificationContent() {
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const [pending, setPending] = useState(false);
  return (
    <div className="mt-8 border border-border bg-card p-5">
      <p className="text-sm leading-relaxed">Open the verification link sent to {email || "your email address"}. You must verify before signing in when production email delivery is enabled.</p>
      {email && <Button className="mt-5" variant="outline" disabled={pending} onClick={async () => {
        setPending(true);
        const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/discover" });
        setPending(false);
        if (error) toast.error("A verification email could not be sent right now.");
        else toast("Verification email sent");
      }}>{pending ? "Sending..." : "Resend email"}</Button>}
    </div>
  );
}

export default function VerifyEmailPage() {
  return <AuthStage index="05"><div className="mx-auto max-w-md px-1 py-12 sm:px-6"><p className="section-label">Identity check / 05</p><h1 className="font-display mt-4 text-6xl uppercase leading-[0.88] sm:text-7xl">Verify your email</h1><Suspense><VerificationContent /></Suspense></div></AuthStage>;
}
