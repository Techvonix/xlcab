-- AlterTable
ALTER TABLE "LineDeparture" ADD COLUMN     "driverId" TEXT,
ADD COLUMN     "driverReadyAt" TIMESTAMP(3),
ADD COLUMN     "rescueStage" TEXT,
ADD COLUMN     "rescueStatus" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "vehicleId" TEXT;

-- AlterTable
ALTER TABLE "OperatorProfile" ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "commissionCents" INTEGER,
ADD COLUMN     "lineDepartureId" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'instant';

-- CreateTable
CREATE TABLE "LineBackup" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "LineBackup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RescueOffer" (
    "id" TEXT NOT NULL,
    "departureId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RescueOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverCancellation" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "departureId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "reason" TEXT,
    "minutesBefore" INTEGER NOT NULL,
    "lastMinute" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,
    "justification" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverCancellation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverPenalty" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "cancellationId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "contestUntil" TIMESTAMP(3) NOT NULL,
    "contestReason" TEXT,
    "decidedBy" TEXT,
    "decisionReason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverPenalty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverBonus" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "departureId" TEXT NOT NULL,
    "penaltyId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverBonus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PassengerCredit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tripId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PassengerCredit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LineBackup_driverId_idx" ON "LineBackup"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "LineBackup_lineId_rank_key" ON "LineBackup"("lineId", "rank");

-- CreateIndex
CREATE INDEX "RescueOffer_departureId_idx" ON "RescueOffer"("departureId");

-- CreateIndex
CREATE INDEX "RescueOffer_driverId_status_idx" ON "RescueOffer"("driverId", "status");

-- CreateIndex
CREATE INDEX "DriverCancellation_driverId_createdAt_idx" ON "DriverCancellation"("driverId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DriverPenalty_cancellationId_key" ON "DriverPenalty"("cancellationId");

-- CreateIndex
CREATE INDEX "DriverPenalty_status_contestUntil_idx" ON "DriverPenalty"("status", "contestUntil");

-- CreateIndex
CREATE INDEX "DriverBonus_driverId_idx" ON "DriverBonus"("driverId");

-- CreateIndex
CREATE INDEX "PassengerCredit_userId_idx" ON "PassengerCredit"("userId");

-- CreateIndex
CREATE INDEX "Trip_lineDepartureId_idx" ON "Trip"("lineDepartureId");
