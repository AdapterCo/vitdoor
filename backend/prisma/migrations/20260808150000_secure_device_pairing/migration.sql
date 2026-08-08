ALTER TABLE "Screen" ADD COLUMN "deviceTokenVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "PairingSession" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "screenId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PairingSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PairingSession_code_key" ON "PairingSession"("code");
CREATE UNIQUE INDEX "PairingSession_screenId_key" ON "PairingSession"("screenId");
ALTER TABLE "PairingSession" ADD CONSTRAINT "PairingSession_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "Screen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
