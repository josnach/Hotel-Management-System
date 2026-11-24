-- CreateTable
CREATE TABLE "SalesPointMenuAvailability" (
    "id" TEXT NOT NULL,
    "salesPointId" TEXT NOT NULL,
    "menuProductId" TEXT NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesPointMenuAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesPointMenuAvailability_menuProductId_idx" ON "SalesPointMenuAvailability"("menuProductId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesPointMenuAvailability_salesPointId_menuProductId_key" ON "SalesPointMenuAvailability"("salesPointId", "menuProductId");

-- AddForeignKey
ALTER TABLE "SalesPointMenuAvailability" ADD CONSTRAINT "SalesPointMenuAvailability_salesPointId_fkey" FOREIGN KEY ("salesPointId") REFERENCES "SalesPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesPointMenuAvailability" ADD CONSTRAINT "SalesPointMenuAvailability_menuProductId_fkey" FOREIGN KEY ("menuProductId") REFERENCES "MenuProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
