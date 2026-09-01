import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { queryNotifications } from "@/lib/queries";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const notifications = await queryNotifications(user.id);
  return NextResponse.json(notifications);
}
