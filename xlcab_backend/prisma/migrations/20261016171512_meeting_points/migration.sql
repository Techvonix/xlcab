-- AlterTable
ALTER TABLE "PassengerBooking" ADD COLUMN     "alightStopId" TEXT,
ADD COLUMN     "boardStopId" TEXT;

-- CreateTable
CREATE TABLE "MeetingPoint" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "instructions" TEXT,
    "transit" TEXT,
    "jurisdiction" TEXT NOT NULL DEFAULT 'FR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineStop" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "meetingPointId" TEXT NOT NULL,
    "offsetMin" INTEGER NOT NULL,
    "fareFromOriginCents" INTEGER NOT NULL,

    CONSTRAINT "LineStop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingPoint_city_idx" ON "MeetingPoint"("city");

-- CreateIndex
CREATE INDEX "LineStop_lineId_idx" ON "LineStop"("lineId");

-- CreateIndex
CREATE UNIQUE INDEX "LineStop_lineId_position_key" ON "LineStop"("lineId", "position");
