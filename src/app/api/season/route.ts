import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { querySeasonPrograms } from "@/lib/queries";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const programs = await querySeasonPrograms(user.id);
  return NextResponse.json(programs);
}
