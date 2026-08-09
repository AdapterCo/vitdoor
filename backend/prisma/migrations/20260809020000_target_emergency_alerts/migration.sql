CREATE TABLE "EmergencyAlertTarget" (
    "alertId" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    CONSTRAINT "EmergencyAlertTarget_pkey" PRIMARY KEY ("alertId", "screenId")
);
ALTER TABLE "EmergencyAlertTarget" ADD CONSTRAINT "EmergencyAlertTarget_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "EmergencyAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmergencyAlertTarget" ADD CONSTRAINT "EmergencyAlertTarget_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "Screen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
