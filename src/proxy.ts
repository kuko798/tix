import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PROTECTED_PREFIXES = ["/list", "/wanted/new", "/offer", "/offers", "/trades", "/messages", "/notifications", "/season", "/settings", "/admin"];

export function isProtected(pathname: string) {
  if (pathname === "/profile" || pathname.startsWith("/circles/new") || pathname.startsWith("/groups/new")) {
    return true;
  }
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isProtected(pathname)) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/list",
    "/wanted/new",
    "/offer/:path*",
    "/offers/:path*",
    "/trades/:path*",
    "/messages/:path*",
    "/notifications",
    "/season",
    "/profile",
    "/circles/new",
    "/groups/new",
    "/settings/:path*",
    "/admin/:path*",
  ],
};
