-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "offerId" TEXT;

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "paidWithTripId" TEXT;

-- CreateIndex
CREATE INDEX "Payment_offerId_idx" ON "Payment"("offerId");
