-- CreateTable
CREATE TABLE "GuestDocument" (
    "id" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "category" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuestDocument_storageKey_key" ON "GuestDocument"("storageKey");

-- CreateIndex
CREATE INDEX "GuestDocument_guestId_createdAt_idx" ON "GuestDocument"("guestId", "createdAt");

-- CreateIndex
CREATE INDEX "GuestDocument_uploadedById_idx" ON "GuestDocument"("uploadedById");

-- CreateIndex
CREATE INDEX "GuestDocument_category_idx" ON "GuestDocument"("category");

-- AddForeignKey
ALTER TABLE "GuestDocument" ADD CONSTRAINT "GuestDocument_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestDocument" ADD CONSTRAINT "GuestDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
