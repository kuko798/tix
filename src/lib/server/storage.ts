import "server-only";

import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

export async function assertEvidenceUploaded(objectKey: string, expectedBytes: number) {
  const result = await getClient().send(new HeadObjectCommand({ Bucket: env.S3_BUCKET!, Key: objectKey }));
  if (result.ContentLength !== expectedBytes) throw new Error("The uploaded file did not match the request.");
}

export async function createEvidenceDownloadUrl(objectKey: string) {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: env.S3_BUCKET!, Key: objectKey, ResponseContentDisposition: "inline" }),
    { expiresIn: 120 }
  );
}
