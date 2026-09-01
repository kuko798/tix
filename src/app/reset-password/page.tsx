"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthStage } from "@/components/auth/auth-stage";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const error = params.get("error");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  if (!token || error) return <p className="mt-6 border border-danger/40 bg-danger-tint p-4 text-sm text-danger-tint-foreground">This password reset link is invalid or expired. Request a new link.</p>;
  return (
    <form className="mt-8 space-y-4" onSubmit={async (event) => {
      event.preventDefault();
      if (password !== confirm) return toast.error("The passwords do not match.");
      setPending(true);
      const result = await authClient.resetPassword({ newPassword: password, token });
      setPending(false);
      if (result.error) toast.error(result.error.message || "The password could not be reset.");
      else { toast.success("Password reset. Sign in with your new password."); router.push("/login"); }
    }}>
      <div className="space-y-1.5"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="confirm-password">Confirm password</Label><Input id="confirm-password" type="password" autoComplete="new-password" minLength={12} required value={confirm} onChange={(event) => setConfirm(event.target.value)} /></div>
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Resetting..." : "Reset password"}</Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return <AuthStage index="04"><div className="mx-auto max-w-md px-1 py-12 sm:px-6"><p className="section-label">Secure your account / 04</p><h1 className="font-display mt-4 text-6xl uppercase leading-[0.88] sm:text-7xl">Choose a new password</h1><p className="mt-3 text-sm text-muted-foreground">Use at least 12 characters and do not reuse a password from another site.</p><Suspense><ResetForm /></Suspense></div></AuthStage>;
}
