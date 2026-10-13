-- CreateTable
CREATE TABLE "PayoutAccount" (
    "userId" TEXT NOT NULL,
    "stripeAccountId" TEXT NOT NULL,
    "detailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "transfersActive" BOOLEAN NOT NULL DEFAULT false,
    "requirementsDue" INTEGER NOT NULL DEFAULT 0,
    "disabledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutAccount_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayoutAccount_stripeAccountId_key" ON "PayoutAccount"("stripeAccountId");
