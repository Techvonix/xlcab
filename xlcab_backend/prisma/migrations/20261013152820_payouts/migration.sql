-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "paymentId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "stripeTransferId" TEXT,
    "stripeAccountId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payout_tripId_key" ON "Payout"("tripId");

-- CreateIndex
CREATE INDEX "Payout_driverId_createdAt_idx" ON "Payout"("driverId", "createdAt");

-- CreateIndex
CREATE INDEX "Payout_status_nextAttemptAt_idx" ON "Payout"("status", "nextAttemptAt");
