CREATE TABLE "MediaFolder" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaFolder_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Media" ADD COLUMN "folderId" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "createdById" TEXT;

UPDATE "Campaign" c
SET "createdById" = (
  SELECT u."id" FROM "User" u
  WHERE u."tenantId" = c."tenantId"
  ORDER BY u."createdAt" ASC LIMIT 1
)
WHERE c."createdById" IS NULL;

CREATE UNIQUE INDEX "MediaFolder_createdById_name_key" ON "MediaFolder"("createdById", "name");
CREATE INDEX "MediaFolder_tenantId_createdById_idx" ON "MediaFolder"("tenantId", "createdById");
ALTER TABLE "MediaFolder" ADD CONSTRAINT "MediaFolder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaFolder" ADD CONSTRAINT "MediaFolder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Media" ADD CONSTRAINT "Media_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "MediaFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
