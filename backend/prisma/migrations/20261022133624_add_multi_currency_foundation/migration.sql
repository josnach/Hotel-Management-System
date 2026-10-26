-- CreateTable
CREATE TABLE "Currency" (
    "code" VARCHAR(3) NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decimalPlaces" INTEGER NOT NULL DEFAULT 2,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL,
    "fromCurrencyCode" VARCHAR(3) NOT NULL,
    "toCurrencyCode" VARCHAR(3) NOT NULL,
    "rate" DECIMAL(20,10) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Currency_isActive_name_idx" ON "Currency"("isActive", "name");

-- CreateIndex
CREATE INDEX "FxRate_fromCurrencyCode_toCurrencyCode_effectiveFrom_idx" ON "FxRate"("fromCurrencyCode", "toCurrencyCode", "effectiveFrom");

-- CreateIndex
CREATE INDEX "FxRate_createdAt_idx" ON "FxRate"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FxRate_fromCurrencyCode_toCurrencyCode_effectiveFrom_key" ON "FxRate"("fromCurrencyCode", "toCurrencyCode", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "FxRate" ADD CONSTRAINT "FxRate_fromCurrencyCode_fkey" FOREIGN KEY ("fromCurrencyCode") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FxRate" ADD CONSTRAINT "FxRate_toCurrencyCode_fkey" FOREIGN KEY ("toCurrencyCode") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
