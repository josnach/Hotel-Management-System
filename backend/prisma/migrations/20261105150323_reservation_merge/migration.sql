/*
  Warnings:

  - A unique constraint covering the columns `[reservationId]` on the table `Folio` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[reservationNumber]` on the table `Reservation` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `reservationNumber` to the `Reservation` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReservationStatus" ADD VALUE 'CHECKED_OUT';
ALTER TYPE "ReservationStatus" ADD VALUE 'NO_SHOW';

-- AlterTable
ALTER TABLE "Folio" ADD COLUMN     "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "reservationId" TEXT;

-- AlterTable
-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "estimatedTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "guaranteeType" TEXT NOT NULL DEFAULT 'Deposit',
ADD COLUMN     "numberOfGuests" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "reservationNumber" TEXT,
ADD COLUMN     "specialRequests" TEXT;

-- Backfill existing reservations, then make the column required
UPDATE "Reservation" r
SET "reservationNumber" = 'RES-' || LPAD(n.rn::text, 5, '0')
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt", id) AS rn
  FROM "Reservation"
) n
WHERE r.id = n.id;

ALTER TABLE "Reservation" ALTER COLUMN "reservationNumber" SET NOT NULL;

-- CreateTable
CREATE TABLE "ReservationPayment" (
    "id" SERIAL NOT NULL,
    "reservationId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReservationPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FolioCharge" (
    "id" SERIAL NOT NULL,
    "folioId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FolioCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Folio_reservationId_key" ON "Folio"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_reservationNumber_key" ON "Reservation"("reservationNumber");

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationPayment" ADD CONSTRAINT "ReservationPayment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folio" ADD CONSTRAINT "Folio_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolioCharge" ADD CONSTRAINT "FolioCharge_folioId_fkey" FOREIGN KEY ("folioId") REFERENCES "Folio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
