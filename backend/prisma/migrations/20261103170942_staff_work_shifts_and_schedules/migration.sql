-- CreateEnum
CREATE TYPE "StaffWorkShiftStatus" AS ENUM ('OPEN', 'EXPIRED', 'CLOSED');

-- CreateEnum
CREATE TYPE "StaffWorkLocationType" AS ENUM ('SALES_POINT', 'RECEPTION_DESK');

-- CreateEnum
CREATE TYPE "StaffShiftWeekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateTable
CREATE TABLE "StaffWorkShift" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleAtStart" "UserRole" NOT NULL,
    "scheduleId" TEXT,
    "workLocationId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledEndAt" TIMESTAMP(3) NOT NULL,
    "graceEndsAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "closeNote" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "graceMinutes" INTEGER NOT NULL DEFAULT 30,
    "status" "StaffWorkShiftStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffWorkShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffWorkLocation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "StaffWorkLocationType" NOT NULL,
    "salesPointId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffWorkLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffShiftSchedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekday" "StaffShiftWeekday" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "graceMinutes" INTEGER NOT NULL DEFAULT 30,
    "workLocationId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffShiftSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffShiftDateOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "isDayOff" BOOLEAN NOT NULL DEFAULT false,
    "startTime" TEXT,
    "endTime" TEXT,
    "graceMinutes" INTEGER,
    "workLocationId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffShiftDateOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffWorkShift_userId_status_idx" ON "StaffWorkShift"("userId", "status");

-- CreateIndex
CREATE INDEX "StaffWorkShift_startedAt_idx" ON "StaffWorkShift"("startedAt");

-- CreateIndex
CREATE INDEX "StaffWorkShift_scheduledEndAt_idx" ON "StaffWorkShift"("scheduledEndAt");

-- CreateIndex
CREATE INDEX "StaffWorkShift_scheduleId_idx" ON "StaffWorkShift"("scheduleId");

-- CreateIndex
CREATE INDEX "StaffWorkShift_workLocationId_idx" ON "StaffWorkShift"("workLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffWorkLocation_name_key" ON "StaffWorkLocation"("name");

-- CreateIndex
CREATE UNIQUE INDEX "StaffWorkLocation_salesPointId_key" ON "StaffWorkLocation"("salesPointId");

-- CreateIndex
CREATE INDEX "StaffWorkLocation_type_isActive_idx" ON "StaffWorkLocation"("type", "isActive");

-- CreateIndex
CREATE INDEX "StaffShiftSchedule_userId_weekday_isActive_idx" ON "StaffShiftSchedule"("userId", "weekday", "isActive");

-- CreateIndex
CREATE INDEX "StaffShiftSchedule_effectiveFrom_effectiveTo_idx" ON "StaffShiftSchedule"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "StaffShiftSchedule_workLocationId_idx" ON "StaffShiftSchedule"("workLocationId");

-- CreateIndex
CREATE INDEX "StaffShiftDateOverride_date_idx" ON "StaffShiftDateOverride"("date");

-- CreateIndex
CREATE UNIQUE INDEX "StaffShiftDateOverride_userId_date_key" ON "StaffShiftDateOverride"("userId", "date");

-- AddForeignKey
ALTER TABLE "StaffWorkShift" ADD CONSTRAINT "StaffWorkShift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffWorkShift" ADD CONSTRAINT "StaffWorkShift_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffWorkShift" ADD CONSTRAINT "StaffWorkShift_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "StaffShiftSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffWorkShift" ADD CONSTRAINT "StaffWorkShift_workLocationId_fkey" FOREIGN KEY ("workLocationId") REFERENCES "StaffWorkLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffWorkLocation" ADD CONSTRAINT "StaffWorkLocation_salesPointId_fkey" FOREIGN KEY ("salesPointId") REFERENCES "SalesPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffShiftSchedule" ADD CONSTRAINT "StaffShiftSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffShiftSchedule" ADD CONSTRAINT "StaffShiftSchedule_workLocationId_fkey" FOREIGN KEY ("workLocationId") REFERENCES "StaffWorkLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffShiftDateOverride" ADD CONSTRAINT "StaffShiftDateOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffShiftDateOverride" ADD CONSTRAINT "StaffShiftDateOverride_workLocationId_fkey" FOREIGN KEY ("workLocationId") REFERENCES "StaffWorkLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Ensure each employee can have only one open staff work shift.
-- Different employees can have open shifts simultaneously.
CREATE UNIQUE INDEX "StaffWorkShift_one_open_per_user_key"
ON "StaffWorkShift" ("userId")
WHERE "status" = 'OPEN';