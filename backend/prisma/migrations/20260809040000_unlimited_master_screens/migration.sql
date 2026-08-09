ALTER TABLE "Tenant" ADD COLUMN "unlimitedScreens" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Tenant" SET "unlimitedScreens" = true WHERE "slug" = 'vitdoor-master';
