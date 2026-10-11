-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "tripId" TEXT,
    "corporateId" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "tripIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customerUserId" TEXT,
    "seller" JSONB NOT NULL,
    "buyer" JSONB NOT NULL,
    "lines" JSONB NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "vatCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "paymentStatus" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "creditedInvoiceId" TEXT,
    "pdfKey" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceCounter" (
    "key" TEXT NOT NULL,
    "last" INTEGER NOT NULL,

    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_customerUserId_issuedAt_idx" ON "Invoice"("customerUserId", "issuedAt");

-- CreateIndex
CREATE INDEX "Invoice_corporateId_periodStart_idx" ON "Invoice"("corporateId", "periodStart");

-- CreateIndex
CREATE INDEX "Invoice_tripId_idx" ON "Invoice"("tripId");
