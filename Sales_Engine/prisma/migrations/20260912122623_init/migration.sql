-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('PENDING', 'SCRAPED', 'PERSONALIZED', 'SYNCED');

-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('HOTEL', 'RESORT', 'RESTAURANT', 'SERVICE_APARTMENT', 'CONSULTANT', 'EVENT_PLANNER', 'TRAINING_INSTITUTE', 'OTHER');

-- CreateEnum
CREATE TYPE "Classification" AS ENUM ('DIRECT_CUSTOMER', 'CHANNEL_PARTNER');

-- CreateEnum
CREATE TYPE "DecisionMakerTier" AS ENUM ('TIER_1', 'TIER_2', 'TIER_3');

-- CreateTable
CREATE TABLE "Lead" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "hotelName" TEXT,
    "brandType" TEXT,
    "propertySizeCategory" TEXT,
    "company" TEXT,
    "website" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "jobTitle" TEXT,
    "phone" TEXT,
    "linkedinUrl" TEXT,
    "location" TEXT,
    "city" TEXT,
    "state" TEXT,
    "exactAddress" TEXT,
    "googleMapsLink" TEXT,
    "industry" TEXT,
    "project" TEXT,
    "source" TEXT,
    "googleBusinessLink" TEXT,
    "tripAdvisorLink" TEXT,
    "bookingComLink" TEXT,
    "makeMyTripLink" TEXT,
    "instagramLink" TEXT,
    "facebookLink" TEXT,
    "googleRating" DOUBLE PRECISION,
    "totalReviewsCount" INTEGER,
    "sentimentScore" DOUBLE PRECISION,
    "hubspotContactId" TEXT,
    "hubspotCompanyId" TEXT,
    "hubspotSyncStatus" TEXT,
    "hubspotSyncedAt" TIMESTAMP(3),
    "hubspotSyncError" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "scrapedContext" TEXT,
    "icebreaker" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'PENDING',
    "businessType" "BusinessType",
    "classification" "Classification",
    "decisionMakerTier" "DecisionMakerTier",
    "relevanceScore" INTEGER NOT NULL DEFAULT 0,
    "intentScore" INTEGER NOT NULL DEFAULT 0,
    "buyingPowerScore" INTEGER NOT NULL DEFAULT 0,
    "intentSignals" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_relevanceScore_idx" ON "Lead"("relevanceScore");

-- CreateIndex
CREATE INDEX "Lead_decisionMakerTier_idx" ON "Lead"("decisionMakerTier");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_email_website_key" ON "Lead"("email", "website");
