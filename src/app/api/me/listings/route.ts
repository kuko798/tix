import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { queryListingsBySeller } from "@/lib/queries";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const listings = await queryListingsBySeller(user.id);
  return NextResponse.json(listings);
}
