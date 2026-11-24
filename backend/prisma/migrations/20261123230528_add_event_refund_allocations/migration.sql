-- AlterTable
ALTER TABLE "EventPayment" ADD COLUMN     "facilityRentalRefund" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "otherRevenueRefund" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "serviceChargeRefund" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "vatRefund" DECIMAL(14,2) NOT NULL DEFAULT 0;
