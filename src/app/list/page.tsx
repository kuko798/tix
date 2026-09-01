"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  ShieldAlert,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertBanner } from "@/components/marketplace/alert-banner";
import { MatchupHeader } from "@/components/marketplace/matchup-header";
import { PriceBreakdown } from "@/components/marketplace/price-breakdown";
import { games as developmentGames, getTeam } from "@/lib/catalog";
import { createListingAction } from "@/lib/actions";
import type { Circle } from "@/lib/types";
import type { Game, ListingType, ListingVisibility, SeatLevel, Sport, TicketIssuer } from "@/lib/types";
import { cn } from "@/lib/utils";

const STEPS = [
  "Game",
  "Ticket info",
  "Seats & quantity",
  "Extras",
  "Sale or trade",
  "What you'll accept",
  "Ownership evidence",
  "Visibility",
  "Review",
] as const;

const SPORTS: Sport[] = ["Football", "Basketball", "Baseball", "Hockey", "Soccer", "College Sports"];
const ISSUERS: TicketIssuer[] = ["Ticketmaster", "AXS", "Team Box Office", "Paciolan", "SeatGeek Enterprise"];
const SEAT_LEVELS: SeatLevel[] = ["Field / Courtside", "100 Level", "200 Level", "300 Level", "Club", "Suite"];
const COMMON_BENEFITS = ["Club lounge access", "Merch credit", "In-seat food and drink credit", "Early entry"];

interface ListingForm {
  sport: Sport;
  gameId: string;
  issuer: TicketIssuer;
  section: string;
  row: string;
  quantity: number;
  seatLevel: SeatLevel;
  parkingIncluded: boolean;
  benefits: string[];
  listingType: ListingType;
  faceValuePerTicket: string;
  askingCashAdjustment: string;
  acceptsCash: boolean;
  acceptsGamesDescription: string;
  flexibleOnDate: boolean;
  flexibleOnSection: boolean;
  evidenceFileName: string | null;
  visibility: ListingVisibility;
  circleId: string;
}

const initialForm: ListingForm = {
  sport: "Football",
  gameId: developmentGames[0]?.id ?? "",
  issuer: "Ticketmaster",
  section: "",
  row: "",
  quantity: 2,
  seatLevel: "100 Level",
  parkingIncluded: false,
  benefits: [],
  listingType: "trade_or_sale",
  faceValuePerTicket: "120",
  askingCashAdjustment: "",
  acceptsCash: true,
  acceptsGamesDescription: "",
  flexibleOnDate: true,
  flexibleOnSection: true,
  evidenceFileName: null,
  visibility: "public",
  circleId: "",
};

