import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { queryUnreadCounts } from "@/lib/queries";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ messages: 0, notifications: 0 });
  }
  const counts = await queryUnreadCounts(user.id);
  return NextResponse.json(counts);
}
