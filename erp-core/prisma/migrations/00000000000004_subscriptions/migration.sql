-- Amal ERP Core - Phase 5A: Subscriptions & Baqiyat Al-Salihat (FRS-004)

CREATE TYPE "PlanCategory" AS ENUM ('BAQIYAT', 'ORPHAN_SPONSORSHIP', 'STUDENT_SPONSORSHIP', 'PATIENT_SUPPORT', 'PROJECT_SUPPORT', 'WAQF', 'GENERAL', 'CUSTOM');
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'YEARLY', 'LIFETIME');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'LAPSED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "InstallmentStatus" AS ENUM ('DUE', 'PAID', 'OVERDUE', 'WAIVED', 'CANCELLED');
CREATE TYPE "BaqiyatWorkType" AS ENUM ('KHATMA', 'SADAQA', 'FEEDING', 'MAJLIS', 'CHARITY_PROJECT', 'OTHER');
CREATE TYPE "BaqiyatWorkStatus" AS ENUM ('SCHEDULED', 'EXECUTED', 'POSTPONED', 'CANCELLED');

CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "description" TEXT,
    "category" "PlanCategory" NOT NULL DEFAULT 'GENERAL',
    "billingCycle" "BillingCycle" NOT NULL,
    "amountIqd" DECIMAL(18,2) NOT NULL,
    "allowCustomAmount" BOOLEAN NOT NULL DEFAULT false,
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 14,
    "fundId" TEXT,
    "imageFileId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subscription_plans_code_key" ON "subscription_plans"("code");
CREATE INDEX "subscription_plans_category_isActive_idx" ON "subscription_plans"("category", "isActive");

CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "subscriptionNumber" SERIAL NOT NULL,
    "personId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "amountIqd" DECIMAL(18,2) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextDueDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "beneficiaryPersonId" TEXT,
    "notes" TEXT,
    "sourceSystem" "SourceSystem" NOT NULL DEFAULT 'ERP',
    "externalId" TEXT,
    "idempotencyKey" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subscriptions_subscriptionNumber_key" ON "subscriptions"("subscriptionNumber");
CREATE UNIQUE INDEX "subscriptions_idempotencyKey_key" ON "subscriptions"("idempotencyKey");
CREATE UNIQUE INDEX "subscriptions_sourceSystem_externalId_key" ON "subscriptions"("sourceSystem", "externalId");
CREATE INDEX "subscriptions_personId_idx" ON "subscriptions"("personId");
CREATE INDEX "subscriptions_status_nextDueDate_idx" ON "subscriptions"("status", "nextDueDate");
CREATE INDEX "subscriptions_planId_idx" ON "subscriptions"("planId");

CREATE TABLE "installments" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "amountIqd" DECIMAL(18,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'DUE',
    "paidAt" TIMESTAMP(3),
    "paymentMethod" "PaymentMethod",
    "reference" TEXT,
    "transactionId" TEXT,
    "remindersSent" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "installments_transactionId_key" ON "installments"("transactionId");
CREATE UNIQUE INDEX "installments_subscriptionId_sequence_key" ON "installments"("subscriptionId", "sequence");
CREATE INDEX "installments_status_dueDate_idx" ON "installments"("status", "dueDate");

CREATE TABLE "baqiyat_works" (
    "id" TEXT NOT NULL,
    "workNumber" SERIAL NOT NULL,
    "type" "BaqiyatWorkType" NOT NULL,
    "status" "BaqiyatWorkStatus" NOT NULL DEFAULT 'SCHEDULED',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "executedBy" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "baqiyat_works_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "baqiyat_works_workNumber_key" ON "baqiyat_works"("workNumber");
CREATE INDEX "baqiyat_works_status_type_idx" ON "baqiyat_works"("status", "type");

CREATE TABLE "baqiyat_work_assignments" (
    "workId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,
    CONSTRAINT "baqiyat_work_assignments_pkey" PRIMARY KEY ("workId", "subscriptionId")
);

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "installments" ADD CONSTRAINT "installments_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "baqiyat_work_assignments" ADD CONSTRAINT "baqiyat_work_assignments_workId_fkey" FOREIGN KEY ("workId") REFERENCES "baqiyat_works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "baqiyat_work_assignments" ADD CONSTRAINT "baqiyat_work_assignments_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
