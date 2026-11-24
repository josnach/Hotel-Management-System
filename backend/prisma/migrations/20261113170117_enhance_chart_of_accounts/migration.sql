-- Add account creation timestamp and description.
ALTER TABLE "Account"
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "description" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3);

-- Backfill existing accounts before making updatedAt required.
UPDATE "Account"
SET "updatedAt" = CURRENT_TIMESTAMP
WHERE "updatedAt" IS NULL;

-- Enforce the required column constraint.
ALTER TABLE "Account"
ALTER COLUMN "updatedAt" SET NOT NULL;