"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/auth-client";
import { AuthStage } from "@/components/auth/auth-stage";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/discover";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const { error } = await signIn.email({ email: email.trim(), password });
    setPending(false);
    if (error) {
      toast.error(error.message || "Could not sign in. Check your email and password.");
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md px-1 py-12 sm:px-6">
      <p className="section-label">Welcome back / 01</p>
      <h1 className="font-display mt-4 text-6xl uppercase leading-[0.88] sm:text-7xl">Sign in</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Use your GameSwap account to list tickets, message fans, and manage trades.
      </p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-xs font-medium text-primary hover:opacity-70">Forgot password?</Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={12}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11"
          />
        </div>
        <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        No account yet?{" "}
        <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-medium text-primary hover:opacity-70">
          Create one
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AuthStage index="01">
      <Suspense fallback={<div className="px-6 py-16 text-sm text-muted-foreground">Loading...</div>}>
        <LoginForm />
      </Suspense>
    </AuthStage>
  );
}
