"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LayoutGrid, List, RotateCcw, Search, SlidersHorizontal, WifiOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ListingFiltersForm } from "@/components/marketplace/listing-filters-form";
import { TicketListingCard } from "@/components/marketplace/ticket-listing-card";
import { ListingGridSkeleton } from "@/components/marketplace/skeletons";
import { EmptyState } from "@/components/marketplace/empty-state";
import { AlertBanner } from "@/components/marketplace/alert-banner";
import { fetchListings, type ListingFilters } from "@/lib/services";
import type { Listing } from "@/lib/types";

function DiscoverContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("query") ?? "";

  const [filters, setFilters] = useState<ListingFilters>({ query: initialQuery, sort: "recent" });
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [results, setResults] = useState<Listing[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("list");

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    fetchListings(filters)
      .then((data) => {
        if (!cancelled) {
          setResults(data);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setFilters((prev) => (prev.query === searchInput ? prev : { ...prev, query: searchInput }));
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.leagues?.length) count += filters.leagues.length;
    if (filters.listingTypes?.length) count += filters.listingTypes.length;
    if (filters.seatLevels?.length) count += filters.seatLevels.length;
    if (filters.parkingOnly) count += 1;
    if (filters.accessibleOnly) count += 1;
    if (filters.transferReadyOnly) count += 1;
    return count;
  }, [filters]);

  function resetFilters() {
    setFilters({ query: filters.query, sort: filters.sort });
  }

  function retry() {
    setFilters({ ...filters });
  }

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
      <div className="mb-10 grid gap-5 border-b border-border pb-8 lg:grid-cols-[1fr_.7fr] lg:items-end lg:pb-10">
        <div><p className="section-label">01 / Live marketplace</p><h1 className="font-display mt-4 text-6xl uppercase leading-[0.86] sm:text-8xl lg:text-9xl">Find your game.</h1></div>
        <p className="max-w-[48ch] text-sm leading-7 text-muted-foreground lg:justify-self-end">
          Search real listings by team, opponent, city, venue, price, quantity, or listing type.
        </p>
      </div>

      <div className="relative mb-10">
        <Search className="pointer-events-none absolute left-0 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" aria-hidden />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search team, opponent, city, or venue"
          className="h-16 rounded-none border-x-0 border-t-0 bg-transparent pl-9 text-base shadow-none focus-visible:ring-0"
          aria-label="Search listings"
        />
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-28 border-t border-border pt-5">
            <ListingFiltersForm filters={filters} onChange={setFilters} onReset={resetFilters} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-center gap-2">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="lg:hidden">
                    <SlidersHorizontal className="h-4 w-4" aria-hidden />
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="ml-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                        {activeFilterCount}
                      </span>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-full max-w-sm overflow-y-auto p-5">
                  <SheetHeader className="px-0">
                    <SheetTitle>Filters</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4">
                    <ListingFiltersForm filters={filters} onChange={setFilters} onReset={resetFilters} />
                  </div>
                </SheetContent>
              </Sheet>
              <p className="text-sm text-muted-foreground">
                {loading ? "Searching..." : error ? "-" : `${results?.length ?? 0} listings`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Select value={filters.sort} onValueChange={(value) => setFilters({ ...filters, sort: value as ListingFilters["sort"] })}>
                <SelectTrigger className="h-9 w-44" aria-label="Sort listings">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Recently posted</SelectItem>
                  <SelectItem value="soonest">Soonest game</SelectItem>
                  <SelectItem value="price_low">Price: low to high</SelectItem>
                  <SelectItem value="price_high">Price: high to low</SelectItem>
                </SelectContent>
              </Select>
              <ToggleGroup
                type="single"
                value={view}
                onValueChange={(value) => value && setView(value as "grid" | "list")}
                className="hidden sm:flex"
              >
                <ToggleGroupItem value="grid" aria-label="Grid view" className="h-9 w-9">
                  <LayoutGrid className="h-4 w-4" aria-hidden />
                </ToggleGroupItem>
                <ToggleGroupItem value="list" aria-label="Compact list view" className="h-9 w-9">
                  <List className="h-4 w-4" aria-hidden />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {loading && <ListingGridSkeleton />}

          {!loading && error && (
            <AlertBanner
              variant="danger"
              title="We couldn't load listings"
              action={
                <Button variant="outline" size="sm" onClick={retry} className="shrink-0 gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  Retry
                </Button>
              }
            >
              {error}
            </AlertBanner>
          )}

          {!loading && !error && results && results.length === 0 && (
            <EmptyState
              icon={WifiOff}
              title="No listings match those filters"
              description="Try widening your price range or clearing a filter. You can also post what you're looking for and get matched automatically."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/wanted/new">Post what you want</Link>
                </Button>
              }
            />
          )}

          {!loading && !error && results && results.length > 0 && (
            <div
              className={
                view === "grid"
                  ? "grid grid-cols-1 gap-px overflow-hidden bg-border sm:grid-cols-2 xl:grid-cols-3"
                  : "flex flex-col border-t border-border"
              }
            >
              {results.map((listing) => (
                <TicketListingCard key={listing.id} listing={listing} compact={view === "list"} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-[1400px] px-4 py-8"><ListingGridSkeleton /></div>}>
      <DiscoverContent />
    </Suspense>
  );
}
