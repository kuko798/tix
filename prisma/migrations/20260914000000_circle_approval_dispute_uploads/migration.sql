CREATE TABLE "CircleJoinRequest" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "CircleJoinRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CircleJoinRequest_circleId_userId_key" ON "CircleJoinRequest"("circleId", "userId");
CREATE INDEX "CircleJoinRequest_circleId_status_idx" ON "CircleJoinRequest"("circleId", "status");
ALTER TABLE "CircleJoinRequest" ADD CONSTRAINT "CircleJoinRequest_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CircleJoinRequest" ADD CONSTRAINT "CircleJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DisputeEvidence" ADD COLUMN "uploadStatus" TEXT NOT NULL DEFAULT 'uploading';
ALTER TABLE "Dispute" ADD COLUMN "providerDisputeId" TEXT;
ALTER TABLE "Dispute" ADD COLUMN "providerStatus" TEXT;
CREATE UNIQUE INDEX "Dispute_providerDisputeId_key" ON "Dispute"("providerDisputeId");
CREATE TABLE "ReconciliationLease" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReconciliationLease_pkey" PRIMARY KEY ("id")
);
