-- CreateTable
CREATE TABLE "LineSeat" (
    "id" TEXT NOT NULL,
    "departureId" TEXT NOT NULL,
    "seatNumber" INTEGER NOT NULL,
    "tripId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineSeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LineSeat_tripId_idx" ON "LineSeat"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "LineSeat_departureId_seatNumber_key" ON "LineSeat"("departureId", "seatNumber");
