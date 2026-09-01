// Catalog reference data. No real team logos or league marks are used —
// crests are generated from initials and color pairs below.
import type { Team } from "@/lib/types";

export const teams: Team[] = [
  { id: "chi-bears", name: "Bears", city: "Chicago", initials: "CHI", league: "NFL", primaryColor: "#0b2b4a", secondaryColor: "#d68a2d" },
  { id: "det-lions", name: "Lions", city: "Detroit", initials: "DET", league: "NFL", primaryColor: "#1c3a6b", secondaryColor: "#8a8d8f" },
  { id: "gb-packers", name: "Packers", city: "Green Bay", initials: "GB", league: "NFL", primaryColor: "#1c3a2b", secondaryColor: "#d6b23d" },
  { id: "min-vikings", name: "Vikings", city: "Minnesota", initials: "MIN", league: "NFL", primaryColor: "#3a2b6b", secondaryColor: "#d6b23d" },

  { id: "chi-bulls", name: "Bulls", city: "Chicago", initials: "CHI", league: "NBA", primaryColor: "#7a1e2b", secondaryColor: "#12182a" },
  { id: "det-pistons", name: "Pistons", city: "Detroit", initials: "DET", league: "NBA", primaryColor: "#1c3a6b", secondaryColor: "#a3392c" },
  { id: "cha-hornets", name: "Hornets", city: "Charlotte", initials: "CHA", league: "NBA", primaryColor: "#173a52", secondaryColor: "#4fae8a" },
  { id: "lal-lakers", name: "Lakers", city: "Los Angeles", initials: "LAL", league: "NBA", primaryColor: "#4a2b6b", secondaryColor: "#d6b23d" },

  { id: "chi-sky", name: "Sky", city: "Chicago", initials: "CHI", league: "WNBA", primaryColor: "#12182a", secondaryColor: "#d68a2d" },
  { id: "ind-fever", name: "Fever", city: "Indiana", initials: "IND", league: "WNBA", primaryColor: "#7a1e2b", secondaryColor: "#e8e2d0" },

  { id: "chc-cubs", name: "Cubs", city: "Chicago", initials: "CHC", league: "MLB", primaryColor: "#0b2b4a", secondaryColor: "#a3392c" },
  { id: "stl-cardinals", name: "Cardinals", city: "St. Louis", initials: "STL", league: "MLB", primaryColor: "#7a1e2b", secondaryColor: "#12182a" },

  { id: "chi-blackhawks", name: "Blackhawks", city: "Chicago", initials: "CHI", league: "NHL", primaryColor: "#7a1e2b", secondaryColor: "#12182a" },
  { id: "det-redwings", name: "Red Wings", city: "Detroit", initials: "DET", league: "NHL", primaryColor: "#7a1e2b", secondaryColor: "#e8e2d0" },

  { id: "chi-fire", name: "Fire FC", city: "Chicago", initials: "CHI", league: "MLS", primaryColor: "#0b2b4a", secondaryColor: "#d68a2d" },
  { id: "clb-crew", name: "Crew", city: "Columbus", initials: "CLB", league: "MLS", primaryColor: "#173a2f", secondaryColor: "#d6b23d" },

  { id: "ill-illini", name: "Fighting Illini", city: "Illinois", initials: "ILL", league: "NCAAF", primaryColor: "#3a1c2b", secondaryColor: "#e8e2d0" },
  { id: "nw-wildcats", name: "Wildcats", city: "Northwestern", initials: "NW", league: "NCAAF", primaryColor: "#3a2b52", secondaryColor: "#e8e2d0" },
];

export function getTeam(id: string): Team {
  const team = teams.find((t) => t.id === id);
  if (!team) throw new Error(`Unknown team id: ${id}`);
  return team;
}
