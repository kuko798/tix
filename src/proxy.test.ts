import { describe, expect, it } from "vitest";
import { isProtected } from "./proxy";

describe("protected route policy", () => {
  it.each(["/list", "/offers", "/offers/123", "/messages/thread", "/settings", "/admin", "/wanted/new"])("protects %s", (path) => {
    expect(isProtected(path)).toBe(true);
  });
  it.each(["/", "/discover", "/listing/123", "/login", "/terms"])("keeps %s public", (path) => {
    expect(isProtected(path)).toBe(false);
  });
});
