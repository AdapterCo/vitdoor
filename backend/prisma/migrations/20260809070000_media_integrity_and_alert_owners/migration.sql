ALTER TABLE "Media" ADD COLUMN "mimeType" TEXT;
ALTER TABLE "Media" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "EmergencyAlert" ADD COLUMN "createdById" TEXT;

ALTER TABLE "Screen" ALTER COLUMN "storageFreeMb" DROP DEFAULT;
ALTER TABLE "Screen" ALTER COLUMN "ramUsagePercent" DROP DEFAULT;
ALTER TABLE "Screen" ALTER COLUMN "cpuUsagePercent" DROP DEFAULT;
ALTER TABLE "Screen" ALTER COLUMN "appVersion" DROP DEFAULT;

UPDATE "EmergencyAlert" alert
SET "createdById" = (
  SELECT screen."createdById"
  FROM "EmergencyAlertTarget" target
  JOIN "Screen" screen ON screen."id" = target."screenId"
  WHERE target."alertId" = alert."id" AND screen."createdById" IS NOT NULL
  LIMIT 1
)
WHERE alert."createdById" IS NULL;

UPDATE "EmergencyAlert" alert
SET "createdById" = (
  SELECT user_record."id" FROM "User" user_record
  WHERE user_record."tenantId" = alert."tenantId"
  ORDER BY user_record."createdAt" ASC LIMIT 1
)
WHERE alert."createdById" IS NULL;

ALTER TABLE "EmergencyAlert" ADD CONSTRAINT "EmergencyAlert_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "EmergencyAlert_tenantId_createdById_idx" ON "EmergencyAlert"("tenantId", "createdById");
