-- AlterTable
ALTER TABLE "LineDeparture" ADD COLUMN     "parcelsBooked" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RecurringLine" ADD COLUMN     "parcelPriceCents" INTEGER,
ADD COLUMN     "parcelSlots" INTEGER NOT NULL DEFAULT 0;
