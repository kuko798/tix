import { describe, expect, it } from "vitest";
import { initialsFromName, messageLooksUnsafe } from "./initials";

describe("profile initials", () => {
  it("handles single and multi-part display names", () => {
    expect(initialsFromName("Avery Stone")).toBe("AS");
    expect(initialsFromName("Prince")).toBe("PR");
  });
});

describe("sensitive message screening", () => {
  it.each(["4111111111111111", "Use my card 4242 4242 4242 4242 to pay.", "4242-4242-4242-4242", "send the QR code", "what is the cvv?"])("blocks %s", (body) => {
    expect(messageLooksUnsafe(body)).toBe(true);
  });
  it("allows ordinary ticket-transfer coordination", () => {
    expect(messageLooksUnsafe("I sent the transfer through the official issuer.")).toBe(false);
  });
  it("allows seat numbers and domestic phone numbers", () => {
    expect(messageLooksUnsafe("Section 101, row 12, seats 4-5. Call 312-555-0100.")).toBe(false);
  });
});
