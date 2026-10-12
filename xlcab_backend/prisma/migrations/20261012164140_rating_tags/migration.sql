-- AlterTable
ALTER TABLE "TripRating" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
