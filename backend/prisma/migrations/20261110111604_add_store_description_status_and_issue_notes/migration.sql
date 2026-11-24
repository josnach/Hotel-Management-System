-- AlterTable
ALTER TABLE "StockIssue" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "description" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;
