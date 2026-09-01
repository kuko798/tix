import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { queryDisputeForTrade, queryTradeById } from "@/lib/queries";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const trade = await queryTradeById(id);
  if (!trade || (trade.userAId !== user.id && trade.userBId !== user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [dispute, transaction] = await Promise.all([
    queryDisputeForTrade(id),
    prisma.transaction.findUnique({
      where: { legacyTradeId: id },
      select: { id: true, buyerId: true, sellerId: true, status: true },
    }),
  ]);
  return NextResponse.json({ trade, dispute, transaction });
}
