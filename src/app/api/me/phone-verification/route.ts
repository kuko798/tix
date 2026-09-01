import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { normalizePhoneNumber } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { audit } from "@/lib/server/audit";
import { checkPhoneVerificationCode, sendPhoneVerificationCode } from "@/lib/server/phone-verification";
import { enforceRateLimit, RateLimitError } from "@/lib/server/rate-limit";

const requestCodeSchema = z.object({ phoneNumber: z.string().min(8).max(32) });
const verifyCodeSchema = requestCodeSchema.extend({ code: z.string().regex(/^[0-9]{4,10}$/) });

async function getActiveApiUser() {
  const session = await getSessionUser();
  if (!session) return null;
  return prisma.user.findFirst({
    where: { id: session.id, accountStatus: "active" },
    select: { id: true },
  });
}

export async function POST(request: NextRequest) {
  try {
    const user = await getActiveApiUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const input = requestCodeSchema.parse(await request.json());
    const phoneNumber = normalizePhoneNumber(input.phoneNumber);
    if (!phoneNumber) return NextResponse.json({ error: "Enter a valid phone number with a country code." }, { status: 400 });

    const existing = await prisma.user.findFirst({
      where: { phoneNumber, NOT: { id: user.id } },
      select: { id: true },
    });
    if (existing) return NextResponse.json({ error: "This phone number cannot be used." }, { status: 409 });

    await enforceRateLimit({ scope: "phone-verification-user", userId: user.id, limit: 3, windowSeconds: 600 });
    await enforceRateLimit({
      scope: "phone-verification-target",
      userId: createHash("sha256").update(phoneNumber).digest("hex"),
      limit: 5,
      windowSeconds: 3600,
    });
    await sendPhoneVerificationCode(phoneNumber);
    await audit({ actorUserId: user.id, action: "phone.verification_requested", entityType: "user", entityId: user.id });
    return NextResponse.json({ success: true, phoneNumber });
  } catch (error) {
    return phoneVerificationError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getActiveApiUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const input = verifyCodeSchema.parse(await request.json());
    const phoneNumber = normalizePhoneNumber(input.phoneNumber);
    if (!phoneNumber) return NextResponse.json({ error: "Enter a valid phone number with a country code." }, { status: 400 });

    await enforceRateLimit({ scope: "phone-verification-check", userId: user.id, limit: 10, windowSeconds: 600 });
    const approved = await checkPhoneVerificationCode(phoneNumber, input.code);
    if (!approved) return NextResponse.json({ error: "The code is invalid or has expired." }, { status: 400 });

    await prisma.user.update({
      where: { id: user.id },
      data: { phoneNumber, verifiedPhone: true },
    });
    await audit({ actorUserId: user.id, action: "phone.verified", entityType: "user", entityId: user.id });
    return NextResponse.json({ success: true, phoneNumber });
  } catch (error) {
    return phoneVerificationError(error);
  }
}

function phoneVerificationError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "The verification request is invalid." }, { status: 400 });
  }
  if (error instanceof RateLimitError) {
    return NextResponse.json(
      { error: error.message },
      { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } }
    );
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return NextResponse.json({ error: "This phone number cannot be used." }, { status: 409 });
  }
  const message = error instanceof Error ? error.message : "";
  if (message.includes("phoneVerification is not configured")) {
    return NextResponse.json({ error: "Phone verification is not configured yet." }, { status: 503 });
  }
  return NextResponse.json({ error: "Phone verification is temporarily unavailable." }, { status: 502 });
}