export default function CreateListingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ListingForm>(initialForm);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [games, setGames] = useState<Game[]>(developmentGames);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/circles", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Circle[]) => setCircles(data))
      .catch(() => {});
    fetch("/api/events", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Game[]) => {
        setGames(data);
        if (data[0]) setForm((current) => ({ ...current, gameId: data.some((game) => game.id === current.gameId) ? current.gameId : data[0].id, sport: data[0].sport }));
        setCatalogLoaded(true);
      })
      .catch(() => setCatalogLoaded(true));
  }, []);

  const gamesInSport = useMemo(() => games.filter((g) => g.sport === form.sport), [games, form.sport]);
  const selectedGame = games.find((game) => game.id === form.gameId);
  const isLastStep = step === STEPS.length - 1;

  function update<K extends keyof ListingForm>(key: K, value: ListingForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function canAdvance(): boolean {
    switch (step) {
      case 0:
        return Boolean(form.gameId);
      case 2:
        return form.section.trim().length > 0 && form.row.trim().length > 0 && form.quantity > 0;
      case 6:
        return Boolean(form.evidenceFileName);
      default:
        return true;
    }
  }

  function goNext() {
    if (isLastStep) {
      if (publishing) return;
      setPublishing(true);
      createListingAction({
        gameId: form.gameId,
        issuer: form.issuer,
        section: form.section,
        row: form.row,
        quantity: form.quantity,
        seatLevel: form.seatLevel,
        parkingIncluded: form.parkingIncluded,
        benefits: form.benefits,
        listingType: form.listingType,
        faceValuePerTicket: Number(form.faceValuePerTicket) || 0,
        askingCashAdjustment: form.askingCashAdjustment ? Number(form.askingCashAdjustment) : undefined,
        acceptsCash: form.acceptsCash,
        acceptsGamesDescription: form.acceptsGamesDescription || undefined,
        flexibleOnDate: form.flexibleOnDate,
        flexibleOnSection: form.flexibleOnSection,
        evidenceFileName: form.evidenceFileName,
        visibility: form.visibility,
        circleId: form.circleId || undefined,
      })
        .then(async (listing) => {
          if (evidenceFile) {
            const digest = await crypto.subtle.digest("SHA-256", await evidenceFile.arrayBuffer());
            const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
            const request = await fetch("/api/evidence", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                listingId: listing.id,
                originalName: evidenceFile.name,
                mimeType: evidenceFile.type,
                byteSize: evidenceFile.size,
                sha256,
              }),
            });
            const upload = await request.json();
            if (!request.ok) throw new Error(upload.error ?? "Could not prepare the private evidence upload.");
            const put = await fetch(upload.uploadUrl, {
              method: "PUT",
              headers: { "Content-Type": evidenceFile.type },
              body: evidenceFile,
            });
            if (!put.ok) throw new Error("The private evidence upload failed.");
            const confirmation = await fetch("/api/evidence", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ evidenceId: upload.evidenceId }),
            });
            if (!confirmation.ok) throw new Error("The evidence upload could not be confirmed.");
          }
          toast(
            "Listing published to " +
              (form.visibility === "public"
                ? "the public marketplace"
                : form.visibility === "circle"
                  ? "your fan circle"
                  : "your private invite list")
          );
          router.push(`/listing/${listing.id}`);
          router.refresh();
        })
        .catch((error) => {
          toast.error(error instanceof Error ? error.message : "Could not publish that listing.");
        })
        .finally(() => setPublishing(false));
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function toggleBenefit(benefit: string) {
    setForm((prev) => ({
      ...prev,
      benefits: prev.benefits.includes(benefit)
        ? prev.benefits.filter((b) => b !== benefit)
        : [...prev.benefits, benefit],
    }));
  }

  if (catalogLoaded && (!selectedGame || games.length === 0)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <h1 className="font-display text-3xl leading-[1.08] sm:text-4xl">List tickets</h1>
        <div className="mt-8 border border-border bg-card p-6">
          <p className="font-medium">No upcoming events are available yet</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">GameSwap only accepts listings tied to a real event in the catalog. An administrator can import the current sports schedule or create an event manually.</p>
        </div>
      </div>
    );
  }

  if (!selectedGame) return <div className="px-6 py-16 text-sm text-muted-foreground">Loading the event catalog...</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="font-display text-3xl leading-[1.08] sm:text-4xl">List your tickets</h1>

      {/* Stepper */}
      <ol className="mt-6 flex gap-1.5 overflow-x-auto pb-2" aria-label="Listing steps">
        {STEPS.map((label, index) => (
          <li key={label} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => index < step && setStep(index)}
              disabled={index > step}
              aria-current={index === step ? "step" : undefined}
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                index < step && "bg-success text-success-foreground",
                index === step && "bg-primary text-primary-foreground",
                index > step && "bg-muted text-muted-foreground"
              )}
            >
              {index < step ? <Check className="h-3.5 w-3.5" aria-hidden /> : index + 1}
            </button>
          </li>
        ))}
      </ol>
      <p className="mb-8 text-sm font-medium text-muted-foreground">
        Step {step + 1} of {STEPS.length}: {STEPS[step]}
      </p>

      <div className="space-y-6">
        {step === 0 && (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label>Sport</Label>
              <RadioGroup
                value={form.sport}
                onValueChange={(v) => {
                  update("sport", v as Sport);
                  const first = games.find((g) => g.sport === v);
                  if (first) update("gameId", first.id);
                }}
                className="grid grid-cols-2 gap-2 sm:grid-cols-3"
              >
                {SPORTS.map((sport) => (
                  <label
                    key={sport}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm",
                      form.sport === sport && "border-primary bg-primary/5"
                    )}
                  >
                    <RadioGroupItem value={sport} />
                    {sport}
                  </label>
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="game-select">Game</Label>
              <Select value={form.gameId} onValueChange={(v) => update("gameId", v)}>
                <SelectTrigger id="game-select" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {gamesInSport.map((game) => {
                    const home = game.homeTeam ?? getTeam(game.homeTeamId);
                    const away = game.awayTeam ?? getTeam(game.awayTeamId);
                    return (
                      <SelectItem key={game.id} value={game.id}>
                        {away.name} at {home.name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <MatchupHeader game={selectedGame} size="sm" />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="issuer">Ticket issuer</Label>
              <Select value={form.issuer} onValueChange={(v) => update("issuer", v as TicketIssuer)}>
                <SelectTrigger id="issuer" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ISSUERS.map((issuer) => (
                    <SelectItem key={issuer} value={issuer}>
                      {issuer}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                This is where the buyer will receive their official transfer.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="face-value">Face value per ticket</Label>
              <Input
                id="face-value"
                type="number"
                min={0}
                className="h-11"
                value={form.faceValuePerTicket}
                onChange={(e) => update("faceValuePerTicket", e.target.value)}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="section">Section</Label>
              <Input id="section" className="h-11" value={form.section} onChange={(e) => update("section", e.target.value)} placeholder="e.g. 136" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="row">Row</Label>
              <Input id="row" className="h-11" value={form.row} onChange={(e) => update("row", e.target.value)} placeholder="e.g. 18" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                max={10}
                className="h-11"
                value={form.quantity}
                onChange={(e) => update("quantity", Number(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seat-level">Seat level</Label>
              <Select value={form.seatLevel} onValueChange={(v) => update("seatLevel", v as SeatLevel)}>
                <SelectTrigger id="seat-level" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEAT_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <label className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm">
              Parking pass included
              <Switch checked={form.parkingIncluded} onCheckedChange={(v) => update("parkingIncluded", v)} />
            </label>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Game-day benefits</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {COMMON_BENEFITS.map((benefit) => (
                  <label key={benefit} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={form.benefits.includes(benefit)} onCheckedChange={() => toggleBenefit(benefit)} />
                    {benefit}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {step === 4 && (
          <RadioGroup value={form.listingType} onValueChange={(v) => update("listingType", v as ListingType)} className="space-y-2">
            {[
              { value: "trade", label: "Trade only", desc: "You only want other tickets in return." },
              { value: "sale", label: "For sale", desc: "You only want cash." },
              { value: "trade_or_sale", label: "Trade or sale", desc: "Open to either, whichever comes first." },
            ].map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4",
                  form.listingType === option.value && "border-primary bg-primary/5"
                )}
              >
                <RadioGroupItem value={option.value} className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium">{option.label}</p>
                  <p className="text-xs text-muted-foreground">{option.desc}</p>
                </div>
              </label>
            ))}
          </RadioGroup>
        )}

        {step === 5 && (
          <div className="space-y-5">
            {form.listingType !== "sale" && (
              <div className="space-y-1.5">
                <Label htmlFor="accepts-desc">What games or seats will you accept?</Label>
                <Textarea
                  id="accepts-desc"
                  rows={3}
                  value={form.acceptsGamesDescription}
                  onChange={(e) => update("acceptsGamesDescription", e.target.value)}
                  placeholder="e.g. Any Bears home game, 100 or 200 level"
                />
              </div>
            )}
            {form.listingType !== "trade" && (
              <label className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm">
                Willing to consider cash offers
                <Switch checked={form.acceptsCash} onCheckedChange={(v) => update("acceptsCash", v)} />
              </label>
            )}
            {form.listingType === "trade_or_sale" && (
              <div className="space-y-1.5">
                <Label htmlFor="cash-ask">Cash to add for a straight trade (optional)</Label>
                <Input
                  id="cash-ask"
                  type="number"
                  min={0}
                  className="h-11"
                  value={form.askingCashAdjustment}
                  onChange={(e) => update("askingCashAdjustment", e.target.value)}
                />
              </div>
            )}
            <div className="flex gap-4">
              <label className="flex flex-1 items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm">
                Flexible on date
                <Switch checked={form.flexibleOnDate} onCheckedChange={(v) => update("flexibleOnDate", v)} />
              </label>
              <label className="flex flex-1 items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm">
                Flexible on section
                <Switch checked={form.flexibleOnSection} onCheckedChange={(v) => update("flexibleOnSection", v)} />
              </label>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <AlertBanner variant="warning" title="Redact anything sensitive before uploading">
              Cover barcodes, QR codes, order numbers, and any payment information. GameSwap
              never displays active barcodes or QR codes anywhere on the site.
            </AlertBanner>
            {!form.evidenceFileName ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-10 text-center hover:border-foreground/30"
              >
                <Upload className="h-6 w-6 text-muted-foreground" aria-hidden />
                <span className="text-sm font-medium">Upload redacted proof of ownership</span>
                <span className="text-xs text-muted-foreground">PNG, JPG, or PDF, one file</span>
              </button>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
                <FileCheck2 className="h-5 w-5 shrink-0 text-success" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{form.evidenceFileName}</p>
                  <p className="text-xs text-muted-foreground">Ready for review, redacted</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { setEvidenceFile(null); update("evidenceFileName", null); }} aria-label="Remove file">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,application/pdf"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!["image/png", "image/jpeg", "application/pdf"].includes(file.type)) {
                  toast.error("Upload a JPG, PNG, or PDF file.");
                  return;
                }
                if (file.size > 10 * 1024 * 1024) {
                  toast.error("Evidence files must be smaller than 10 MB.");
                  return;
                }
                setEvidenceFile(file);
                update("evidenceFileName", file.name);
              }}
            />
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              A GameSwap reviewer checks this against your listing details before it moves to
              &ldquo;Evidence reviewed.&rdquo; This step doesn&rsquo;t verify anything with the ticket
              issuer directly.
            </p>
          </div>
        )}

        {step === 7 && (
          <RadioGroup value={form.visibility} onValueChange={(v) => update("visibility", v as ListingVisibility)} className="space-y-2">
            {[
              { value: "public", label: "Public marketplace", desc: "Anyone on GameSwap can see and offer on this listing." },
              { value: "circle", label: "Trusted fan circle", desc: "Only members of a circle you belong to can see it." },
              { value: "private", label: "Private invitation", desc: "Only people you share the link with can see it." },
            ].map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4",
                  form.visibility === option.value && "border-primary bg-primary/5"
                )}
              >
                <RadioGroupItem value={option.value} className="mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{option.label}</p>
                  <p className="text-xs text-muted-foreground">{option.desc}</p>
                </div>
              </label>
            ))}
            {form.visibility === "circle" && (
              <div className="ml-7 space-y-1.5 pt-1">
                <Label htmlFor="circle-select">Choose a circle</Label>
                <Select value={form.circleId} onValueChange={(v) => update("circleId", v)}>
                  <SelectTrigger id="circle-select" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {circles.map((circle) => (
                      <SelectItem key={circle.id} value={circle.id}>
                        {circle.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </RadioGroup>
        )}

        {step === 8 && (
          <div className="space-y-5">
            <div className="rounded-lg border border-border bg-card p-4">
              <MatchupHeader game={selectedGame} size="sm" />
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Seats</p>
                  <p className="font-medium">
                    Sec {form.section || "-"}, Row {form.row || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Quantity</p>
                  <p className="font-medium">{form.quantity}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className="font-medium">
                    {form.listingType === "trade" ? "Trade only" : form.listingType === "sale" ? "For sale" : "Trade or sale"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Visibility</p>
                  <p className="font-medium capitalize">{form.visibility}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Parking</p>
                  <p className="font-medium">{form.parkingIncluded ? "Included" : "Not included"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Evidence</p>
                  <p className="font-medium">{form.evidenceFileName ? "Uploaded" : "Missing"}</p>
                </div>
              </div>
            </div>
            <PriceBreakdown
              offeredValue={Number(form.faceValuePerTicket || 0) * form.quantity}
              receivedValue={0}
              cashAdjustment={Number(form.askingCashAdjustment || 0)}
              platformFee={0}
              refundableDeposit={0}
              className="rounded-lg border border-border bg-card p-4"
            />
            <AlertBanner variant="info" title="Official issuer transfer required">
              Publishing creates a real listing. Accepted offers use Stripe for protected payment,
              while tickets are sent and accepted through the issuer&apos;s own transfer workflow.
            </AlertBanner>
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
        <Button
          type="button"
          variant="outline"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="h-11 gap-1"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Back
        </Button>
        <Button type="button" onClick={goNext} disabled={!canAdvance() || publishing} className="h-11 gap-1">
          {isLastStep ? (publishing ? "Publishing…" : "Publish listing") : "Continue"}
          {!isLastStep && <ChevronRight className="h-4 w-4" aria-hidden />}
        </Button>
      </div>
    </div>
  );
}
