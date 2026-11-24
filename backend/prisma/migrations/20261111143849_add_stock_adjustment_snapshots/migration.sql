
/*
  Add historical stock adjustment snapshots and permanent adjustment numbers.
  Existing adjustment records receive unique legacy references before the
  adjustmentNumber column is made mandatory.
*/

-- Add the new columns as nullable first.
ALTER TABLE "StockAdjustment"
ADD COLUMN "adjustmentNumber" TEXT,
ADD COLUMN "quantityAfter" DECIMAL(18,6),
ADD COLUMN "quantityBefore" DECIMAL(18,6),
ADD COLUMN "totalValue" DECIMAL(14,2),
ADD COLUMN "unitCostSnapshot" DECIMAL(14,2);

-- Create the daily adjustment number counter.
CREATE TABLE "AdjustmentNumberCounter" (
    "date" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdjustmentNumberCounter_pkey" PRIMARY KEY ("date")
);

-- Give existing adjustments unique permanent legacy references.
UPDATE "StockAdjustment"
SET "adjustmentNumber" = 'ADJ-LEGACY-' || "id"
WHERE "adjustmentNumber" IS NULL;

-- Make the adjustment number mandatory after backfilling.
ALTER TABLE "StockAdjustment"
ALTER COLUMN "adjustmentNumber" SET NOT NULL;

-- Create indexes.
CREATE UNIQUE INDEX "StockAdjustment_adjustmentNumber_key"
ON "StockAdjustment"("adjustmentNumber");

CREATE INDEX "StockAdjustment_status_createdAt_idx"
ON "StockAdjustment"("status", "createdAt");

CREATE INDEX "StockAdjustment_storeId_createdAt_idx"
ON "StockAdjustment"("storeId", "createdAt");
