/*
  Warnings:

  - A unique constraint covering the columns `[externalProvider,externalReservationId]` on the table `Reservation` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ReservationSource" AS ENUM ('FRONT_DESK', 'WEBSITE', 'BOOKING_COM', 'OTHER_CHANNEL');

-- CreateEnum
CREATE TYPE "IntegrationEventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "externalProvider" TEXT,
ADD COLUMN     "externalReservationId" TEXT,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "source" "ReservationSource" NOT NULL DEFAULT 'FRONT_DESK',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "ReservationIntegrationEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "IntegrationEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReservationIntegrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReservationIntegrationEvent_status_receivedAt_idx" ON "ReservationIntegrationEvent"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationIntegrationEvent_provider_eventId_key" ON "ReservationIntegrationEvent"("provider", "eventId");

-- CreateIndex
CREATE INDEX "Reservation_source_createdAt_idx" ON "Reservation"("source", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_externalProvider_externalReservationId_key" ON "Reservation"("externalProvider", "externalReservationId");
