-- AlterTable
ALTER TABLE "DriverPenalty" ADD COLUMN     "collectedAt" TIMESTAMP(3),
ADD COLUMN     "collectedCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payout" ADD COLUMN     "grossCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "withheldCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PayoutDeduction" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "penaltyId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayoutDeduction_payoutId_idx" ON "PayoutDeduction"("payoutId");

-- CreateIndex
CREATE INDEX "PayoutDeduction_penaltyId_idx" ON "PayoutDeduction"("penaltyId");

-- CreateIndex
CREATE INDEX "DriverPenalty_driverId_status_idx" ON "DriverPenalty"("driverId", "status");
