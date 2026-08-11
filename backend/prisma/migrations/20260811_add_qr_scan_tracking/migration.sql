-- Migration: add_qr_scan_tracking
-- Adds the QrScan table to track QR Code conversions per media and screen

-- CreateTable
CREATE TABLE "QrScan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "screenId" TEXT,
    "ctaType" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,

    CONSTRAINT "QrScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QrScan_tenantId_scannedAt_idx" ON "QrScan"("tenantId", "scannedAt");

-- CreateIndex
CREATE INDEX "QrScan_mediaId_scannedAt_idx" ON "QrScan"("mediaId", "scannedAt");

-- CreateIndex
CREATE INDEX "QrScan_screenId_scannedAt_idx" ON "QrScan"("screenId", "scannedAt");

-- AddForeignKey
ALTER TABLE "QrScan" ADD CONSTRAINT "QrScan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrScan" ADD CONSTRAINT "QrScan_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrScan" ADD CONSTRAINT "QrScan_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "Screen"("id") ON DELETE SET NULL ON UPDATE CASCADE;
