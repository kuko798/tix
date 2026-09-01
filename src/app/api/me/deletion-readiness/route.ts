import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ready: false, reason: "Sign in required." }, { status: 401 });
  const [transactions, disputes] = await Promise.all([
    prisma.transaction.count({ where: { OR: [{ buyerId: user.id }, { sellerId: user.id }], status: { notIn: ["completed", "cancelled", "refunded"] } } }),
    prisma.dispute.count({ where: { filedByUserId: user.id, status: { not: "resolved" } } }),
  ]);
  if (transactions || disputes) return NextResponse.json({ ready: false, reason: "Resolve open transactions and disputes before deleting your account." });
  return NextResponse.json({ ready: true });
}
