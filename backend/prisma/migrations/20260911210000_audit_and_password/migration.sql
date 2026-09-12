ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "AdminSession" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AdminSession_userId_idx" ON "AdminSession"("userId");
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");
ALTER TABLE "Screen" ADD COLUMN "archivedAt" TIMESTAMP(3), ADD COLUMN "currentMediaAt" TIMESTAMP(3), ADD COLUMN "screenshotPath" TEXT;
ALTER TABLE "PairingSession" ADD COLUMN "tokenVersion" INTEGER, ADD COLUMN "consumedAt" TIMESTAMP(3);
UPDATE "PairingSession" p SET "tokenVersion" = s."deviceTokenVersion" FROM "Screen" s WHERE s.id = p."screenId";
ALTER TABLE "Media" ADD COLUMN "archivedAt" TIMESTAMP(3), ADD COLUMN "reportTokenHash" TEXT, ADD COLUMN "reportExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Media_reportTokenHash_key" ON "Media"("reportTokenHash");
ALTER TABLE "Campaign" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo';
UPDATE "Campaign" SET "status" = 'PAUSED' WHERE "status" = 'INACTIVE';
ALTER TABLE "ProofOfPlay" ADD COLUMN "mediaId" TEXT, ADD COLUMN "mediaVersion" INTEGER, ADD COLUMN "campaignId" TEXT,
  ADD COLUMN "zoneId" TEXT, ADD COLUMN "manifestVersion" INTEGER, ADD COLUMN "reason" TEXT;
-- Ambiguous historical names are deliberately left unattributed.
UPDATE "ProofOfPlay" p SET "mediaId" = m.id FROM "Media" m
WHERE m."tenantId" = p."tenantId" AND m.name = p."mediaName"
AND (SELECT count(*) FROM "Media" x WHERE x."tenantId" = m."tenantId" AND x.name = m.name) = 1;
CREATE INDEX "ProofOfPlay_tenantId_mediaId_playedAt_idx" ON "ProofOfPlay"("tenantId", "mediaId", "playedAt");
CREATE INDEX "ProofOfPlay_tenantId_campaignId_playedAt_idx" ON "ProofOfPlay"("tenantId", "campaignId", "playedAt");
ALTER TABLE "EmergencyAlert" ADD COLUMN "expiresAt" TIMESTAMP(3);
UPDATE "EmergencyAlert" SET "expiresAt" = "createdAt" + make_interval(secs => GREATEST(1, "durationSeconds"));
ALTER TABLE "TicketQueue" ALTER COLUMN "pinCode" DROP NOT NULL;
ALTER TABLE "TicketQueue" ADD COLUMN "pinHash" TEXT, ADD COLUMN "pinLookup" TEXT, ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX "TicketQueue_tenantId_pinLookup_key" ON "TicketQueue"("tenantId", "pinLookup");
ALTER TABLE "QueueTicket" ADD COLUMN "eventId" TEXT;
CREATE UNIQUE INDEX "QueueTicket_queueId_eventId_key" ON "QueueTicket"("queueId", "eventId");
CREATE TABLE "StorageDeletion" (
  "id" TEXT PRIMARY KEY, "storagePath" TEXT NOT NULL, "publicUrl" TEXT, "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "StorageDeletion_nextAttemptAt_idx" ON "StorageDeletion"("nextAttemptAt");
-- Remove foreign references already produced by the old public QR route.
UPDATE "QrScan" q SET "screenId" = NULL FROM "Screen" s WHERE q."screenId" = s.id AND q."tenantId" <> s."tenantId";
-- Publish the new hydrated contract without overwriting immutable historical snapshots.
UPDATE "Screen" SET "manifestVersion" = "manifestVersion" + 1;
