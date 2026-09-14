"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { AuthStage } from "@/components/auth/auth-stage";

function VerificationContent() {
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const token = params.get("token");
  const [pending, setPending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");
  if (token || verified) return (
    <div className="mt-8 border border-border bg-card p-5">
      <p className="text-sm leading-relaxed">{verified ? "Your email is verified. You can now sign in." : "Confirm this email address to finish verification."}</p>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {verified ? <Button className="mt-5" asChild><Link href="/login">Sign in</Link></Button> : <Button className="mt-5" disabled={pending} onClick={async () => {
        setPending(true);
        setError("");
        try {
          const response = await fetch("/api/email-verification/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });
          const result = await response.json();
          if (!response.ok) setError(result.error || "Verification failed. Try again.");
          else {
            setVerified(true);
            window.history.replaceState(null, "", "/verify-email");
          }
        } catch {
          setError("Verification is temporarily unavailable. Try again.");
        } finally {
          setPending(false);
        }
      }}>{pending ? "Verifying..." : "Confirm email"}</Button>}
      {error && <Link href="/login" className="mt-4 block text-sm underline">Return to sign in to request a new link</Link>}
    </div>
  );
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
