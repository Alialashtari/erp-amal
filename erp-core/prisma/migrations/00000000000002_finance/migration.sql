-- Amal ERP Core - Phase 3: Financial Core
-- Double-entry immutable ledger (ADR-011), IQD base currency (ADR-019).

CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
CREATE TYPE "FundType" AS ENUM ('GENERAL', 'RESTRICTED');
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER', 'REFUND');
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CARD', 'GATEWAY', 'POS', 'WALLET', 'OTHER');
CREATE TYPE "BudgetStatus" AS ENUM ('ACTIVE', 'CLOSED');
CREATE TYPE "ReceiptType" AS ENUM ('RECEIPT', 'PAYMENT_VOUCHER');

CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "type" "AccountType" NOT NULL,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "accounts_code_key" ON "accounts"("code");

CREATE TABLE "funds" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "type" "FundType" NOT NULL DEFAULT 'GENERAL',
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "funds_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "funds_code_key" ON "funds"("code");

CREATE TABLE "cost_centers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cost_centers_code_key" ON "cost_centers"("code");

CREATE TABLE "financial_transactions" (
    "id" TEXT NOT NULL,
    "transactionNumber" SERIAL NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currency" TEXT NOT NULL DEFAULT 'IQD',
    "amountOriginal" DECIMAL(18,2) NOT NULL,
    "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "amountIqd" DECIMAL(18,2) NOT NULL,
    "fundId" TEXT NOT NULL,
    "toFundId" TEXT,
    "costCenterId" TEXT,
    "personId" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "sourceSystem" "SourceSystem" NOT NULL DEFAULT 'ERP',
    "externalId" TEXT,
    "idempotencyKey" TEXT,
    "linkedEntityType" TEXT,
    "linkedEntityId" TEXT,
    "reversesTransactionId" TEXT,
    "rejectionReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "financial_transactions_transactionNumber_key" ON "financial_transactions"("transactionNumber");
CREATE UNIQUE INDEX "financial_transactions_idempotencyKey_key" ON "financial_transactions"("idempotencyKey");
CREATE UNIQUE INDEX "financial_transactions_reversesTransactionId_key" ON "financial_transactions"("reversesTransactionId");
CREATE UNIQUE INDEX "financial_transactions_sourceSystem_externalId_key" ON "financial_transactions"("sourceSystem", "externalId");
CREATE INDEX "financial_transactions_fundId_status_idx" ON "financial_transactions"("fundId", "status");
CREATE INDEX "financial_transactions_type_status_idx" ON "financial_transactions"("type", "status");
CREATE INDEX "financial_transactions_transactionDate_idx" ON "financial_transactions"("transactionDate");
CREATE INDEX "financial_transactions_linkedEntityType_linkedEntityId_idx" ON "financial_transactions"("linkedEntityType", "linkedEntityId");

CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "debitIqd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditIqd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ledger_entries_accountId_idx" ON "ledger_entries"("accountId");
CREATE INDEX "ledger_entries_fundId_idx" ON "ledger_entries"("fundId");
CREATE INDEX "ledger_entries_transactionId_idx" ON "ledger_entries"("transactionId");

CREATE TABLE "approval_rules" (
    "id" TEXT NOT NULL,
    "transactionType" "TransactionType" NOT NULL,
    "minAmountIqd" DECIMAL(18,2) NOT NULL,
    "requiredPermission" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "approval_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "approval_rules_transactionType_isActive_idx" ON "approval_rules"("transactionType", "isActive");

CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fundId" TEXT,
    "costCenterId" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "allocatedIqd" DECIMAL(18,2) NOT NULL,
    "status" "BudgetStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "budgets_costCenterId_idx" ON "budgets"("costCenterId");
CREATE INDEX "budgets_fundId_idx" ON "budgets"("fundId");

CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "receiptNumber" SERIAL NOT NULL,
    "type" "ReceiptType" NOT NULL,
    "transactionId" TEXT NOT NULL,
    "pdfFileId" TEXT,
    "qrPayload" TEXT NOT NULL,
    "issuedBy" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "receipts_receiptNumber_key" ON "receipts"("receiptNumber");
CREATE UNIQUE INDEX "receipts_transactionId_key" ON "receipts"("transactionId");

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_toFundId_fkey" FOREIGN KEY ("toFundId") REFERENCES "funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_reversesTransactionId_fkey" FOREIGN KEY ("reversesTransactionId") REFERENCES "financial_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "financial_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "financial_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
