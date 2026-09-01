import { describe, expect, it } from "vitest";
import { maskPhoneNumber, normalizePhoneNumber } from "@/lib/phone";

describe("phone number normalization", () => {
  it("normalizes a formatted US number", () => {
    expect(normalizePhoneNumber("(312) 555-0198")).toBe("+13125550198");
  });

  it("preserves an international E.164 country code", () => {
    expect(normalizePhoneNumber("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("rejects ambiguous or invalid numbers", () => {
    expect(normalizePhoneNumber("555-0198")).toBeNull();
    expect(normalizePhoneNumber("+0123456789")).toBeNull();
  });

  it("masks all but the final four digits", () => {
    expect(maskPhoneNumber("+13125550198")).toBe("••• ••• 0198");
  });
});
