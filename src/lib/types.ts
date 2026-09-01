// Core domain types for GameSwap. UI components share this contract with
// the Prisma-backed services in src/lib/queries.ts and src/lib/services.ts.

export type League =
  | "NFL"
  | "NBA"
  | "WNBA"
  | "MLB"
  | "NHL"
  | "MLS"
  | "NCAAF"
  | "NCAAB";

export type Sport =
  | "Football"
  | "Basketball"
  | "Baseball"
  | "Hockey"
  | "Soccer"
  | "College Sports";

export interface Team {
  id: string;
  name: string;
  city: string;
  initials: string; // used for the neutral crest treatment, never a real logo
  league: League;
  primaryColor: string; // hex, drives the generated crest background
  secondaryColor: string;
}

export interface Venue {
  id: string;
  name: string;
  city: string;
  state: string;
}

export interface Game {
  id: string;
  sport: Sport;
  league: League;
  homeTeamId: string;
  awayTeamId: string;
  venueId: string;
  startTime: string; // ISO 8601
  seriesLabel?: string; // e.g. "Rivalry Week", "Conference Semifinal Game 3"
  homeTeam?: Team;
  awayTeam?: Team;
  venue?: Venue;
}

export type SeatLevel =
  | "Field / Courtside"
  | "100 Level"
  | "200 Level"
  | "300 Level"
  | "Club"
  | "Suite";

export type TransferReadiness =
  | "information_submitted"
  | "evidence_reviewed"
  | "transfer_initiated"
  | "transfer_accepted"
  | "issuer_verified";

export type TicketIssuer =
  | "Ticketmaster"
  | "AXS"
  | "Team Box Office"
  | "Paciolan"
  | "SeatGeek Enterprise";

export type ListingType = "trade" | "sale" | "trade_or_sale";

export type ListingVisibility = "public" | "circle" | "private";

export type ListingStatus = "active" | "pending" | "completed" | "expired";

export interface AcceptCriteria {
  acceptsCash: boolean;
  acceptsGamesDescription?: string; // free text, e.g. "Any Bears road game"
  preferredGameIds?: string[];
  flexibleOnDate: boolean;
  flexibleOnSection: boolean;
  notes?: string;
}

export interface Listing {
  id: string;
  gameId: string;
  sellerId: string;
  quantity: number;
  section: string;
  row: string;
  seatLevel: SeatLevel;
  issuer: TicketIssuer;
  transferReadiness: TransferReadiness;
  listingType: ListingType;
  faceValuePerTicket: number;
  estimatedValuePerTicket: number;
  askingCashAdjustment?: number; // positive = seller wants cash added to a trade
  parkingIncluded: boolean;
  benefits: string[]; // e.g. "Stadium Club access", "Merch credit"
  accept: AcceptCriteria;
  visibility: ListingVisibility;
  circleId?: string;
  status: ListingStatus;
  postedAt: string;
  viewCount: number;
  savedCount: number;
  accessible: boolean;
  seller: PublicUser;
  game?: Game;
}

export interface WantedRequest {
  id: string;
  requesterId: string;
  desiredGameId: string;
  quantityMin: number;
  quantityMax: number;
  preferredSections: SeatLevel[];
  maxBudget: number;
  offeringGameIds: string[];
  offeringDescription: string;
  flexibleOnDate: boolean;
  postedAt: string;
  expiresAt: string;
  requester: PublicUser;
  game?: Game;
}

export interface PublicUser {
  id: string;
  displayName: string;
  initials: string;
}

export type IdentityCheckStatus = "not_started" | "pending" | "verified";

export interface Review {
  id: string;
  authorName: string;
  rating: 1 | 2 | 3 | 4 | 5;
  text: string;
  context: string; // e.g. "Bears vs. Packers swap, Oct 2025"
}

export interface UserProfile {
  id: string;
  displayName: string;
  initials: string;
  accountCreatedAt: string;
  verifiedEmail: boolean;
  verifiedPhone: boolean;
  identityCheck: IdentityCheckStatus;
  completedSales: number;
  completedSwaps: number;
  responseRatePct: number;
  cancellationRatePct: number;
  favoriteTeamIds: string[];
  circleIds: string[];
  reviews: Review[];
}

