-- CreateTable
CREATE TABLE "TicketQueue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "currentNum" INTEGER NOT NULL DEFAULT 0,
    "pinCode" TEXT NOT NULL,
    "deskName" TEXT NOT NULL DEFAULT 'Guichê 01',
    "screenId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueTicket" (
    "id" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "deskName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CALLED',
    "calledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueueTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketQueue_tenantId_idx" ON "TicketQueue"("tenantId");

-- CreateIndex
CREATE INDEX "TicketQueue_pinCode_idx" ON "TicketQueue"("pinCode");

-- CreateIndex
CREATE INDEX "QueueTicket_queueId_calledAt_idx" ON "QueueTicket"("queueId", "calledAt");

-- AddForeignKey
ALTER TABLE "TicketQueue" ADD CONSTRAINT "TicketQueue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketQueue" ADD CONSTRAINT "TicketQueue_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "Screen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueTicket" ADD CONSTRAINT "QueueTicket_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "TicketQueue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
