-- DropIndex
DROP INDEX "LineSeat_departureId_seatNumber_key";

-- AlterTable
ALTER TABLE "LineSeat" ADD COLUMN     "fromIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "toIndex" INTEGER;

-- CreateIndex
CREATE INDEX "LineSeat_departureId_seatNumber_idx" ON "LineSeat"("departureId", "seatNumber");
