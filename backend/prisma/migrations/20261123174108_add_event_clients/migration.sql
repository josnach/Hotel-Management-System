-- CreateEnum
CREATE TYPE "EventClientType" AS ENUM ('INDIVIDUAL', 'CORPORATE');

-- AlterTable
ALTER TABLE "EventBooking" ADD COLUMN     "clientId" TEXT;

-- CreateTable
CREATE TABLE "EventClient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EventClientType" NOT NULL DEFAULT 'INDIVIDUAL',
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "groupId" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventClient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventClient_name_idx" ON "EventClient"("name");

-- CreateIndex
CREATE INDEX "EventClient_phone_idx" ON "EventClient"("phone");

-- CreateIndex
CREATE INDEX "EventClient_email_idx" ON "EventClient"("email");

-- CreateIndex
CREATE INDEX "EventClient_type_idx" ON "EventClient"("type");

-- CreateIndex
CREATE INDEX "EventClient_groupId_idx" ON "EventClient"("groupId");

-- CreateIndex
CREATE INDEX "EventClient_isActive_idx" ON "EventClient"("isActive");

-- CreateIndex
CREATE INDEX "EventBooking_clientId_idx" ON "EventBooking"("clientId");

-- AddForeignKey
ALTER TABLE "EventBooking" ADD CONSTRAINT "EventBooking_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "EventClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventClient" ADD CONSTRAINT "EventClient_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
