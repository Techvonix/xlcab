-- CreateTable
CREATE TABLE "OperatorProfile" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'independent',
    "legalName" TEXT,
    "siret" TEXT,
    "transportLicense" TEXT,
    "cities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "perSeatAllowed" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringLine" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "originAddress" TEXT NOT NULL,
    "originLat" DOUBLE PRECISION NOT NULL,
    "originLng" DOUBLE PRECISION NOT NULL,
    "destinationAddress" TEXT NOT NULL,
    "destinationLat" DOUBLE PRECISION NOT NULL,
    "destinationLng" DOUBLE PRECISION NOT NULL,
    "pickupRadiusKm" INTEGER NOT NULL DEFAULT 5,
    "departureTime" TEXT NOT NULL,
    "returnTime" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "jurisdiction" TEXT NOT NULL DEFAULT 'FR',
    "daysOfWeek" INTEGER[],
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "seats" INTEGER NOT NULL,
    "luggage" INTEGER NOT NULL,
    "pricingMode" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "durationMin" INTEGER,
    "conditions" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "RecurringLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineException" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "seats" INTEGER,
    "reason" TEXT,

    CONSTRAINT "LineException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineDeparture" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "localDate" TEXT NOT NULL,
    "departureAt" TIMESTAMP(3) NOT NULL,
    "seatsTotal" INTEGER NOT NULL,
    "seatsBooked" INTEGER NOT NULL DEFAULT 0,
    "priceCents" INTEGER NOT NULL,
    "pricingMode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'to_confirm',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineDeparture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringLine_operatorId_idx" ON "RecurringLine"("operatorId");

-- CreateIndex
CREATE UNIQUE INDEX "LineException_lineId_date_key" ON "LineException"("lineId", "date");

-- CreateIndex
CREATE INDEX "LineDeparture_localDate_status_idx" ON "LineDeparture"("localDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LineDeparture_lineId_direction_localDate_key" ON "LineDeparture"("lineId", "direction", "localDate");
