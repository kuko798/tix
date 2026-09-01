import type {
  DisputeReason,
  NotificationType,
  SeasonGameStatus,
  TradeStage,
  TransferReadiness,
} from "@/lib/types";

export const TRANSFER_READINESS_META: Record<
  TransferReadiness,
  { label: string; description: string; order: number }
> = {
  information_submitted: {
    label: "Information submitted",
    description:
      "The seller entered ticket details themselves. GameSwap hasn't reviewed or confirmed anything yet.",
    order: 1,
  },
  evidence_reviewed: {
    label: "Evidence reviewed",
    description:
      "The seller uploaded redacted proof of ownership and a GameSwap reviewer checked it against the listing details.",
    order: 2,
  },
  transfer_initiated: {
    label: "Transfer initiated",
    description:
      "The seller has started the official transfer through the ticket issuer's own transfer tool.",
    order: 3,
  },
  transfer_accepted: {
    label: "Transfer accepted",
    description:
      "The buyer accepted the issuer transfer into their own account. Tickets are confirmed in the new owner's name.",
    order: 4,
  },
  issuer_verified: {
    label: "Issuer verified",
    description:
      "GameSwap confirmed the ticket directly with the issuer's live system through an authorized integration.",
    order: 5,
  },
};

export const TRADE_STAGE_META: Record<
  TradeStage,
  { label: string; shortLabel: string }
> = {
  offer_accepted: { label: "Offer accepted", shortLabel: "Accepted" },
  deposits_authorized: { label: "Deposits authorized", shortLabel: "Deposits" },
  transfer_initiated_a: { label: "First transfer initiated", shortLabel: "Transfer 1" },
  transfer_initiated_b: { label: "Second transfer initiated", shortLabel: "Transfer 2" },
  tickets_accepted: { label: "Tickets accepted", shortLabel: "Accepted" },
  cash_released: { label: "Cash adjustment released", shortLabel: "Cash released" },
  completed: { label: "Trade completed", shortLabel: "Completed" },
  cancelled: { label: "Cancelled", shortLabel: "Cancelled" },
  expired: { label: "Expired", shortLabel: "Expired" },
  disputed: { label: "Disputed", shortLabel: "Disputed" },
};

export const TRADE_STAGE_ORDER: TradeStage[] = [
  "offer_accepted",
  "deposits_authorized",
  "transfer_initiated_a",
  "transfer_initiated_b",
  "tickets_accepted",
  "cash_released",
  "completed",
];

export const SEASON_STATUS_META: Record<
  SeasonGameStatus,
  { label: string }
> = {
  attending: { label: "Attending" },
  might_attend: { label: "Might attend" },
  want_to_trade: { label: "Want to trade" },
  want_to_sell: { label: "Want to sell" },
  giving_away: { label: "Giving to someone" },
  undecided: { label: "Undecided" },
};

export const DISPUTE_REASON_META: Record<DisputeReason, { label: string }> = {
  ticket_not_transferred: { label: "Ticket not transferred" },
  incorrect_seat_information: { label: "Incorrect seat information" },
  ticket_not_accepted: { label: "Ticket not accepted" },
  transfer_cancelled: { label: "Transfer cancelled" },
  event_rescheduled: { label: "Event rescheduled" },
  entry_problem: { label: "Entry problem" },
  payment_problem: { label: "Payment problem" },
};

export const NOTIFICATION_META: Record<NotificationType, { label: string }> = {
  direct_swap_match: { label: "Direct swap match" },
  wanted_match: { label: "Someone wants your tickets" },
  new_offer: { label: "New offer" },
  new_message: { label: "New message" },
  counteroffer: { label: "Counteroffer" },
  offer_accepted: { label: "Offer accepted" },
  offer_declined: { label: "Offer declined" },
  payment_authorized: { label: "Payment authorized" },
  payment_failed: { label: "Payment failed" },
  payment_refunded: { label: "Payment refunded" },
  transfer_required: { label: "Transfer required" },
  ticket_accepted: { label: "Ticket accepted" },
  deadline_approaching: { label: "Deadline approaching" },
  event_rescheduled: { label: "Event rescheduled" },
  trade_completed: { label: "Trade completed" },
  dispute_update: { label: "Dispute update" },
};

export const PLATFORM_FEE_RATE = 0.045;

export interface NavItem {
  label: string;
  href: string;
}

export const PRIMARY_NAV: NavItem[] = [
  { label: "Discover", href: "/discover" },
  { label: "Tickets Wanted", href: "/wanted" },
  { label: "Trades", href: "/trades" },
  { label: "Fan Circles", href: "/circles" },
];
