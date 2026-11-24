-- CreateEnum
CREATE TYPE "PaymentVoucherStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "CityLedgerEntry" ADD COLUMN "folioId" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrder"
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "approvedById" TEXT,
ADD COLUMN "createdById" TEXT,
ADD COLUMN "expectedDelivery" TIMESTAMP(3),
ADD COLUMN "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "submittedAt" TIMESTAMP(3),
ADD COLUMN "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "supplierAddress" TEXT,
ADD COLUMN "supplierContact" TEXT,
ADD COLUMN "terms" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "vatAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "description" TEXT;

-- AlterTable
ALTER TABLE "Supplier"
ADD COLUMN "accountName" TEXT,
ADD COLUMN "accountNumber" TEXT,
ADD COLUMN "address" TEXT,
ADD COLUMN "altPhone" TEXT,
ADD COLUMN "bankName" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "code" TEXT,
ADD COLUMN "contactPerson" TEXT,
ADD COLUMN "country" TEXT NOT NULL DEFAULT 'Nigeria',
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notes" TEXT,
ADD COLUMN "paymentTerms" TEXT,
ADD COLUMN "postalCode" TEXT,
ADD COLUMN "state" TEXT,
ADD COLUMN "taxId" TEXT;

-- CreateTable
CREATE TABLE "PaymentVoucher" (
    "id" TEXT NOT NULL,
    "voucherNo" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "payeeType" TEXT NOT NULL,
    "payeeName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "debitAccountId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "status" "PaymentVoucherStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidById" TEXT,
    "paidAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "journalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentVoucherItem" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "accountCode" TEXT,

    CONSTRAINT "PaymentVoucherItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentVoucher_voucherNo_key" ON "PaymentVoucher"("voucherNo");

-- CreateIndex
CREATE INDEX "PaymentVoucher_status_transactionDate_idx" ON "PaymentVoucher"("status", "transactionDate");

-- CreateIndex
CREATE INDEX "PaymentVoucher_payeeType_idx" ON "PaymentVoucher"("payeeType");

-- CreateIndex
CREATE INDEX "PaymentVoucherItem_voucherId_idx" ON "PaymentVoucherItem"("voucherId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_orderDate_idx" ON "PurchaseOrder"("status", "orderDate");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");

-- AddForeignKey
ALTER TABLE "PaymentVoucher"
ADD CONSTRAINT "PaymentVoucher_debitAccountId_fkey"
FOREIGN KEY ("debitAccountId") REFERENCES "Account"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentVoucher"
ADD CONSTRAINT "PaymentVoucher_creditAccountId_fkey"
FOREIGN KEY ("creditAccountId") REFERENCES "Account"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentVoucherItem"
ADD CONSTRAINT "PaymentVoucherItem_voucherId_fkey"
FOREIGN KEY ("voucherId") REFERENCES "PaymentVoucher"("id")
ON DELETE CASCADE ON UPDATE CASCADE;