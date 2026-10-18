-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "footageAcknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "footageDriverId" TEXT,
ADD COLUMN     "footageRequestedAt" TIMESTAMP(3),
ADD COLUMN     "footageRequestedBy" TEXT;

-- CreateTable
CREATE TABLE "DashcamCharterAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DashcamCharterAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DashcamCharterAcceptance_userId_version_key" ON "DashcamCharterAcceptance"("userId", "version");

-- CreateIndex
CREATE INDEX "Incident_footageDriverId_idx" ON "Incident"("footageDriverId");
