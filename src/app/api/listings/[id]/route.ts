import { NextResponse } from "next/server";
import { queryListingById } from "@/lib/queries";
import { getSessionUser } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getSessionUser();
  const listing = await queryListingById(id, viewer?.id);
  if (!listing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(listing);
}
