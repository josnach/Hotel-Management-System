/*
  Warnings:

  - A unique constraint covering the columns `[ticketNo]` on the table `MaintenanceTicket` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "MaintenancePriority" AS ENUM ('EMERGENCY', 'HIGH', 'NORMAL');

-- CreateEnum
CREATE TYPE "MaintenanceCategory" AS ENUM ('PLUMBING', 'ELECTRICAL', 'HVAC', 'FURNITURE', 'APPLIANCE', 'STRUCTURAL', 'IT_NETWORK', 'GENERAL');

-- CreateEnum
CREATE TYPE "MaintenanceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY');

-- AlterEnum
ALTER TYPE "MaintenanceStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "MaintenanceTicket" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "category" "MaintenanceCategory" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "priority" "MaintenancePriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "reportedById" TEXT,
ADD COLUMN     "reportedByName" TEXT,
ADD COLUMN     "resolutionNote" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "ticketNo" SERIAL NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "MaintenanceSchedule" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "MaintenanceCategory" NOT NULL DEFAULT 'GENERAL',
    "roomId" TEXT,
    "equipment" TEXT,
    "frequency" "MaintenanceFrequency" NOT NULL,
    "lastPerformedAt" TIMESTAMP(3),
    "nextDueAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_isActive_nextDueAt_idx" ON "MaintenanceSchedule"("isActive", "nextDueAt");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_roomId_idx" ON "MaintenanceSchedule"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceTicket_ticketNo_key" ON "MaintenanceTicket"("ticketNo");

-- CreateIndex
CREATE INDEX "MaintenanceTicket_status_priority_idx" ON "MaintenanceTicket"("status", "priority");

-- CreateIndex
CREATE INDEX "MaintenanceTicket_createdAt_idx" ON "MaintenanceTicket"("createdAt");

-- CreateIndex
CREATE INDEX "MaintenanceTicket_roomId_idx" ON "MaintenanceTicket"("roomId");

-- CreateIndex
CREATE INDEX "MaintenanceTicket_assignedToId_idx" ON "MaintenanceTicket"("assignedToId");

-- AddForeignKey
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceSchedule" ADD CONSTRAINT "MaintenanceSchedule_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
