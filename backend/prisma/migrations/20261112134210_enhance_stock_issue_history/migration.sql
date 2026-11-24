
/*
  Enhance stock issue history.

  Existing records receive generated issue numbers.
  Historical issuer and cost snapshot values remain NULL
  because those values cannot be reliably reconstructed.
*/

-- Step 1: Add issueNo as nullable so existing records are preserved.
ALTER TABLE "StockIssue"
ADD COLUMN "issueNo" TEXT,
ADD COLUMN "issuedById" TEXT,
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'COMPLETED',
ADD COLUMN "totalValue" DECIMAL(14,2),
ADD COLUMN "unitCostSnapshot" DECIMAL(14,2),
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Step 2: Generate unique issue numbers for existing records.
-- Format: ISS-YYYYMMDD-0001
-- Numbering restarts each day.
WITH numbered_issues AS (
    SELECT
        "id",
        TO_CHAR("createdAt", 'YYYYMMDD') AS issue_day,
        ROW_NUMBER() OVER (
            PARTITION BY "createdAt"::date
            ORDER BY "createdAt" ASC, "id" ASC
        ) AS daily_number
    FROM "StockIssue"
)
UPDATE "StockIssue" AS si
SET "issueNo" =
    'ISS-' || ni.issue_day || '-' ||
    LPAD(ni.daily_number::TEXT, 4, '0')
FROM numbered_issues AS ni
WHERE si."id" = ni."id";

-- Step 3: Enforce required issue numbers.
ALTER TABLE "StockIssue"
ALTER COLUMN "issueNo" SET NOT NULL;

-- Step 4: Create indexes.
CREATE UNIQUE INDEX "StockIssue_issueNo_key"
ON "StockIssue"("issueNo");

CREATE INDEX "StockIssue_issuedById_idx"
ON "StockIssue"("issuedById");

CREATE INDEX "StockIssue_createdAt_idx"
ON "StockIssue"("createdAt");

CREATE INDEX "StockIssue_status_idx"
ON "StockIssue"("status");

-- Step 5: Add issuer relationship.
ALTER TABLE "StockIssue"
ADD CONSTRAINT "StockIssue_issuedById_fkey"
FOREIGN KEY ("issuedById")
REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
