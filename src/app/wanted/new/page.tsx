"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { games as developmentGames, getTeam } from "@/lib/catalog";
import { createWantedAction } from "@/lib/actions";
import type { Game, Listing, SeatLevel } from "@/lib/types";

const SEAT_LEVELS: SeatLevel[] = ["Field / Courtside", "100 Level", "200 Level", "300 Level", "Club", "Suite"];

export default function PostWantedPage() {
  const router = useRouter();
  const [games, setGames] = useState<Game[]>(developmentGames);
  const [gameId, setGameId] = useState(developmentGames[0]?.id ?? "");
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [quantityMin, setQuantityMin] = useState("2");
  const [quantityMax, setQuantityMax] = useState("2");
  const [sections, setSections] = useState<SeatLevel[]>(["100 Level", "200 Level"]);
  const [maxBudget, setMaxBudget] = useState("300");
  const [offering, setOffering] = useState("");
  const [ownedListings, setOwnedListings] = useState<Listing[]>([]);
  const [offeringGameIds, setOfferingGameIds] = useState<string[]>([]);
  const [flexible, setFlexible] = useState(true);

  function toggleSection(level: SeatLevel) {
    setSections((prev) => (prev.includes(level) ? prev.filter((s) => s !== level) : [...prev, level]));
  }

  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch("/api/events", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : [])
      .then((data: Game[]) => { setGames(data); setGameId(data[0]?.id ?? ""); setCatalogLoaded(true); })
      .catch(() => setCatalogLoaded(true));
    fetch("/api/me/listings", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : [])
      .then((data: Listing[]) => setOwnedListings(data.filter((listing) => listing.status === "active")))
      .catch(() => {});
  }, []);

  if (catalogLoaded && games.length === 0) {
    return <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6"><h1 className="font-display text-3xl leading-[1.08] sm:text-4xl">Post what you want</h1><div className="mt-8 border border-border bg-card p-6"><p className="font-medium">No upcoming events are available yet</p><p className="mt-2 text-sm text-muted-foreground">Wanted posts must reference a real event from the current catalog.</p></div></div>;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      await createWantedAction({
        desiredGameId: gameId,
        quantityMin: Number(quantityMin) || 1,
        quantityMax: Number(quantityMax) || 1,
        preferredSections: sections,
        maxBudget: Number(maxBudget) || 0,
        offeringDescription: offering.trim() || "Open to trades or cash.",
        offeringGameIds,
        flexibleOnDate: flexible,
      });
      toast("Your request is live in Tickets Wanted");
      router.push("/wanted");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not post that request.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="font-display text-3xl leading-[1.08] sm:text-4xl">Post what you want</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tell fans exactly what you&rsquo;re after. We&rsquo;ll surface your request to anyone whose listing
        matches.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <div className="space-y-1.5">
          <Label htmlFor="game">Desired game</Label>
          <Select value={gameId} onValueChange={setGameId}>
            <SelectTrigger id="game" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {games.map((game) => {
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

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="quantity-min">Minimum tickets</Label>
            <Input id="quantity-min" type="number" min={1} max={10} value={quantityMin} onChange={(e) => setQuantityMin(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quantity-max">Maximum tickets</Label>
            <Input id="quantity-max" type="number" min={1} max={10} value={quantityMax} onChange={(e) => setQuantityMax(e.target.value)} className="h-11" />
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Preferred sections</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {SEAT_LEVELS.map((level) => (
              <label key={level} className="flex items-center gap-2 text-sm">
                <Checkbox checked={sections.includes(level)} onCheckedChange={() => toggleSection(level)} />
                {level}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="max-budget">Maximum budget (total)</Label>
          <Input
            id="max-budget"
            type="number"
            min={0}
            value={maxBudget}
            onChange={(e) => setMaxBudget(e.target.value)}
            className="h-11"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="offering">What you&rsquo;re offering in return</Label>
          <Textarea
            id="offering"
            rows={3}
            placeholder="e.g. Two Bears vs. Lions tickets, section 136, or cash up to your budget"
            value={offering}
            onChange={(e) => setOffering(e.target.value)}
          />
        </div>

        {ownedListings.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Your listed tickets available for this swap</legend>
            <p className="text-xs text-muted-foreground">Selecting structured inventory enables exact two-way matching.</p>
            <div className="space-y-2">
              {ownedListings.map((listing) => {
                const checked = offeringGameIds.includes(listing.gameId);
                return (
                  <label key={listing.id} className="flex items-center gap-3 border border-border p-3 text-sm">
                    <Checkbox checked={checked} onCheckedChange={() => setOfferingGameIds((current) => checked ? current.filter((id) => id !== listing.gameId) : [...new Set([...current, listing.gameId])])} />
                    <span>{listing.game?.awayTeam?.name ?? "Away team"} at {listing.game?.homeTeam?.name ?? "Home team"}, Section {listing.section}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <label className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm">
          Flexible on dates
          <Switch checked={flexible} onCheckedChange={setFlexible} />
        </label>

        <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
          {pending ? "Posting…" : "Post request"}
        </Button>
      </form>
    </div>
  );
}
