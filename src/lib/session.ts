import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toUserProfile } from "@/lib/mappers";
import type { UserProfile } from "@/lib/types";

export async function getSessionUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session?.user ?? null;
}

export async function requireSessionUser() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function getCurrentProfile(): Promise<UserProfile | null> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null;
  return getProfileById(sessionUser.id);
}

export async function requireCurrentProfile(): Promise<UserProfile> {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }
  return profile;
}

export async function getProfileById(id: string): Promise<UserProfile | null> {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      reviewsReceived: {
        where: { moderationStatus: "published", transaction: { status: "completed" } },
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
      circleMemberships: { select: { circleId: true } },
    },
  });
  if (!user) return null;
  return toUserProfile(
    user,
    user.reviewsReceived,
    user.circleMemberships.map((m) => m.circleId)
  );
}
