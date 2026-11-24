-- CreateEnum
CREATE TYPE "CityLedgerType" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "CityLedgerStatus" AS ENUM ('COMPLETED', 'CANCELLED', 'PAID', 'REFUNDED');

-- CreateTable
CREATE TABLE "CityLedgerEntry" (
    "id" TEXT NOT NULL,
    "guestId" TEXT,
    "groupId" TEXT,
    "stayId" TEXT,
    "type" "CityLedgerType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "CityLedgerStatus" NOT NULL DEFAULT 'COMPLETED',
    "transactionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "settleMethod" TEXT,
    "settleReference" TEXT,
    "settleNotes" TEXT,
    "postedToFolioId" TEXT,
    "postedAt" TIMESTAMP(3),
    "journalId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CityLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CityLedgerEntry_status_transactionDate_idx" ON "CityLedgerEntry"("status", "transactionDate");

-- CreateIndex
CREATE INDEX "CityLedgerEntry_guestId_idx" ON "CityLedgerEntry"("guestId");

-- CreateIndex
CREATE INDEX "CityLedgerEntry_groupId_idx" ON "CityLedgerEntry"("groupId");

-- AddForeignKey
ALTER TABLE "CityLedgerEntry" ADD CONSTRAINT "CityLedgerEntry_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CityLedgerEntry" ADD CONSTRAINT "CityLedgerEntry_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CityLedgerEntry" ADD CONSTRAINT "CityLedgerEntry_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "Stay"("id") ON DELETE SET NULL ON UPDATE CASCADE;
