"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export async function uploadPrivateEvidence(file: File, target: { listingId: string } | { disputeId: string }) {
  if (!["image/png", "image/jpeg", "application/pdf"].includes(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) throw new Error("Choose a JPG, PNG, or PDF smaller than 10 MB.");
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const endpoint = "disputeId" in target ? "/api/disputes/evidence" : "/api/evidence";
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...target, originalName: file.name, mimeType: file.type, byteSize: file.size, sha256 }) });
  const upload = await response.json();
  if (!response.ok) throw new Error(upload.error ?? "Could not prepare the private upload.");
  const put = await fetch(upload.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!put.ok) throw new Error("Upload failed. Your saved information is safe; retry the file upload.");
  const confirmation = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evidenceId: upload.evidenceId }) });
  const confirmed = await confirmation.json();
  if (!confirmation.ok) throw new Error(confirmed.error ?? "Could not verify the uploaded file. Please retry.");
}

export function EvidenceUpload({ target, onUploaded }: { target: { listingId: string } | { disputeId: string }; onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  return <div className="mt-6 space-y-3 rounded-lg border border-border p-5">
    <p className="text-sm font-medium">Upload private evidence</p>
    <p className="text-xs text-muted-foreground">JPG, PNG, or PDF, up to 10 MB. Dispute files are available to the participants and support.</p>
    <input aria-label="Private evidence file" type="file" accept="image/jpeg,image/png,application/pdf" disabled={pending} onChange={event => setFile(event.target.files?.[0] ?? null)} />
    <Button disabled={!file || pending} onClick={async () => { if (!file) return; setPending(true); try { await uploadPrivateEvidence(file, target); toast.success("Private evidence uploaded."); setFile(null); onUploaded(); } catch (error) { toast.error(error instanceof Error ? error.message : "Upload failed. Please retry."); } finally { setPending(false); } }}>{pending ? "Uploading…" : "Upload evidence"}</Button>
  </div>;
}
