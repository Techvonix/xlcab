-- AlterTable
ALTER TABLE "UserPreference" ADD COLUMN     "autoShareTrips" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TrustedContact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustedContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripShare" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "TripShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrustedContact_userId_idx" ON "TrustedContact"("userId");

-- CreateIndex
CREATE INDEX "TripShare_tripId_userId_idx" ON "TripShare"("tripId", "userId");
