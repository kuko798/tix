"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createCircleAction } from "@/lib/actions";
import type { Game, Team } from "@/lib/types";

const TYPES = [
  { value: "friends_family", label: "Friends & family" },
  { value: "season_ticket_holders", label: "Season-ticket holders" },
  { value: "alumni", label: "Alumni" },
  { value: "supporters", label: "Supporters group" },
  { value: "corporate", label: "Corporate group" },
];

export default function CreateCirclePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState("friends_family");
  const [description, setDescription] = useState("");
  const [teamId, setTeamId] = useState("");
  const [pending, setPending] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);

  useEffect(() => {
    fetch("/api/events", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : [])
      .then((events: Game[]) => {
        const values = events.flatMap((event) => [event.homeTeam, event.awayTeam]).filter((team): team is Team => Boolean(team));
        setTeams([...new Map(values.map((team) => [team.id, team])).values()]);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="font-display text-3xl leading-[1.08] sm:text-4xl">Create a circle</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Circles stay private. Only members can see listings you share with the group.
      </p>
      <form
        className="mt-8 space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          try {
            const circle = await createCircleAction({
              name,
              type,
              description,
              favoriteTeamId: teamId || undefined,
            });
            toast("Circle created");
            router.push(`/circles/${circle.id}`);
            router.refresh();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not create that circle.");
          } finally {
            setPending(false);
          }
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="circle-name">Name</Label>
          <Input id="circle-name" required value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="circle-type">Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger id="circle-type" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="circle-team">Favorite team (optional)</Label>
          <Select value={teamId} onValueChange={setTeamId}>
            <SelectTrigger id="circle-team" className="h-11">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.city} {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="circle-desc">Description</Label>
          <Textarea id="circle-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
          {pending ? "Creating…" : "Create circle"}
        </Button>
      </form>
    </div>
  );
}
