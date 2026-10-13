-- AlterTable
ALTER TABLE "DriverBonus" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3),
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "stripeAccountId" TEXT,
ADD COLUMN     "stripeTransferId" TEXT;

-- CreateIndex
CREATE INDEX "DriverBonus_status_nextAttemptAt_idx" ON "DriverBonus"("status", "nextAttemptAt");
