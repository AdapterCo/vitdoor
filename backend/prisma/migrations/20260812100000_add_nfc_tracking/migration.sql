-- AlterTable
ALTER TABLE "Screen" ADD COLUMN "currentMediaId" TEXT;

-- AlterTable
ALTER TABLE "QrScan" ADD COLUMN "scanSource" TEXT NOT NULL DEFAULT 'QR_CODE';
