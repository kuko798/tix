import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/env", () => ({
  env: { S3_REGION: "us-east-1", S3_BUCKET: "test-evidence", S3_ACCESS_KEY_ID: "test-key", S3_SECRET_ACCESS_KEY: "test-secret" },
  assertServiceReady: vi.fn(),
}));
vi.mock("@/components/ui/button", () => ({ Button: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { createEvidenceUploadUrl } from "./storage";
import { uploadPrivateEvidence } from "@/components/marketplace/evidence-upload";

afterEach(() => vi.unstubAllGlobals());

it.each(["listingId", "disputeId"] as const)("matches signed S3 headers for %s and avoids an empty-body checksum", async (targetKey) => {
  const file = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "proof.png", { type: "image/png" });
  const signedUrl = await createEvidenceUploadUrl("proof.png", file.type, file.size);
  const params = new URL(signedUrl).searchParams;
  expect(params.get("X-Amz-SignedHeaders")?.split(";")).toContain("x-amz-server-side-encryption");
  expect(params.has("x-amz-checksum-crc32")).toBe(false);
  expect(params.has("x-amz-sdk-checksum-algorithm")).toBe(false);
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(Response.json({ uploadUrl: signedUrl, evidenceId: "evidence-test" }))
    .mockImplementationOnce(async (_url, init) => {
      expect(init.headers["x-amz-server-side-encryption"]).toBe("AES256");
      expect(init.headers["Content-Type"]).toBe(file.type);
      expect(init.body).toBe(file);
      expect(init.body.size).toBe(file.size);
      return new Response(null, { status: 200 });
    })
    .mockResolvedValueOnce(Response.json({ success: true }));
  vi.stubGlobal("fetch", fetchMock);
  await uploadPrivateEvidence(file, targetKey === "listingId" ? { listingId: "listing-test" } : { disputeId: "dispute-test" });
  expect(fetchMock).toHaveBeenCalledTimes(3);
  const metadata = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(metadata.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(fetchMock.mock.calls[2][1].method).toBe("PATCH");
});

it("does not confirm evidence when S3 rejects the upload", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(Response.json({ uploadUrl: "https://storage.example/proof", evidenceId: "test" }))
    .mockResolvedValueOnce(new Response(null, { status: 403 }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(uploadPrivateEvidence(new File(["test"], "proof.png", { type: "image/png" }), { listingId: "test" })).rejects.toThrow("Upload failed");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
