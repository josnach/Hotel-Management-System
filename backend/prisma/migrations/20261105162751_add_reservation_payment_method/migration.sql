-- AlterTable
ALTER TABLE "ReservationPayment" ADD COLUMN     "method" "PaymentMethod";

-- CreateIndex
CREATE INDEX "ReservationPayment_reservationId_createdAt_idx" ON "ReservationPayment"("reservationId", "createdAt");
