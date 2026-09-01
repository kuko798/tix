import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { queryThreadById } from "@/lib/queries";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const thread = await queryThreadById(id, user.id);
  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(thread);
}
