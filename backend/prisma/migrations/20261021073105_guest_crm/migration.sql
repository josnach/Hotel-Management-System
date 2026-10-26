-- AlterTable
ALTER TABLE "Guest" ADD COLUMN     "birthDay" INTEGER,
ADD COLUMN     "birthMonth" INTEGER,
ADD COLUMN     "blacklistReason" TEXT,
ADD COLUMN     "blacklistedAt" TIMESTAMP(3),
ADD COLUMN     "blacklistedById" TEXT,
ADD COLUMN     "isBlacklisted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isVip" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "preferences" TEXT,
ADD COLUMN     "vipNote" TEXT;

-- CreateIndex
CREATE INDEX "Guest_isBlacklisted_idx" ON "Guest"("isBlacklisted");
