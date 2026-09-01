import type { Circle, CircleMember, Listing, Review, SeasonProgram, User, WantedRequest, Trade, MessageThread, Message, Notification } from "@prisma/client";
import type {
  AppNotification,
  Circle as CircleView,
  Listing as ListingView,
  Message as MessageView,
  MessageThread as ThreadView,
  NotificationType,
  NotificationUrgency,
  PublicUser,
  Review as ReviewView,
  SeasonGameEntry,
  SeasonGameStatus,
  SeasonProgram as SeasonProgramView,
  SeatLevel,
  Trade as TradeView,
  TradeAsset,
  TradeStage,
  TradeStageEvent,
  UserProfile,
  WantedRequest as WantedView,
  Game,
  League,
  Sport,
} from "@/lib/types";

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function toPublicUser(user: Pick<User, "id" | "name" | "initials">): PublicUser {
  return {
    id: user.id,
    displayName: user.name,
    initials: user.initials || user.name.slice(0, 2).toUpperCase(),
  };
}

export function toUserProfile(
  user: User,
  reviews: Array<Review & { author: Pick<User, "name"> }> = [],
  circleIds: string[] = []
): UserProfile {
  return {
    id: user.id,
    displayName: user.name,
    initials: user.initials || user.name.slice(0, 2).toUpperCase(),
    accountCreatedAt: user.createdAt.toISOString(),
    verifiedEmail: user.emailVerified,
    verifiedPhone: user.verifiedPhone,
    identityCheck: user.identityCheck as UserProfile["identityCheck"],
    completedSales: user.completedSales,
    completedSwaps: user.completedSwaps,
    responseRatePct: user.responseRatePct,
    cancellationRatePct: user.cancellationRatePct,
    favoriteTeamIds: parseJson<string[]>(user.favoriteTeamIds, []),
    circleIds,
    reviews: reviews.map((review): ReviewView => ({
      id: review.id,
      authorName: review.author.name,
      rating: review.rating as 1 | 2 | 3 | 4 | 5,
      text: review.text,
      context: review.context,
    })),
  };
}

type ListingEvent = {
  id: string;
  name: string;
  startsAt: Date;
  league: { slug: string; sport: string };
  venue: { id: string; name: string; city: string; region: string };
  homeTeam: ({ id: string; name: string; city: string; abbreviation: string; primaryColor: string | null; secondaryColor: string | null; league: { slug: string } } | null);
  awayTeam: ({ id: string; name: string; city: string; abbreviation: string; primaryColor: string | null; secondaryColor: string | null; league: { slug: string } } | null);
};

function toGame(event: ListingEvent): Game | undefined {
  if (!event.homeTeam || !event.awayTeam) return undefined;
  const team = (value: NonNullable<ListingEvent["homeTeam"]>) => ({
    id: value.id,
    name: value.name,
    city: value.city,
    initials: value.abbreviation,
    league: value.league.slug.toUpperCase() as League,
    primaryColor: value.primaryColor ?? "#243428",
    secondaryColor: value.secondaryColor ?? "#eef0e6",
  });
  return {
    id: event.id,
    sport: event.league.sport as Sport,
    league: event.league.slug.toUpperCase() as League,
    homeTeamId: event.homeTeam.id,
    awayTeamId: event.awayTeam.id,
    venueId: event.venue.id,
    startTime: event.startsAt.toISOString(),
    seriesLabel: event.name,
    homeTeam: team(event.homeTeam),
    awayTeam: team(event.awayTeam),
    venue: { id: event.venue.id, name: event.venue.name, city: event.venue.city, state: event.venue.region },
  };
}

export function toListing(listing: Listing & { seller: Pick<User, "id" | "name" | "initials">; event?: ListingEvent | null }): ListingView {
  return {
    id: listing.id,
    gameId: listing.gameId,
    sellerId: listing.sellerId,
    quantity: listing.quantity,
    section: listing.section,
    row: listing.row,
    seatLevel: listing.seatLevel as ListingView["seatLevel"],
    issuer: listing.issuer as ListingView["issuer"],
    transferReadiness: listing.transferReadiness as ListingView["transferReadiness"],
    listingType: listing.listingType as ListingView["listingType"],
    faceValuePerTicket: listing.faceValuePerTicket,
    estimatedValuePerTicket: listing.estimatedValuePerTicket,
    askingCashAdjustment: listing.askingCashAdjustment ?? undefined,
    parkingIncluded: listing.parkingIncluded,
    benefits: parseJson<string[]>(listing.benefits, []),
    accept: {
      acceptsCash: listing.acceptsCash,
      acceptsGamesDescription: listing.acceptsGamesDescription ?? undefined,
      preferredGameIds: parseJson<string[]>(listing.preferredGameIds, []),
      flexibleOnDate: listing.flexibleOnDate,
      flexibleOnSection: listing.flexibleOnSection,
      notes: listing.acceptNotes ?? undefined,
    },
    visibility: listing.visibility as ListingView["visibility"],
    circleId: listing.circleId ?? undefined,
    status: listing.status as ListingView["status"],
    postedAt: listing.postedAt.toISOString(),
    viewCount: listing.viewCount,
    savedCount: listing.savedCount,
    accessible: listing.accessible,
    seller: toPublicUser(listing.seller),
    game: listing.event ? toGame(listing.event) : undefined,
  };
}

