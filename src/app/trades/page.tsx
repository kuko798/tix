"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TradeSummaryCard } from "@/components/marketplace/trade-summary-card";
import { EmptyState } from "@/components/marketplace/empty-state";
import { AppFrame, PageIntro } from "@/components/brand/page-intro";
import { useSession } from "@/lib/auth-client";
import type { Trade, TradeStage } from "@/lib/types";

const GROUPS: Record<string, TradeStage[]> = {
  active: ["offer_accepted", "deposits_authorized", "transfer_initiated_a", "transfer_initiated_b", "tickets_accepted", "cash_released"],
  completed: ["completed"],
  disputed: ["disputed"],
  closed: ["cancelled", "expired"],
};

export default function TradesPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState("active");
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    fetch("/api/trades", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Trade[]) => setTrades(data))
      .catch(() => {});
  }, []);

  const viewerId = session?.user?.id ?? "";
  const filtered = trades.filter((t) => GROUPS[tab].includes(t.stage));

  return (
    <AppFrame width="medium">
      <PageIntro title="Trades">
        Every trade you have accepted, completed, or that needs your attention.
      </PageIntro>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="active">Active ({trades.filter((t) => GROUPS.active.includes(t.stage)).length})</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="disputed">Disputed</TabsTrigger>
          <TabsTrigger value="closed">Cancelled / expired</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-6 space-y-3">
        {filtered.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="Nothing here yet"
            description="Trades in this category will show up here as soon as they happen."
          />
        ) : (
          filtered.map((trade) => <TradeSummaryCard key={trade.id} trade={trade} viewerId={viewerId} />)
        )}
      </div>
    </AppFrame>
  );
}
