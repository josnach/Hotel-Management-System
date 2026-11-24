-- AlterTable
ALTER TABLE "EventBooking" ADD COLUMN     "description" TEXT,
ADD COLUMN     "eventManager" TEXT,
ADD COLUMN     "eventType" "EventType" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "specialRequirements" TEXT;