-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "menuProductId" TEXT;

-- CreateTable
CREATE TABLE "MenuProduct" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "sellPrice" DECIMAL(14,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MenuProduct_categoryId_idx" ON "MenuProduct"("categoryId");

-- CreateIndex
CREATE INDEX "MenuProduct_name_idx" ON "MenuProduct"("name");

-- CreateIndex
CREATE INDEX "InventoryItem_menuProductId_idx" ON "InventoryItem"("menuProductId");

-- AddForeignKey
ALTER TABLE "MenuProduct" ADD CONSTRAINT "MenuProduct_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "InventoryCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_menuProductId_fkey" FOREIGN KEY ("menuProductId") REFERENCES "MenuProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
