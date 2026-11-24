-- AlterTable
ALTER TABLE "StockReturn" ADD COLUMN     "stockIssueId" TEXT;

-- CreateIndex
CREATE INDEX "StockReturn_stockIssueId_idx" ON "StockReturn"("stockIssueId");

-- AddForeignKey
ALTER TABLE "StockReturn" ADD CONSTRAINT "StockReturn_stockIssueId_fkey" FOREIGN KEY ("stockIssueId") REFERENCES "StockIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssue" ADD CONSTRAINT "StockIssue_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssue" ADD CONSTRAINT "StockIssue_salesPointId_fkey" FOREIGN KEY ("salesPointId") REFERENCES "SalesPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
