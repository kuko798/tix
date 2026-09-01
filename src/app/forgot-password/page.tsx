"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthStage } from "@/components/auth/auth-stage";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  return (
    <AuthStage index="03"><div className="mx-auto max-w-md px-1 py-12 sm:px-6">
      <p className="section-label">Account recovery / 03</p>
      <h1 className="font-display mt-4 text-6xl uppercase leading-[0.88] sm:text-7xl">Reset your password</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Enter your email. If an account exists, GameSwap will send a one-hour reset link.</p>
      {sent ? (
        <div className="mt-8 border border-border bg-card p-5 text-sm">Check your inbox and spam folder. For privacy, this page does not confirm whether an account exists.</div>
      ) : (
        <form className="mt-8 space-y-4" onSubmit={async (event) => {
          event.preventDefault(); setPending(true);
          const { error } = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: "/reset-password" });
          setPending(false);
          if (error) toast.error("The reset request could not be sent. Try again shortly.");
          else setSent(true);
        }}>
          <div className="space-y-1.5"><Label htmlFor="reset-email">Email</Label><Input id="reset-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          <Button type="submit" className="w-full" disabled={pending}>{pending ? "Sending..." : "Send reset link"}</Button>
        </form>
      )}
      <Link href="/login" className="mt-6 inline-block text-sm font-medium text-primary hover:opacity-70">Back to sign in</Link>
    </div></AuthStage>
  );
}