export type TradeAssetType = "tickets" | "parking" | "cash";

export interface TradeAsset {
  id: string;
  type: TradeAssetType;
  gameId?: string;
  quantity?: number;
  section?: string;
  row?: string;
  label: string; // human label, e.g. "Lot A parking pass"
  valueEstimate: number;
}

export type TradeStage =
  | "offer_accepted"
  | "deposits_authorized"
  | "transfer_initiated_a"
  | "transfer_initiated_b"
  | "tickets_accepted"
  | "cash_released"
  | "completed"
  | "cancelled"
  | "expired"
  | "disputed";

export interface TradeStageEvent {
  stage: TradeStage;
  completedAt?: string;
  actorUserId?: string;
}

export interface Trade {
  id: string;
  listingId?: string;
  userAId: string;
  userBId: string;
  assetsFromA: TradeAsset[];
  assetsFromB: TradeAsset[];
  cashAdjustment: number; // positive = A pays B
  platformFee: number;
  refundableDeposit: number;
  stage: TradeStage;
  history: TradeStageEvent[];
  transferDeadline: string;
  waitingOnUserId?: string; // whose action is next
  createdAt: string;
  disputeId?: string;
  participantA: PublicUser;
  participantB: PublicUser;
}

export type DisputeReason =
  | "ticket_not_transferred"
  | "incorrect_seat_information"
  | "ticket_not_accepted"
  | "transfer_cancelled"
  | "event_rescheduled"
  | "entry_problem"
  | "payment_problem";

export type DisputeStatus = "submitted" | "under_review" | "resolved";

export interface Dispute {
  id: string;
  tradeId: string;
  reason: DisputeReason;
  status: DisputeStatus;
  statement: string;
  filedByUserId: string;
  filedAt: string;
}

export type CircleType =
  | "friends_family"
  | "season_ticket_holders"
  | "alumni"
  | "supporters"
  | "corporate";

export interface Circle {
  id: string;
  name: string;
  type: CircleType;
  description: string;
  memberCount: number;
  listingCount: number;
  requestCount: number;
  isAdmin: boolean;
  favoriteTeamId?: string;
}

export type MessageKind = "user" | "system";

export interface Message {
  id: string;
  senderId: string; // "system" for platform messages
  kind: MessageKind;
  body: string;
  sentAt: string;
}

export interface MessageThread {
  id: string;
  participantIds: string[];
  listingId?: string;
  tradeId?: string;
  messages: Message[];
  unread: boolean;
  otherUser: PublicUser;
}

export type NotificationType =
  | "direct_swap_match"
  | "wanted_match"
    | "new_offer"
    | "new_message"
    | "counteroffer"
    | "offer_accepted"
    | "offer_declined"
    | "payment_authorized"
    | "payment_failed"
    | "payment_refunded"
  | "transfer_required"
  | "ticket_accepted"
  | "deadline_approaching"
  | "event_rescheduled"
  | "trade_completed"
  | "dispute_update";

export type NotificationUrgency = "high" | "medium" | "low";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  urgency: NotificationUrgency;
  createdAt: string;
  read: boolean;
  relatedTradeId?: string;
    relatedListingId?: string;
    relatedTransactionId?: string;
    relatedOfferId?: string;
}

export type SeasonGameStatus =
  | "attending"
  | "might_attend"
  | "want_to_trade"
  | "want_to_sell"
  | "giving_away"
  | "undecided";

export interface SeasonGameEntry {
  gameId: string;
  status: SeasonGameStatus;
  ticketsHeld: number;
  listingId?: string;
}

export interface SeatGroup {
  id: string;
  quantity: number;
  section: string;
  rowLabel: string;
  relationship:
    | "confirmed_adjacent"
    | "same_row_gap"
    | "nearby_rows"
    | "same_section"
    | "proximity_unknown";
}

export interface GroupSeatMember {
  id: string;
  name: string;
  initials: string;
  hasPaid: boolean;
  isOrganizer: boolean;
}

export interface SeasonProgram {
  id: string;
  teamId: string;
  seasonLabel: string;
  entries: SeasonGameEntry[];
}
