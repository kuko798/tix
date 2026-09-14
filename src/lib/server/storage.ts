import "server-only";
import { createHash } from "node:crypto";

import { CopyObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, assertServiceReady } from "@/lib/server/env";

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "application/pdf"]);
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

let client: S3Client | undefined;

function getClient() {
  assertServiceReady("privateUploads");
  client ??= new S3Client({
    region: env.S3_REGION!,
    endpoint: env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(env.S3_ENDPOINT),
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    },
  });
  return client;
}

export function validateEvidenceFile(input: { mimeType: string; byteSize: number }) {
  if (!allowedMimeTypes.has(input.mimeType)) throw new Error("Upload a JPG, PNG, or PDF file.");
  if (input.byteSize < 1 || input.byteSize > MAX_EVIDENCE_BYTES) {
    throw new Error("Evidence files must be smaller than 10 MB.");
  }
}

export async function createEvidenceUploadUrl(objectKey: string, mimeType: string, byteSize: number) {
  return getSignedUrl(
    getClient(),
    new PutObjectCommand({
      Bucket: env.S3_BUCKET!,
      Key: objectKey,
      ContentType: mimeType,
      ContentLength: byteSize,
      ServerSideEncryption: "AES256",
      Metadata: { classification: "private-ticket-evidence" },
    }),
    { expiresIn: 300 }
  );
}

export async function assertEvidenceUploaded(objectKey: string, expectedBytes: number, expectedMime?: string, expectedHash?: string) {
  const result = await getClient().send(new HeadObjectCommand({ Bucket: env.S3_BUCKET!, Key: objectKey }));
  if (result.ContentLength !== expectedBytes) throw new Error("The uploaded file did not match the request.");
  if (expectedMime && result.ContentType !== expectedMime) throw new Error("The uploaded file type did not match the request.");
  let verifiedETag = result.ETag;
  if (expectedHash) {
    const object = await getClient().send(new GetObjectCommand({ Bucket: env.S3_BUCKET!, Key: objectKey }));
    if (!object.Body) throw new Error("The uploaded file could not be read.");
    const bytes = await object.Body.transformToByteArray();
    verifiedETag = object.ETag;
    if (bytes.length !== expectedBytes || createHash("sha256").update(bytes).digest("hex") !== expectedHash.toLowerCase()) throw new Error("The uploaded file checksum did not match the request.");
    const valid = expectedMime === "image/png" ? Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137,80,78,71,13,10,26,10])) : expectedMime === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : expectedMime === "application/pdf" && Buffer.from(bytes.subarray(0, 5)).toString() === "%PDF-";
    if (!valid) throw new Error("The file contents do not match its declared type.");
  }
  if (!verifiedETag) throw new Error("The uploaded file could not be confirmed.");
  const confirmedKey = objectKey.replace(/(\.[^.]+)$/, ".confirmed$1");
  if (confirmedKey === objectKey) throw new Error("The upload key is invalid.");
  await getClient().send(new CopyObjectCommand({ Bucket: env.S3_BUCKET!, Key: confirmedKey, CopySource: `${env.S3_BUCKET!}/${objectKey.split("/").map(encodeURIComponent).join("/")}`, CopySourceIfMatch: verifiedETag, ServerSideEncryption: "AES256", MetadataDirective: "REPLACE", ContentType: expectedMime ?? result.ContentType, Metadata: { classification: "private-ticket-evidence" } }));
  return confirmedKey;
}

export async function createEvidenceDownloadUrl(objectKey: string) {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: env.S3_BUCKET!, Key: objectKey, ResponseContentDisposition: "inline" }),
    { expiresIn: 120 }
  );
}
