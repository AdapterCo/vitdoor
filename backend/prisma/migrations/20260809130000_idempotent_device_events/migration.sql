ALTER TABLE "ProofOfPlay" ADD COLUMN "eventId" TEXT;
UPDATE "ProofOfPlay" SET "eventId" = "id" WHERE "eventId" IS NULL;
ALTER TABLE "ProofOfPlay" ALTER COLUMN "eventId" SET NOT NULL;
CREATE UNIQUE INDEX "ProofOfPlay_screenId_eventId_key" ON "ProofOfPlay"("screenId", "eventId");

CREATE TABLE "RemoteCommand" (
    "commandId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payloadJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "success" BOOLEAN,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "RemoteCommand_pkey" PRIMARY KEY ("commandId")
);

CREATE INDEX "RemoteCommand_screenId_status_createdAt_idx" ON "RemoteCommand"("screenId", "status", "createdAt");
CREATE INDEX "RemoteCommand_tenantId_createdById_createdAt_idx" ON "RemoteCommand"("tenantId", "createdById", "createdAt");
ALTER TABLE "RemoteCommand" ADD CONSTRAINT "RemoteCommand_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RemoteCommand" ADD CONSTRAINT "RemoteCommand_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "Screen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RemoteCommand" ADD CONSTRAINT "RemoteCommand_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
