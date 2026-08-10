ALTER TABLE "RemoteCommand"
ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "RemoteCommand"
SET "expiresAt" = "createdAt" + INTERVAL '24 hours'
WHERE "expiresAt" IS NULL;

ALTER TABLE "RemoteCommand"
ALTER COLUMN "expiresAt" SET NOT NULL;

CREATE TABLE "ScreenManifest" (
    "id" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScreenManifest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScreenManifest_screenId_version_key" ON "ScreenManifest"("screenId", "version");
CREATE INDEX "ScreenManifest_screenId_createdAt_idx" ON "ScreenManifest"("screenId", "createdAt");

ALTER TABLE "ScreenManifest"
ADD CONSTRAINT "ScreenManifest_screenId_fkey"
FOREIGN KEY ("screenId") REFERENCES "Screen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
