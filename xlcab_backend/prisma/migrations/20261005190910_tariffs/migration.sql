-- CreateTable
CREATE TABLE "Tariff" (
    "id" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "ratesPerKm" JSONB NOT NULL,
    "childSeatCents" INTEGER NOT NULL,
    "wifiCents" INTEGER NOT NULL,
    "extraLuggageCents" INTEGER NOT NULL,
    "parcelFeeCents" INTEGER NOT NULL,
    "sharedParcelCents" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tariff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tariff_jurisdiction_effectiveFrom_idx" ON "Tariff"("jurisdiction", "effectiveFrom");
