-- AlterTable
ALTER TABLE "JurisdictionConfig" ADD COLUMN     "lineThresholdDeadlineHours" INTEGER NOT NULL DEFAULT 24;

-- AlterTable
ALTER TABLE "LineDeparture" ADD COLUMN     "guaranteedAt" TIMESTAMP(3),
ADD COLUMN     "minPassengers" INTEGER,
ADD COLUMN     "thresholdMissedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RecurringLine" ADD COLUMN     "minPassengers" INTEGER;
