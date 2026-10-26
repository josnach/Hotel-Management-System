/*
  Warnings:

  - You are about to drop the column `openedBy` on the `ShiftSession` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[qrToken]` on the table `Room` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "HkTaskType" AS ENUM ('CHECKOUT_CLEAN', 'STAYOVER', 'MANUAL');

-- CreateEnum
CREATE TYPE "HkTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'READY_FOR_INSPECTION', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GuestRequestType" AS ENUM ('ORDER', 'SERVICE', 'FEEDBACK');

-- CreateEnum
CREATE TYPE "GuestRequestStatus" AS ENUM ('NEW', 'ACCEPTED', 'DONE', 'DECLINED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "qrToken" TEXT;

-- AlterTable
ALTER TABLE "ShiftSession" DROP COLUMN "openedBy",
ADD COLUMN     "cashierId" TEXT,
ADD COLUMN     "closedById" TEXT,
ADD COLUMN     "declaredCash" DECIMAL(14,2),
ADD COLUMN     "expectedCash" DECIMAL(14,2),
ADD COLUMN     "nonCashTotal" DECIMAL(14,2),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "openingFloat" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "overShort" DECIMAL(14,2),
ADD COLUMN     "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "Stay" ADD COLUMN     "portalPin" TEXT;

-- CreateTable
CREATE TABLE "NightAudit" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" TEXT,
    "report" JSONB NOT NULL,
    "notes" TEXT,

    CONSTRAINT "NightAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HousekeepingTask" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "type" "HkTaskType" NOT NULL DEFAULT 'CHECKOUT_CLEAN',
    "status" "HkTaskStatus" NOT NULL DEFAULT 'PENDING',
    "assignedToId" TEXT,
    "checklist" JSONB NOT NULL,
    "notes" TEXT,
    "reworkCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "inspectedAt" TIMESTAMP(3),
    "inspectedById" TEXT,
    "inspectionNote" TEXT,

    CONSTRAINT "HousekeepingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestRequest" (
    "id" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "type" "GuestRequestType" NOT NULL,
    "status" "GuestRequestStatus" NOT NULL DEFAULT 'NEW',
    "kind" TEXT,
    "text" TEXT,
    "items" JSONB,
    "estimatedTotal" DECIMAL(14,2),
    "rating" INTEGER,
    "orderId" TEXT,
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NightAudit_date_key" ON "NightAudit"("date");

-- CreateIndex
CREATE INDEX "HousekeepingTask_status_idx" ON "HousekeepingTask"("status");

-- CreateIndex
CREATE INDEX "HousekeepingTask_roomId_status_idx" ON "HousekeepingTask"("roomId", "status");

-- CreateIndex
CREATE INDEX "HousekeepingTask_assignedToId_idx" ON "HousekeepingTask"("assignedToId");

-- CreateIndex
CREATE INDEX "HousekeepingTask_createdAt_idx" ON "HousekeepingTask"("createdAt");

-- CreateIndex
CREATE INDEX "GuestRequest_status_createdAt_idx" ON "GuestRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "GuestRequest_stayId_idx" ON "GuestRequest"("stayId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_qrToken_key" ON "Room"("qrToken");

-- CreateIndex
CREATE INDEX "ShiftSession_date_idx" ON "ShiftSession"("date");

-- CreateIndex
CREATE INDEX "ShiftSession_cashierId_status_idx" ON "ShiftSession"("cashierId", "status");

-- AddForeignKey
ALTER TABLE "ShiftSession" ADD CONSTRAINT "ShiftSession_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingTask" ADD CONSTRAINT "HousekeepingTask_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingTask" ADD CONSTRAINT "HousekeepingTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingTask" ADD CONSTRAINT "HousekeepingTask_inspectedById_fkey" FOREIGN KEY ("inspectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestRequest" ADD CONSTRAINT "GuestRequest_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "Stay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestRequest" ADD CONSTRAINT "GuestRequest_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
