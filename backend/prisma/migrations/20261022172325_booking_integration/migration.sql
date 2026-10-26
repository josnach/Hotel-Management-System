-- CreateEnum
CREATE TYPE "ReservationSyncStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'SYNCED', 'FAILED');

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "syncStatus" "ReservationSyncStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ALTER COLUMN "updatedAt" DROP DEFAULT;
