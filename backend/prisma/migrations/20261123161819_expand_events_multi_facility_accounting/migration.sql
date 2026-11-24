
-- CreateEnum
CREATE TYPE "EventRateType" AS ENUM (
    'HOURLY',
    'HALF_DAY',
    'FULL_DAY',
    'CUSTOM'
);

-- CreateEnum
CREATE TYPE "EventChargeCategory" AS ENUM (
    'FACILITY_RENTAL',
    'EQUIPMENT',
    'CATERING',
    'DECORATION',
    'STAFF',
    'OTHER'
);

-- CreateEnum
CREATE TYPE "EventPaymentType" AS ENUM (
    'PAYMENT',
    'REFUND'
);

-- AlterTable: EventBooking
-- Temporarily use CURRENT_TIMESTAMP to populate existing rows.
-- Remove the database default afterward to match Prisma's @updatedAt behavior.
ALTER TABLE "EventBooking"
    ADD COLUMN "baseAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN "serviceChargeAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN "serviceChargeRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    ADD COLUMN "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "vatAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN "vatRate" DECIMAL(5,4) NOT NULL DEFAULT 0;

ALTER TABLE "EventBooking"
    ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable: Facility
-- Existing facilities receive their creation and update timestamps.
ALTER TABLE "Facility"
    ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "fullDayRate" DECIMAL(14,2),
    ADD COLUMN "halfDayRate" DECIMAL(14,2),
    ADD COLUMN "hourlyRate" DECIMAL(14,2),
    ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Facility"
    ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable: EventBookingFacility
CREATE TABLE "EventBookingFacility" (
    "id" TEXT NOT NULL,
    "eventBookingId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "setupStartsAt" TIMESTAMP(3),
    "teardownEndsAt" TIMESTAMP(3),
    "rateType" "EventRateType" NOT NULL DEFAULT 'CUSTOM',
    "unitRate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "quotedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventBookingFacility_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EventCharge
CREATE TABLE "EventCharge" (
    "id" TEXT NOT NULL,
    "eventBookingId" TEXT NOT NULL,
    "facilityAssignmentId" TEXT,
    "description" TEXT NOT NULL,
    "category" "EventChargeCategory" NOT NULL DEFAULT 'OTHER',
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EventPayment
CREATE TABLE "EventPayment" (
    "id" TEXT NOT NULL,
    "eventBookingId" TEXT NOT NULL,
    "type" "EventPaymentType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "description" TEXT,
    "reason" TEXT,
    "journalId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventBookingFacility_eventBookingId_idx"
    ON "EventBookingFacility"("eventBookingId");

CREATE INDEX "EventBookingFacility_facilityId_startsAt_endsAt_idx"
    ON "EventBookingFacility"("facilityId", "startsAt", "endsAt");

CREATE INDEX "EventCharge_eventBookingId_idx"
    ON "EventCharge"("eventBookingId");

CREATE INDEX "EventCharge_facilityAssignmentId_idx"
    ON "EventCharge"("facilityAssignmentId");

CREATE INDEX "EventPayment_eventBookingId_createdAt_idx"
    ON "EventPayment"("eventBookingId", "createdAt");

CREATE INDEX "EventPayment_type_createdAt_idx"
    ON "EventPayment"("type", "createdAt");

CREATE INDEX "EventPayment_journalId_idx"
    ON "EventPayment"("journalId");

CREATE INDEX "EventBooking_status_startsAt_idx"
    ON "EventBooking"("status", "startsAt");

CREATE INDEX "EventBooking_groupId_idx"
    ON "EventBooking"("groupId");

-- AddForeignKey
ALTER TABLE "EventBookingFacility"
    ADD CONSTRAINT "EventBookingFacility_eventBookingId_fkey"
    FOREIGN KEY ("eventBookingId")
    REFERENCES "EventBooking"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "EventBookingFacility"
    ADD CONSTRAINT "EventBookingFacility_facilityId_fkey"
    FOREIGN KEY ("facilityId")
    REFERENCES "Facility"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

ALTER TABLE "EventCharge"
    ADD CONSTRAINT "EventCharge_eventBookingId_fkey"
    FOREIGN KEY ("eventBookingId")
    REFERENCES "EventBooking"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "EventCharge"
    ADD CONSTRAINT "EventCharge_facilityAssignmentId_fkey"
    FOREIGN KEY ("facilityAssignmentId")
    REFERENCES "EventBookingFacility"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;

ALTER TABLE "EventPayment"
    ADD CONSTRAINT "EventPayment_eventBookingId_fkey"
    FOREIGN KEY ("eventBookingId")
    REFERENCES "EventBooking"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;
