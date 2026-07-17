-- Amal ERP Core - Phase 4: Donations & Campaigns
-- Every donation resolves to a Person (ADR-021); campaigns own dedicated restricted funds.

CREATE TYPE "CampaignType" AS ENUM ('GENERAL', 'MEDICAL', 'ORPHANS', 'CONSTRUCTION', 'EDUCATION', 'RELIEF', 'SEASONAL', 'ZAKAT', 'KAFFARA', 'CUSTOM');
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'ARCHIVED');
CREATE TYPE "DonationStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED');
CREATE TYPE "RecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');
CREATE TYPE "RecurringStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED');

CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "campaignNumber" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "description" TEXT,
    "type" "CampaignType" NOT NULL DEFAULT 'GENERAL',
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "goalAmountIqd" DECIMAL(18,2),
    "targetBeneficiaries" INTEGER,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "fundId" TEXT NOT NULL,
    "managerId" TEXT,
    "coverImageFileId" TEXT,
    "showInApp" BOOLEAN NOT NULL DEFAULT false,
    "showInWebsite" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "campaigns_campaignNumber_key" ON "campaigns"("campaignNumber");
CREATE UNIQUE INDEX "campaigns_fundId_key" ON "campaigns"("fundId");
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");
CREATE INDEX "campaigns_type_idx" ON "campaigns"("type");

CREATE TABLE "campaign_updates" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageFileId" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "campaign_updates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "campaign_updates_campaignId_publishedAt_idx" ON "campaign_updates"("campaignId", "publishedAt");

CREATE TABLE "donations" (
    "id" TEXT NOT NULL,
    "donationNumber" SERIAL NOT NULL,
    "personId" TEXT NOT NULL,
    "campaignId" TEXT,
    "fundId" TEXT NOT NULL,
    "status" "DonationStatus" NOT NULL DEFAULT 'COMPLETED',
    "currency" TEXT NOT NULL DEFAULT 'IQD',
    "amountOriginal" DECIMAL(18,2) NOT NULL,
    "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "amountIqd" DECIMAL(18,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "donationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isAnonymousPublic" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "transactionId" TEXT,
    "refundTransactionId" TEXT,
    "sourceSystem" "SourceSystem" NOT NULL DEFAULT 'ERP',
    "externalId" TEXT,
    "idempotencyKey" TEXT,
    "recurringDonationId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "donations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "donations_donationNumber_key" ON "donations"("donationNumber");
CREATE UNIQUE INDEX "donations_transactionId_key" ON "donations"("transactionId");
CREATE UNIQUE INDEX "donations_refundTransactionId_key" ON "donations"("refundTransactionId");
CREATE UNIQUE INDEX "donations_idempotencyKey_key" ON "donations"("idempotencyKey");
CREATE UNIQUE INDEX "donations_sourceSystem_externalId_key" ON "donations"("sourceSystem", "externalId");
CREATE INDEX "donations_personId_idx" ON "donations"("personId");
CREATE INDEX "donations_campaignId_status_idx" ON "donations"("campaignId", "status");
CREATE INDEX "donations_fundId_status_idx" ON "donations"("fundId", "status");
CREATE INDEX "donations_donationDate_idx" ON "donations"("donationDate");

CREATE TABLE "recurring_donations" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "campaignId" TEXT,
    "fundId" TEXT NOT NULL,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "status" "RecurringStatus" NOT NULL DEFAULT 'ACTIVE',
    "currency" TEXT NOT NULL DEFAULT 'IQD',
    "amountOriginal" DECIMAL(18,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recurring_donations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "recurring_donations_status_nextRunAt_idx" ON "recurring_donations"("status", "nextRunAt");
CREATE INDEX "recurring_donations_personId_idx" ON "recurring_donations"("personId");

ALTER TABLE "campaign_updates" ADD CONSTRAINT "campaign_updates_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "donations" ADD CONSTRAINT "donations_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "donations" ADD CONSTRAINT "donations_recurringDonationId_fkey" FOREIGN KEY ("recurringDonationId") REFERENCES "recurring_donations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
