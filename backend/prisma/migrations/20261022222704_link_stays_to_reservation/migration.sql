/*
  Warnings:

  - A unique constraint covering the columns `[reservationId]` on the table `Stay` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Stay" ADD COLUMN     "reservationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Stay_reservationId_key" ON "Stay"("reservationId");

-- AddForeignKey
ALTER TABLE "Stay" ADD CONSTRAINT "Stay_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
