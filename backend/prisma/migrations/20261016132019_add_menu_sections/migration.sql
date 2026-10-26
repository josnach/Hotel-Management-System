/*
  Warnings:

  - A unique constraint covering the columns `[section,name]` on the table `InventoryCategory` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "MenuSection" AS ENUM ('FOOD', 'DRINKS', 'PASTRIES');

-- DropIndex
DROP INDEX "InventoryCategory_name_key";

-- AlterTable
ALTER TABLE "InventoryCategory" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "section" "MenuSection" NOT NULL DEFAULT 'FOOD',
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCategory_section_name_key" ON "InventoryCategory"("section", "name");
