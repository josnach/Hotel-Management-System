-- CreateEnum
CREATE TYPE "MsgStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "Guest" ADD COLUMN     "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsappOptInAt" TIMESTAMP(3),
ADD COLUMN     "whatsappOptOutAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MessageOutbox" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "toPhone" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'en',
    "params" JSONB NOT NULL,
    "guestId" TEXT,
    "status" "MsgStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerMsgId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerRecipient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "digestHour" INTEGER NOT NULL DEFAULT 21,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageOutbox_dedupeKey_key" ON "MessageOutbox"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "MessageOutbox_providerMsgId_key" ON "MessageOutbox"("providerMsgId");

-- CreateIndex
CREATE INDEX "MessageOutbox_status_nextAttemptAt_idx" ON "MessageOutbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "MessageOutbox_createdAt_idx" ON "MessageOutbox"("createdAt");
