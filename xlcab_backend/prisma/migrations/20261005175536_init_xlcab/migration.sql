-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "jurisdiction" TEXT NOT NULL DEFAULT 'FR',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "stripeCustomerId" TEXT,
    "firebaseUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "termsAcceptedAt" TIMESTAMP(3),
    "termsVersion" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "passengerId" TEXT,
    "driverId" TEXT,
    "vehicleId" TEXT,
    "shuttleType" TEXT NOT NULL,
    "originAddress" TEXT NOT NULL,
    "originLat" DOUBLE PRECISION NOT NULL,
    "originLng" DOUBLE PRECISION NOT NULL,
    "destinationAddress" TEXT NOT NULL,
    "destinationLat" DOUBLE PRECISION NOT NULL,
    "destinationLng" DOUBLE PRECISION NOT NULL,
    "distanceKm" DECIMAL(65,30),
    "durationMin" INTEGER,
    "scheduledAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "cancellationFeeCents" INTEGER,
    "totalPriceCents" INTEGER,
    "vatCents" INTEGER NOT NULL DEFAULT 0,
    "jurisdiction" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "corporateId" TEXT,
    "costCenter" TEXT,
    "bookedById" TEXT,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripPriceLine" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "regime" TEXT NOT NULL,
    "baseCents" INTEGER NOT NULL,
    "ratePercent" DECIMAL(65,30) NOT NULL,
    "vatCents" INTEGER NOT NULL,

    CONSTRAINT "TripPriceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingPoint" (
    "id" BIGSERIAL NOT NULL,
    "tripId" TEXT NOT NULL,
    "driverId" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "heading" DOUBLE PRECISION,
    "speedKmh" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverProfile" (
    "id" TEXT NOT NULL,
    "licenseNumber" TEXT,
    "licenseExpiry" TIMESTAMP(3),
    "vtcCardNumber" TEXT,
    "vtcCardExpiry" TIMESTAMP(3),
    "revtcNumber" TEXT,
    "pmrTrained" BOOLEAN NOT NULL DEFAULT false,
    "roseEligible" BOOLEAN NOT NULL DEFAULT false,
    "languages" TEXT[] DEFAULT ARRAY['fr']::TEXT[],
    "rating" DECIMAL(65,30) NOT NULL DEFAULT 5.00,
    "totalTrips" INTEGER NOT NULL DEFAULT 0,
    "preferredShuttle" TEXT,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "documentsVerified" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "DriverProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "driverId" TEXT,
    "shuttleType" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "plate" TEXT NOT NULL,
    "color" TEXT,
    "capacity" INTEGER NOT NULL,
    "pmrEquipped" BOOLEAN NOT NULL DEFAULT false,
    "dashcamActive" BOOLEAN NOT NULL DEFAULT false,
    "insuranceExpiry" TIMESTAMP(3),
    "technicalControlExpiry" TIMESTAMP(3),
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "jurisdiction" TEXT NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PassengerBooking" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "childSeats" INTEGER NOT NULL DEFAULT 0,
    "wifiRequested" BOOLEAN NOT NULL DEFAULT false,
    "extraLuggage" BOOLEAN NOT NULL DEFAULT false,
    "petsAllowed" BOOLEAN NOT NULL DEFAULT false,
    "qrCode" TEXT NOT NULL,
    "checkedIn" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "PassengerBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorporateAccount" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "vatNumber" TEXT,
    "siret" TEXT,
    "billingEmail" TEXT,
    "billingAddress" TEXT,
    "costCenter" TEXT,
    "monthlyLimitCents" INTEGER,
    "jurisdiction" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorporateAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorporateMember" (
    "id" TEXT NOT NULL,
    "corporateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "monthlyLimitCents" INTEGER,
    "costCenter" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorporateMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tripId" TEXT,
    "userId" TEXT,
    "stripePaymentIntentId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" TEXT NOT NULL,
    "method" TEXT,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwoFactorAuth" (
    "userId" TEXT NOT NULL,
    "secretEnc" TEXT NOT NULL,
    "enabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactorAuth_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JurisdictionConfig" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vatPassengerRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "vatParcelRate" DECIMAL(65,30) NOT NULL DEFAULT 20,
    "requiresRevtc" BOOLEAN NOT NULL DEFAULT false,
    "requiresVtcCard" BOOLEAN NOT NULL DEFAULT false,
    "minTripKm" INTEGER NOT NULL DEFAULT 0,
    "financialGuaranteePerVehicleCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "leadDpa" TEXT,
    "legalTexts" JSONB,

    CONSTRAINT "JurisdictionConfig_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "ParcelBooking" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "senderId" TEXT,
    "carrierTripId" TEXT,
    "onReturnLeg" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL,
    "recipientName" TEXT,
    "recipientPhone" TEXT,
    "weightKg" DECIMAL(65,30),
    "lengthCm" INTEGER,
    "widthCm" INTEGER,
    "heightCm" INTEGER,
    "isFragile" BOOLEAN NOT NULL DEFAULT false,
    "photoKey" TEXT,
    "proofOfDeliveryKey" TEXT,
    "qrCode" TEXT NOT NULL,
    "deliveryCode" TEXT NOT NULL,
    "requiresSignature" BOOLEAN NOT NULL DEFAULT false,
    "insured" BOOLEAN NOT NULL DEFAULT false,
    "insuranceValueCents" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "failureReason" TEXT,
    "pickedUpAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParcelBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");

-- CreateIndex
CREATE INDEX "Trip_corporateId_scheduledAt_idx" ON "Trip"("corporateId", "scheduledAt");

-- CreateIndex
CREATE INDEX "TripPriceLine_tripId_idx" ON "TripPriceLine"("tripId");

-- CreateIndex
CREATE INDEX "TrackingPoint_tripId_recordedAt_idx" ON "TrackingPoint"("tripId", "recordedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_plate_key" ON "Vehicle"("plate");

-- CreateIndex
CREATE INDEX "Vehicle_driverId_idx" ON "Vehicle"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "PassengerBooking_tripId_key" ON "PassengerBooking"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "PassengerBooking_qrCode_key" ON "PassengerBooking"("qrCode");

-- CreateIndex
CREATE UNIQUE INDEX "DriverDocument_storageKey_key" ON "DriverDocument"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "DriverDocument_userId_type_key" ON "DriverDocument"("userId", "type");

-- CreateIndex
CREATE INDEX "CorporateMember_userId_idx" ON "CorporateMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CorporateMember_corporateId_userId_key" ON "CorporateMember"("corporateId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "Payment_tripId_idx" ON "Payment"("tripId");

-- CreateIndex
CREATE INDEX "Incident_status_createdAt_idx" ON "Incident"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ParcelBooking_tripId_key" ON "ParcelBooking"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "ParcelBooking_qrCode_key" ON "ParcelBooking"("qrCode");

-- CreateIndex
CREATE INDEX "ParcelBooking_carrierTripId_idx" ON "ParcelBooking"("carrierTripId");

-- CreateIndex
CREATE INDEX "ParcelBooking_senderId_idx" ON "ParcelBooking"("senderId");

-- AddForeignKey
ALTER TABLE "TripPriceLine" ADD CONSTRAINT "TripPriceLine_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassengerBooking" ADD CONSTRAINT "PassengerBooking_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelBooking" ADD CONSTRAINT "ParcelBooking_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
