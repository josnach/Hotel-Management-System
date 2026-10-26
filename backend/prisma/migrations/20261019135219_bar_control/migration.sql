-- AlterEnum
ALTER TYPE "MovementType" ADD VALUE 'RECIPE_USE';

-- AlterTable
ALTER TABLE "InventoryItem" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,6);

-- AlterTable
ALTER TABLE "StockMovement" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "balance" SET DATA TYPE DECIMAL(18,6);

-- CreateTable
CREATE TABLE "RecipeLine" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "RecipeLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecipeLine_ingredientId_idx" ON "RecipeLine"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeLine_dishId_ingredientId_key" ON "RecipeLine"("dishId", "ingredientId");

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
