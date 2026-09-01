"use client";

import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import type { ListingFilters } from "@/lib/services";
import type { League, ListingType, SeatLevel } from "@/lib/types";
import { formatCurrency } from "@/lib/format";

const LEAGUES: League[] = ["NFL", "NBA", "WNBA", "MLB", "NHL", "MLS", "NCAAF", "NCAAB"];
const SEAT_LEVELS: SeatLevel[] = ["Field / Courtside", "100 Level", "200 Level", "300 Level", "Club", "Suite"];
const LISTING_TYPES: { value: ListingType; label: string }[] = [
  { value: "trade", label: "Trade only" },
  { value: "sale", label: "For sale" },
  { value: "trade_or_sale", label: "Trade or sale" },
];

export function ListingFiltersForm({
  filters,
  onChange,
  onReset,
}: {
  filters: ListingFilters;
  onChange: (next: ListingFilters) => void;
  onReset: () => void;
}) {
  function toggleInArray<T>(list: T[] | undefined, value: T): T[] {
    const current = list ?? [];
    return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="font-medium">Filters</p>
        <Button variant="ghost" size="sm" onClick={onReset} className="h-auto px-2 py-1 text-xs">
          Reset all
        </Button>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">League</legend>
        <div className="grid grid-cols-2 gap-2">
          {LEAGUES.map((league) => (
            <label key={league} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={filters.leagues?.includes(league) ?? false}
                onCheckedChange={() => onChange({ ...filters, leagues: toggleInArray(filters.leagues, league) })}
              />
              {league}
            </label>
          ))}
        </div>
      </fieldset>

      <Separator />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Sale or trade</legend>
        <div className="space-y-2">
          {LISTING_TYPES.map((type) => (
            <label key={type.value} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={filters.listingTypes?.includes(type.value) ?? false}
                onCheckedChange={() =>
                  onChange({ ...filters, listingTypes: toggleInArray(filters.listingTypes, type.value) })
                }
              />
              {type.label}
            </label>
          ))}
        </div>
      </fieldset>

      <Separator />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Seat level</legend>
        <div className="grid grid-cols-2 gap-2">
          {SEAT_LEVELS.map((level) => (
            <label key={level} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={filters.seatLevels?.includes(level) ?? false}
                onCheckedChange={() =>
                  onChange({ ...filters, seatLevels: toggleInArray(filters.seatLevels, level) })
                }
              />
              {level}
            </label>
          ))}
        </div>
      </fieldset>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="min-quantity" className="text-sm font-medium">
            Minimum tickets
          </Label>
          <span className="text-sm text-muted-foreground">{filters.minQuantity ?? 1}+</span>
        </div>
        <Slider
          id="min-quantity"
          min={1}
          max={4}
          step={1}
          value={[filters.minQuantity ?? 1]}
          onValueChange={([value]) => onChange({ ...filters, minQuantity: value })}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="max-price" className="text-sm font-medium">
            Max price per ticket
          </Label>
          <span className="text-sm text-muted-foreground">
            {filters.maxPrice ? formatCurrency(filters.maxPrice) : "Any"}
          </span>
        </div>
        <Slider
          id="max-price"
          min={25}
          max={500}
          step={25}
          value={[filters.maxPrice ?? 500]}
          onValueChange={([value]) => onChange({ ...filters, maxPrice: value })}
        />
      </div>

      <Separator />

      <div className="space-y-3">
        <label className="flex items-center justify-between text-sm">
          Parking included
          <Switch
            checked={filters.parkingOnly ?? false}
            onCheckedChange={(checked) => onChange({ ...filters, parkingOnly: checked })}
          />
        </label>
        <label className="flex items-center justify-between text-sm">
          Accessible seating only
          <Switch
            checked={filters.accessibleOnly ?? false}
            onCheckedChange={(checked) => onChange({ ...filters, accessibleOnly: checked })}
          />
        </label>
        <label className="flex items-center justify-between text-sm">
          Transfer-ready only
          <Switch
            checked={filters.transferReadyOnly ?? false}
            onCheckedChange={(checked) => onChange({ ...filters, transferReadyOnly: checked })}
          />
        </label>
      </div>
    </div>
  );
}
