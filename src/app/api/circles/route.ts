import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { queryCircles } from "@/lib/queries";

export async function GET() {
  const user = await getSessionUser();
  const circles = await queryCircles(user?.id);
  return NextResponse.json(circles);
}