export function toWanted(
  request: WantedRequest & { requester: Pick<User, "id" | "name" | "initials">; event?: ListingEvent | null }
): WantedView {
  return {
    id: request.id,
    requesterId: request.requesterId,
    desiredGameId: request.desiredGameId,
    quantityMin: request.quantityMin,
    quantityMax: request.quantityMax,
    preferredSections: parseJson<SeatLevel[]>(request.preferredSections, []),
    maxBudget: request.maxBudget,
    offeringGameIds: parseJson<string[]>(request.offeringGameIds, []),
    offeringDescription: request.offeringDescription,
    flexibleOnDate: request.flexibleOnDate,
    postedAt: request.postedAt.toISOString(),
    expiresAt: request.expiresAt.toISOString(),
      requester: toPublicUser(request.requester),
      game: request.event ? toGame(request.event) : undefined,
  };
}

export function toTrade(
  trade: Trade & {
    userA: Pick<User, "id" | "name" | "initials">;
    userB: Pick<User, "id" | "name" | "initials">;
    dispute?: { id: string } | null;
  }
): TradeView {
  return {
    id: trade.id,
    listingId: trade.listingId ?? undefined,
    userAId: trade.userAId,
    userBId: trade.userBId,
    assetsFromA: parseJson<TradeAsset[]>(trade.assetsFromA, []),
    assetsFromB: parseJson<TradeAsset[]>(trade.assetsFromB, []),
    cashAdjustment: trade.cashAdjustment,
    platformFee: trade.platformFee,
    refundableDeposit: trade.refundableDeposit,
    stage: trade.stage as TradeStage,
    history: parseJson<TradeStageEvent[]>(trade.history, []),
    transferDeadline: trade.transferDeadline.toISOString(),
    waitingOnUserId: trade.waitingOnUserId ?? undefined,
    createdAt: trade.createdAt.toISOString(),
    disputeId: trade.dispute?.id,
    participantA: toPublicUser(trade.userA),
    participantB: toPublicUser(trade.userB),
  };
}

export function toMessage(message: Message): MessageView {
  return {
    id: message.id,
    senderId: message.senderId,
    kind: message.kind as MessageView["kind"],
    body: message.body,
    sentAt: message.sentAt.toISOString(),
  };
}

export function toThread(
  thread: MessageThread & {
    messages: Message[];
    participants: Array<{ userId: string; unread: boolean; user: Pick<User, "id" | "name" | "initials"> }>;
  },
  viewerId: string
): ThreadView {
  const other = thread.participants.find((p) => p.userId !== viewerId)?.user;
  const self = thread.participants.find((p) => p.userId === viewerId);
  return {
    id: thread.id,
    participantIds: thread.participants.map((p) => p.userId),
    listingId: thread.listingId ?? undefined,
    tradeId: thread.tradeId ?? undefined,
    messages: thread.messages.map(toMessage),
    unread: self?.unread ?? false,
    otherUser: other
      ? toPublicUser(other)
      : { id: "unknown", displayName: "Unknown", initials: "?" },
  };
}

export function toNotification(notification: Notification): AppNotification {
  return {
    id: notification.id,
    type: notification.type as NotificationType,
    title: notification.title,
    body: notification.body,
    urgency: notification.urgency as NotificationUrgency,
    createdAt: notification.createdAt.toISOString(),
    read: notification.read,
    relatedTradeId: notification.relatedTradeId ?? undefined,
    relatedListingId: notification.relatedListingId ?? undefined,
    relatedTransactionId: notification.relatedTransactionId ?? undefined,
    relatedOfferId: notification.relatedOfferId ?? undefined,
  };
}

export function toCircle(
  circle: Circle & { members: CircleMember[]; _count?: { members?: number } },
  listingCount = 0,
  requestCount = 0,
  viewerId?: string
): CircleView {
  return {
    id: circle.id,
    name: circle.name,
    type: circle.type as CircleView["type"],
    description: circle.description,
    memberCount: circle._count?.members ?? circle.members.length,
    listingCount,
    requestCount,
    isAdmin: viewerId
      ? circle.members.some((m) => m.userId === viewerId && m.isAdmin)
      : false,
    favoriteTeamId: circle.favoriteTeamId ?? undefined,
  };
}

export function toSeasonProgram(
  program: SeasonProgram & { entries: Array<{ gameId: string; status: string; ticketsHeld: number; listingId: string | null }> }
): SeasonProgramView {
  return {
    id: program.id,
    teamId: program.teamId,
    seasonLabel: program.seasonLabel,
    entries: program.entries.map(
      (entry): SeasonGameEntry => ({
        gameId: entry.gameId,
        status: entry.status as SeasonGameStatus,
        ticketsHeld: entry.ticketsHeld,
        listingId: entry.listingId ?? undefined,
      })
    ),
  };
}
