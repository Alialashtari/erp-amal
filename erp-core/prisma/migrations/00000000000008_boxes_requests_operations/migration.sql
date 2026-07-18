-- Amal ERP Core - ADR-027: Box requests lifecycle + operational boxes + collections
-- DELIVERED transactionally creates the box; collections post INCOME (account 4200).

CREATE TYPE "BoxRequestStatus" AS ENUM ('NEW', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');
CREATE TYPE "BoxStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LOST', 'DAMAGED', 'RETURNED');

CREATE TABLE "collection_boxes" (
    "id" TEXT NOT NULL,
    "boxNumber" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "ownerPersonId" TEXT NOT NULL,
    "governorate" TEXT,
    "district" TEXT,
    "addressDetails" TEXT,
    "collectorPersonId" TEXT,
    "status" "BoxStatus" NOT NULL DEFAULT 'ACTIVE',
    "deliveredAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "collection_boxes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "collection_boxes_boxNumber_key" ON "collection_boxes"("boxNumber");
CREATE UNIQUE INDEX "collection_boxes_code_key" ON "collection_boxes"("code");
CREATE INDEX "collection_boxes_status_idx" ON "collection_boxes"("status");
CREATE INDEX "collection_boxes_ownerPersonId_idx" ON "collection_boxes"("ownerPersonId");
CREATE INDEX "collection_boxes_collectorPersonId_idx" ON "collection_boxes"("collectorPersonId");

CREATE TABLE "box_requests" (
    "id" TEXT NOT NULL,
    "requestNumber" SERIAL NOT NULL,
    "personId" TEXT NOT NULL,
    "governorate" TEXT,
    "district" TEXT,
    "addressDetails" TEXT,
    "preferredContactTime" TEXT,
    "notes" TEXT,
    "status" "BoxRequestStatus" NOT NULL DEFAULT 'NEW',
    "reviewedBy" TEXT,
    "rejectionReason" TEXT,
    "assignedToUserId" TEXT,
    "scheduledDeliveryAt" TIMESTAMP(3),
    "deliveredBy" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "boxId" TEXT,
    "sourceSystem" "SourceSystem" NOT NULL DEFAULT 'ERP',
    "externalId" TEXT,
    "idempotencyKey" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "box_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "box_requests_requestNumber_key" ON "box_requests"("requestNumber");
CREATE UNIQUE INDEX "box_requests_boxId_key" ON "box_requests"("boxId");
CREATE UNIQUE INDEX "box_requests_idempotencyKey_key" ON "box_requests"("idempotencyKey");
CREATE UNIQUE INDEX "box_requests_sourceSystem_externalId_key" ON "box_requests"("sourceSystem", "externalId");
CREATE INDEX "box_requests_status_idx" ON "box_requests"("status");
CREATE INDEX "box_requests_personId_idx" ON "box_requests"("personId");
ALTER TABLE "box_requests" ADD CONSTRAINT "box_requests_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "collection_boxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "box_collections" (
    "id" TEXT NOT NULL,
    "collectionNumber" SERIAL NOT NULL,
    "boxId" TEXT NOT NULL,
    "amountIqd" DECIMAL(18,2) NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collectorUserId" TEXT,
    "notes" TEXT,
    "transactionId" TEXT,
    "sourceSystem" "SourceSystem" NOT NULL DEFAULT 'ERP',
    "externalId" TEXT,
    "idempotencyKey" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "box_collections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "box_collections_collectionNumber_key" ON "box_collections"("collectionNumber");
CREATE UNIQUE INDEX "box_collections_transactionId_key" ON "box_collections"("transactionId");
CREATE UNIQUE INDEX "box_collections_idempotencyKey_key" ON "box_collections"("idempotencyKey");
CREATE UNIQUE INDEX "box_collections_sourceSystem_externalId_key" ON "box_collections"("sourceSystem", "externalId");
CREATE INDEX "box_collections_boxId_collectedAt_idx" ON "box_collections"("boxId", "collectedAt");
ALTER TABLE "box_collections" ADD CONSTRAINT "box_collections_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "collection_boxes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
