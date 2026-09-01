import { prisma } from "@/lib/prisma";
import { games, getGame, getTeam, getVenue } from "@/lib/catalog";
import { toCircle, toListing, toNotification, toSeasonProgram, toThread, toTrade, toWanted } from "@/lib/mappers";
import type { ListingFilters } from "@/lib/services";
import type {
  AppNotification,
  Circle,
  Listing,
  MessageThread,
  SeasonProgram,
  Trade,
  WantedRequest,
} from "@/lib/types";

const listingInclude = {
  seller: { select: { id: true, name: true, initials: true } },
  event: {
    include: {
      league: true,
      venue: true,
      homeTeam: { include: { league: true } },
      awayTeam: { include: { league: true } },
    },
  },
} as const;
const wantedInclude = {
  requester: { select: { id: true, name: true, initials: true } },
  event: { include: { league: true, venue: true, homeTeam: { include: { league: true } }, awayTeam: { include: { league: true } } } },
} as const;
const tradeInclude = {
  userA: { select: { id: true, name: true, initials: true } },
  userB: { select: { id: true, name: true, initials: true } },
  dispute: { select: { id: true } },
} as const;
const threadInclude = {
  messages: { orderBy: { sentAt: "asc" as const } },
  participants: { include: { user: { select: { id: true, name: true, initials: true } } } },
};

export async function queryListings(filters: ListingFilters = {}): Promise<Listing[]> {
  const rows = await prisma.listing.findMany({
    where: {
      status: "active",
      visibility: "public",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      ...(filters.eventId ? { eventId: filters.eventId } : {}),
    },
    include: listingInclude,
    orderBy: { postedAt: "desc" },
  });
  let result = rows.map(toListing);

  if (filters.query) {
    const q = filters.query.toLowerCase();
    result = result.filter((listing) => {
      const game = listing.game;
      if (!game?.homeTeam || !game.awayTeam || !game.venue) return false;
      const home = game.homeTeam;
      const away = game.awayTeam;
      const venue = game.venue;
      return (
        home.name.toLowerCase().includes(q) ||
        home.city.toLowerCase().includes(q) ||
        away.name.toLowerCase().includes(q) ||
        away.city.toLowerCase().includes(q) ||
        venue.name.toLowerCase().includes(q) ||
        venue.city.toLowerCase().includes(q)
      );
    });
  }
  if (filters.teamId) result = result.filter((listing) => listing.game?.homeTeamId === filters.teamId || listing.game?.awayTeamId === filters.teamId);
  if (filters.city) {
    const city = filters.city.toLowerCase();
    result = result.filter((listing) => listing.game?.venue?.city.toLowerCase() === city);
  }
  if (filters.venueId) result = result.filter((listing) => listing.game?.venueId === filters.venueId);
  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom).getTime();
    if (Number.isFinite(from)) result = result.filter((listing) => new Date(listing.game?.startTime ?? 0).getTime() >= from);
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo).getTime();
    if (Number.isFinite(to)) result = result.filter((listing) => new Date(listing.game?.startTime ?? 0).getTime() <= to);
  }
  if (filters.leagues?.length) {
    result = result.filter((listing) => Boolean(listing.game && filters.leagues!.includes(listing.game.league)));
  }
  if (filters.seatLevels?.length) {
    result = result.filter((listing) => filters.seatLevels!.includes(listing.seatLevel));
  }
  if (filters.listingTypes?.length) {
    result = result.filter((listing) => filters.listingTypes!.includes(listing.listingType));
  }
  if (filters.minQuantity) {
    result = result.filter((listing) => listing.quantity >= filters.minQuantity!);
  }
  if (filters.maxPrice) {
    result = result.filter((listing) => listing.estimatedValuePerTicket <= filters.maxPrice!);
  }
  if (filters.minPrice) result = result.filter((listing) => listing.estimatedValuePerTicket >= filters.minPrice!);
  if (filters.parkingOnly) {
    result = result.filter((listing) => listing.parkingIncluded);
  }
  if (filters.accessibleOnly) {
    result = result.filter((listing) => listing.accessible);
  }
  if (filters.transferReadyOnly) {
    result = result.filter((listing) =>
      ["transfer_initiated", "transfer_accepted", "issuer_verified"].includes(listing.transferReadiness)
    );
  }

  switch (filters.sort) {
    case "soonest":
      return [...result].sort(
        (a, b) => new Date(a.game?.startTime ?? 0).getTime() - new Date(b.game?.startTime ?? 0).getTime()
      );
    case "price_low":
      return [...result].sort((a, b) => a.estimatedValuePerTicket - b.estimatedValuePerTicket);
    case "price_high":
      return [...result].sort((a, b) => b.estimatedValuePerTicket - a.estimatedValuePerTicket);
    default:
      return result;
  }
}

