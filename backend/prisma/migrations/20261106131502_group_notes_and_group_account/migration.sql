-- AlterTable
ALTER TABLE "Folio" ADD COLUMN     "isGroupAccount" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "notes" TEXT;

-- CreateIndex
CREATE INDEX "Folio_groupId_idx" ON "Folio"("groupId");
