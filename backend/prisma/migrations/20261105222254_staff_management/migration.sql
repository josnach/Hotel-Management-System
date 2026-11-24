/*
  Warnings:

  - A unique constraint covering the columns `[staffId]` on the table `Employee` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email]` on the table `Employee` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "accountName" TEXT,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "altPhone" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "compLimit" DECIMAL(14,2) NOT NULL DEFAULT 50000,
ADD COLUMN     "confirmationDate" TIMESTAMP(3),
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "email" TEXT,
ADD COLUMN     "emergencyName" TEXT,
ADD COLUMN     "emergencyPhone" TEXT,
ADD COLUMN     "emergencyRelationship" TEXT,
ADD COLUMN     "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "hireDate" TIMESTAMP(3),
ADD COLUMN     "hourlyRate" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "mealAllowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "middleName" TEXT,
ADD COLUMN     "staffId" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "supervisorId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "Employee_staffId_key" ON "Employee"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE INDEX "Employee_department_idx" ON "Employee"("department");

-- CreateIndex
CREATE INDEX "Employee_isActive_idx" ON "Employee"("isActive");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
