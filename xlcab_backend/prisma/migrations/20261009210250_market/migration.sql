-- CreateTable
CREATE TABLE "TransportRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "partnerRef" TEXT,
    "originAddress" TEXT NOT NULL,
    "originLat" DOUBLE PRECISION NOT NULL,
    "originLng" DOUBLE PRECISION NOT NULL,
    "destinationAddress" TEXT NOT NULL,
    "destinationLat" DOUBLE PRECISION NOT NULL,
    "destinationLng" DOUBLE PRECISION NOT NULL,
    "departureAt" TIMESTAMP(3) NOT NULL,
    "flexMin" INTEGER NOT NULL DEFAULT 0,
    "returnAt" TIMESTAMP(3),
    "passengers" INTEGER NOT NULL,
    "luggage" INTEGER NOT NULL DEFAULT 0,
    "accessible" BOOLEAN NOT NULL DEFAULT false,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "frequency" TEXT,
    "budgetCents" INTEGER,
    "needs" TEXT,
    "comment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedOfferId" TEXT,
    "tripId" TEXT,
    "returnTripId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportOffer" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "pickupAt" TIMESTAMP(3) NOT NULL,
    "includesReturn" BOOLEAN NOT NULL DEFAULT false,
    "conditions" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "validUntil" TIMESTAMP(3) NOT NULL,
    "confirmDeadline" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferMessage" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransportRequest_status_departureAt_idx" ON "TransportRequest"("status", "departureAt");

-- CreateIndex
CREATE INDEX "TransportRequest_requesterId_idx" ON "TransportRequest"("requesterId");

-- CreateIndex
CREATE INDEX "TransportOffer_operatorId_status_idx" ON "TransportOffer"("operatorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TransportOffer_requestId_operatorId_key" ON "TransportOffer"("requestId", "operatorId");

-- CreateIndex
CREATE INDEX "OfferMessage_offerId_createdAt_idx" ON "OfferMessage"("offerId", "createdAt");
