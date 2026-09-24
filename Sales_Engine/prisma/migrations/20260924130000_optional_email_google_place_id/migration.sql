-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "googlePlaceId" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Lead_googlePlaceId_key" ON "Lead"("googlePlaceId");