export async function queryListingById(id: string, viewerId?: string): Promise<Listing | null> {
  const row = await prisma.listing.findUnique({ where: { id }, include: listingInclude });
  if (!row) return null;
  if (row.visibility === "public" && ["active", "pending", "completed"].includes(row.status)) return toListing(row);
  if (!viewerId) return null;
  if (row.sellerId === viewerId) return toListing(row);
  const participant = await prisma.messageThread.findFirst({
    where: { listingId: id, participants: { some: { userId: viewerId } } },
    select: { id: true },
  });
  if (participant) return toListing(row);
  if (row.visibility === "circle" && row.circleId) {
    const membership = await prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId: row.circleId, userId: viewerId } },
      select: { id: true },
    });
    if (membership) return toListing(row);
  }
  return null;
}

export async function queryListingsByCircle(circleId: string, viewerId?: string): Promise<Listing[]> {
  if (!viewerId) return [];
  const membership = await prisma.circleMember.findUnique({
    where: { circleId_userId: { circleId, userId: viewerId } },
    select: { id: true },
  });
  if (!membership) return [];
  const rows = await prisma.listing.findMany({
    where: { circleId, status: "active" },
    include: listingInclude,
    orderBy: { postedAt: "desc" },
  });
  return rows.map(toListing);
}

export async function queryListingsBySeller(sellerId: string): Promise<Listing[]> {
  const rows = await prisma.listing.findMany({
    where: { sellerId, status: "active" },
    include: listingInclude,
    orderBy: { postedAt: "desc" },
  });
  return rows.map(toListing);
}

export async function queryWantedRequests(): Promise<WantedRequest[]> {
  const rows = await prisma.wantedRequest.findMany({
      where: { status: "active", expiresAt: { gt: new Date() } },
    include: wantedInclude,
    orderBy: { postedAt: "desc" },
  });
  return rows.map(toWanted);
}

export async function queryWantedById(id: string): Promise<WantedRequest | null> {
  const row = await prisma.wantedRequest.findUnique({ where: { id }, include: wantedInclude });
  return row ? toWanted(row) : null;
}

export async function queryTradesForUser(userId: string): Promise<Trade[]> {
  const rows = await prisma.trade.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    include: tradeInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toTrade);
}

export async function queryTradeById(id: string): Promise<Trade | null> {
  const row = await prisma.trade.findUnique({ where: { id }, include: tradeInclude });
  return row ? toTrade(row) : null;
}

export async function queryDisputeForTrade(tradeId: string) {
  return prisma.dispute.findUnique({ where: { tradeId } });
}

export async function queryThreadsForUser(userId: string): Promise<MessageThread[]> {
  const rows = await prisma.messageThread.findMany({
    where: { participants: { some: { userId } } },
    include: threadInclude,
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((thread) => toThread(thread, userId));
}

export async function queryThreadById(id: string, userId: string): Promise<MessageThread | null> {
  const row = await prisma.messageThread.findFirst({
    where: { id, participants: { some: { userId } } },
    include: threadInclude,
  });
  return row ? toThread(row, userId) : null;
}

export async function queryNotifications(userId: string): Promise<AppNotification[]> {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toNotification);
}

export async function queryUnreadCounts(userId: string) {
  const [messages, notifications] = await Promise.all([
    prisma.threadParticipant.count({ where: { userId, unread: true } }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);
  return { messages, notifications };
}

export async function queryCircles(viewerId?: string): Promise<Circle[]> {
  const rows = await prisma.circle.findMany({
    include: { members: true, _count: { select: { members: true } } },
    orderBy: { createdAt: "desc" },
  });
  return Promise.all(
    rows.map(async (circle) => {
      const listingCount = await prisma.listing.count({
        where: { circleId: circle.id, status: "active" },
      });
      return toCircle(circle, listingCount, 0, viewerId);
    })
  );
}

export async function queryCircleById(id: string, viewerId?: string): Promise<Circle | null> {
  const row = await prisma.circle.findUnique({
    where: { id },
    include: { members: true, _count: { select: { members: true } } },
  });
  if (!row) return null;
  const listingCount = await prisma.listing.count({ where: { circleId: id, status: "active" } });
  return toCircle(row, listingCount, 0, viewerId);
}

export async function querySeasonPrograms(userId: string): Promise<SeasonProgram[]> {
  const rows = await prisma.seasonProgram.findMany({
    where: { userId },
    include: { entries: true },
  });
  return rows.map(toSeasonProgram);
}

export function catalogHomeGamesForTeam(teamId: string) {
  return games.filter((game) => game.homeTeamId === teamId);
}

export { games, getGame, getTeam, getVenue };
