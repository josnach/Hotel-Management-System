-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "accountNumber" TEXT,
ADD COLUMN     "annualRent" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "housingAllowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "nhfEnrolled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "otherAllowances" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "otherAnnualReliefs" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "pensionEnrolled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pfaName" TEXT,
ADD COLUMN     "rentProofOnFile" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rsaPin" TEXT,
ADD COLUMN     "stateOfResidence" TEXT,
ADD COLUMN     "tin" TEXT,
ADD COLUMN     "transportAllowance" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "creditLimit" DECIMAL(14,2),
ADD COLUMN     "paymentTermsDays" INTEGER;

-- AlterTable
ALTER TABLE "PayrollPeriod" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "configSnapshot" JSONB,
ADD COLUMN     "paidAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN     "basic" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "bonus" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "deductionNote" TEXT,
ADD COLUMN     "housing" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "itf" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "nhf" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "nsitf" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "otherAllow" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "otherDeductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paye" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "pensionEmployee" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "pensionEmployer" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "rentRelief" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxableAnnual" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "transport" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PayrollRemittance" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "userId" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollRemittance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Generator" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "litresPerHour" DECIMAL(8,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Generator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratorRun" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "generatorId" TEXT NOT NULL,
    "hours" DECIMAL(6,2) NOT NULL,
    "notes" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratorRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TankDip" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "litres" DECIMAL(12,2) NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TankDip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DieselPurchase" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "litres" DECIMAL(12,2) NOT NULL,
    "pricePerLitre" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "supplier" TEXT,
    "paidFrom" TEXT NOT NULL,
    "reference" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DieselPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollRemittance_periodId_idx" ON "PayrollRemittance"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "Generator_name_key" ON "Generator"("name");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratorRun_date_generatorId_key" ON "GeneratorRun"("date", "generatorId");

-- CreateIndex
CREATE UNIQUE INDEX "TankDip_date_key" ON "TankDip"("date");

-- CreateIndex
CREATE INDEX "DieselPurchase_date_idx" ON "DieselPurchase"("date");

-- CreateIndex
CREATE INDEX "Payslip_periodId_idx" ON "Payslip"("periodId");

-- AddForeignKey
ALTER TABLE "PayrollRemittance" ADD CONSTRAINT "PayrollRemittance_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratorRun" ADD CONSTRAINT "GeneratorRun_generatorId_fkey" FOREIGN KEY ("generatorId") REFERENCES "Generator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
