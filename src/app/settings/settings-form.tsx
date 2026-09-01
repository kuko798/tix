"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Mail, Phone, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { deleteAccountAction, updateNotificationPreferencesAction, updateProfileAction } from "@/lib/actions";
import { authClient } from "@/lib/auth-client";
import { maskPhoneNumber } from "@/lib/phone";

type Props = {
  profile: { name: string; email: string; homeCity: string; image: string; favoriteTeamIds: string; favoriteLeagueIds: string };
  verification: { emailVerified: boolean; phoneNumber: string; phoneVerified: boolean; emailConfigured: boolean; phoneConfigured: boolean };
  preferences: { emailMessages: boolean; emailOffers: boolean; emailTransfers: boolean; emailPayments: boolean; emailDisputes: boolean; emailMarketing: boolean };
  payoutConfigured: boolean;
  leagues: Array<{ id: string; name: string }>;
  teams: Array<{ id: string; name: string }>;
};

function parseIds(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function SettingsForm({ profile, verification, preferences: initialPreferences, payoutConfigured, leagues, teams }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(profile.name);
  const [homeCity, setHomeCity] = useState(profile.homeCity);
  const [image, setImage] = useState(profile.image);
  const [favoriteLeagueIds, setFavoriteLeagueIds] = useState(() => parseIds(profile.favoriteLeagueIds));
  const [favoriteTeamIds, setFavoriteTeamIds] = useState(() => parseIds(profile.favoriteTeamIds));
  const [preferences, setPreferences] = useState(initialPreferences);
  const [emailSent, setEmailSent] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState(verification.phoneNumber);
  const [verifiedPhoneNumber, setVerifiedPhoneNumber] = useState(verification.phoneVerified ? verification.phoneNumber : "");
  const [codeSentTo, setCodeSentTo] = useState("");
  const [verificationCode, setVerificationCode] = useState("");

  const phoneMatchesVerified = Boolean(verifiedPhoneNumber && phoneNumber === verifiedPhoneNumber);
  const phoneCodeWasSent = Boolean(codeSentTo && codeSentTo === phoneNumber);

  return (
    <div className="mt-8 space-y-10">
      <form
        className="space-y-5 border-t border-border pt-6"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            try {
              await updateProfileAction({
                displayName: name,
                homeCity,
                image,
                favoriteTeamIds,
                favoriteLeagueIds,
              });
              toast.success("Profile saved");
              router.refresh();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Profile changes could not be saved.");
            }
          });
        }}
      >
        <h2 className="font-display text-2xl">Profile</h2>
        <div className="space-y-1.5"><Label htmlFor="settings-name">Display name</Label><Input id="settings-name" value={name} onChange={(event) => setName(event.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="settings-email">Email</Label><Input id="settings-email" value={profile.email} disabled /><p className="text-xs text-muted-foreground">Email changes require verification through account security.</p></div>
        <div className="space-y-1.5"><Label htmlFor="settings-city">Home city</Label><Input id="settings-city" value={homeCity} onChange={(event) => setHomeCity(event.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="settings-image">Profile photo URL</Label><Input id="settings-image" type="url" value={image} onChange={(event) => setImage(event.target.value)} /><p className="text-xs text-muted-foreground">Use an HTTPS image URL. Private ticket evidence can never be used as a profile image.</p></div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Favorite leagues</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {leagues.map((league) => <label key={league.id} className="flex items-center justify-between border border-border px-3 py-2 text-sm">{league.name}<Switch checked={favoriteLeagueIds.includes(league.id)} onCheckedChange={(checked) => setFavoriteLeagueIds((current) => checked ? [...new Set([...current, league.id])] : current.filter((id) => id !== league.id))} /></label>)}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Favorite teams</legend>
          <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
            {teams.map((team) => <label key={team.id} className="flex items-center justify-between border border-border px-3 py-2 text-sm">{team.name}<Switch checked={favoriteTeamIds.includes(team.id)} onCheckedChange={(checked) => setFavoriteTeamIds((current) => checked ? [...new Set([...current, team.id])] : current.filter((id) => id !== team.id))} /></label>)}
          </div>
        </fieldset>
        <Button type="submit" disabled={pending}>Save profile</Button>
      </form>

      <section className="border-t border-border pt-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
          <div>
            <h2 className="font-display text-2xl">Account verification</h2>
            <p className="mt-1 max-w-[65ch] text-sm leading-6 text-muted-foreground">Verify contact methods you control. A verified contact badge does not verify ticket ownership or guarantee another user.</p>
          </div>
        </div>

        <div className="mt-6 grid gap-px overflow-hidden border border-border bg-border md:grid-cols-2">
          <div className="bg-background p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-primary" aria-hidden /><h3 className="text-sm font-semibold">Email address</h3></div>
              <VerificationStatus verified={verification.emailVerified} />
            </div>
            <p className="mt-4 break-all text-sm">{profile.email}</p>
            <p className="mt-2 min-h-10 text-xs leading-5 text-muted-foreground">
              {verification.emailVerified
                ? "Verified through a single-use link."
                : verification.emailConfigured
                  ? emailSent ? "Check your inbox and follow the verification link." : "Send a single-use verification link to this address."
                  : "Email delivery is not configured. Add the Resend variables shown below."}
            </p>
            {!verification.emailVerified && (
              <Button
                className="mt-4"
                variant="outline"
                size="sm"
                disabled={pending || !verification.emailConfigured}
                onClick={() => startTransition(async () => {
                  const { error } = await authClient.sendVerificationEmail({ email: profile.email, callbackURL: "/settings" });
                  if (error) {
                    toast.error(error.message || "The verification email could not be sent.");
                    return;
                  }
                  setEmailSent(true);
                  toast.success("Verification email sent");
                })}
              >{emailSent ? "Send again" : "Verify email"}</Button>
            )}
          </div>

          <div className="bg-background p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-primary" aria-hidden /><h3 className="text-sm font-semibold">Mobile number</h3></div>
              <VerificationStatus verified={phoneMatchesVerified} />
            </div>
            {phoneMatchesVerified && <p className="mt-3 text-xs text-muted-foreground">Stored as {maskPhoneNumber(verifiedPhoneNumber)}</p>}
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="verification-phone">Phone number</Label>
              <Input
                id="verification-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+1 312 555 0198"
                value={phoneNumber}
                onChange={(event) => {
                  setPhoneNumber(event.target.value);
                  if (event.target.value !== codeSentTo) setVerificationCode("");
                }}
              />
              <p className="text-xs leading-5 text-muted-foreground">US numbers may omit +1. Other numbers must include their country code.</p>
            </div>

            {phoneCodeWasSent && (
              <div className="mt-4 space-y-1.5">
                <Label htmlFor="verification-code">Verification code</Label>
                <Input
                  id="verification-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={10}
                  placeholder="6-digit code"
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value.replace(/[^0-9]/g, ""))}
                />
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pending || !verification.phoneConfigured || !phoneNumber.trim() || phoneMatchesVerified}
                onClick={() => startTransition(async () => {
                  try {
                    const response = await fetch("/api/me/phone-verification", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ phoneNumber }),
                    });
                    const payload = await response.json() as { error?: string; phoneNumber?: string };
                    if (!response.ok) throw new Error(payload.error || "The verification code could not be sent.");
                    const normalized = payload.phoneNumber || phoneNumber;
                    setPhoneNumber(normalized);
                    setCodeSentTo(normalized);
                    setVerificationCode("");
                    toast.success("Verification code sent");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "The verification code could not be sent.");
                  }
                })}
              >{phoneCodeWasSent ? "Send again" : verifiedPhoneNumber ? "Verify new number" : "Send code"}</Button>

              {phoneCodeWasSent && (
                <Button
                  size="sm"
                  disabled={pending || verificationCode.length < 4}
                  onClick={() => startTransition(async () => {
                    try {
                      const response = await fetch("/api/me/phone-verification", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ phoneNumber, code: verificationCode }),
                      });
                      const payload = await response.json() as { error?: string; phoneNumber?: string };
                      if (!response.ok) throw new Error(payload.error || "The phone number could not be verified.");
                      const normalized = payload.phoneNumber || phoneNumber;
                      setPhoneNumber(normalized);
                      setVerifiedPhoneNumber(normalized);
                      setCodeSentTo("");
                      setVerificationCode("");
                      toast.success("Phone number verified");
                      router.refresh();
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "The phone number could not be verified.");
                    }
                  })}
                >Confirm code</Button>
              )}
            </div>
            {!verification.phoneConfigured && <p className="mt-3 text-xs text-muted-foreground">SMS delivery is disabled until Twilio Verify credentials are configured.</p>}
          </div>
        </div>
      </section>

      <section className="border-t border-border pt-6">
        <h2 className="font-display text-2xl">Seller payouts</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {payoutConfigured ? "Your Stripe seller account exists. Reopen onboarding to complete or update required payout details." : "Connect a Stripe Express account before buyers can authorize payment for your tickets."}
        </p>
        <Button
          className="mt-5"
          variant="outline"
          disabled={pending}
          onClick={() => startTransition(async () => {
            try {
              const response = await fetch("/api/stripe/connect", { method: "POST" });
              const payload = await response.json();
              if (!response.ok) throw new Error(payload.error ?? "Payout setup is unavailable.");
              window.location.assign(payload.url);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Payout setup is unavailable.");
            }
          })}
        >{payoutConfigured ? "Manage payout setup" : "Set up seller payouts"}</Button>
      </section>

      <section className="border-t border-border pt-6">
        <h2 className="font-display text-2xl">Email notifications</h2>
        <div className="mt-5 space-y-3">
          {([
            ["emailMessages", "New messages"],
            ["emailOffers", "Offers and counteroffers"],
            ["emailTransfers", "Transfer deadlines and status"],
            ["emailPayments", "Payments, refunds, and payouts"],
            ["emailDisputes", "Dispute updates"],
            ["emailMarketing", "Product updates"],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-4 border-b border-border pb-3 text-sm">
              {label}<Switch checked={preferences[key]} onCheckedChange={(checked) => setPreferences((current) => ({ ...current, [key]: checked }))} />
            </label>
          ))}
        </div>
        <Button
          className="mt-5"
          variant="outline"
          disabled={pending}
          onClick={() => startTransition(async () => {
            try { await updateNotificationPreferencesAction(preferences); toast.success("Notification preferences saved"); }
            catch (error) { toast.error(error instanceof Error ? error.message : "Preferences could not be saved."); }
          })}
        >Save preferences</Button>
      </section>

      <section className="border-t border-danger/40 pt-6">
        <h2 className="font-display text-2xl">Delete account</h2>
        <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">Account deletion is permanent. Open transactions and disputes must be resolved first. You will receive a confirmation email before deletion.</p>
        <Button
          className="mt-5"
          variant="destructive"
          disabled={pending}
          onClick={() => startTransition(async () => {
            const openCountResponse = await fetch("/api/me/deletion-readiness", { cache: "no-store" });
            const readiness = await openCountResponse.json() as { ready: boolean; reason?: string };
              if (!readiness.ready) {
                toast.error(readiness.reason || "This account cannot be deleted yet.");
                return;
              }
            try {
              await deleteAccountAction();
              router.push("/");
              router.refresh();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Account deletion could not be completed.");
            }
          })}
        >Delete account</Button>
      </section>
    </div>
  );
}

function VerificationStatus({ verified }: { verified: boolean }) {
  return (
    <span className={verified ? "inline-flex items-center gap-1.5 text-xs font-semibold text-primary" : "text-xs text-muted-foreground"}>
      {verified && <Check className="h-3.5 w-3.5" aria-hidden />}
      {verified ? "Verified" : "Not verified"}
    </span>
  );
}
