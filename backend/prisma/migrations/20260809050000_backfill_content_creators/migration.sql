UPDATE "Screen" s SET "createdById" = (SELECT u."id" FROM "User" u WHERE u."tenantId" = s."tenantId" ORDER BY u."createdAt" ASC LIMIT 1) WHERE s."createdById" IS NULL;
UPDATE "Media" m SET "createdById" = (SELECT u."id" FROM "User" u WHERE u."tenantId" = m."tenantId" ORDER BY u."createdAt" ASC LIMIT 1) WHERE m."createdById" IS NULL;
UPDATE "Layout" l SET "createdById" = (SELECT u."id" FROM "User" u WHERE u."tenantId" = l."tenantId" ORDER BY u."createdAt" ASC LIMIT 1) WHERE l."createdById" IS NULL;
UPDATE "Playlist" p SET "createdById" = (SELECT u."id" FROM "User" u WHERE u."tenantId" = p."tenantId" ORDER BY u."createdAt" ASC LIMIT 1) WHERE p."createdById" IS NULL;
