"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUp } from "@/lib/auth-client";
import { AuthStage } from "@/components/auth/auth-stage";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/discover";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const { error } = await signUp.email({
      name: name.trim(),
      email: email.trim(),
      password,
    });
    setPending(false);
    if (error) {
      toast.error(error.message || "Could not create your account.");
      return;
    }
    router.push(
      process.env.NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION === "true"
        ? `/verify-email?email=${encodeURIComponent(email.trim())}`
        : next
    );
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md px-1 py-12 sm:px-6">
      <p className="section-label">Join the exchange / 02</p>
      <h1 className="font-display mt-4 text-6xl uppercase leading-[0.88] sm:text-7xl">Create an account</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        You need an account to list seats, post a wanted request, or message another fan.
      </p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11"
          />
        </div>
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
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11"
          />
          <p className="text-xs text-muted-foreground">At least 12 characters.</p>
        </div>
        <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-primary hover:opacity-70">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function SignupPage() {
  return (
    <AuthStage index="02">
      <Suspense fallback={<div className="px-6 py-16 text-sm text-muted-foreground">Loading...</div>}>
        <SignupForm />
      </Suspense>
    </AuthStage>
  );
}
