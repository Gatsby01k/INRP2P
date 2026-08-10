-- Partner processing desk: payment rails, merchant pay-in/pay-out orders,
-- atomic exposure controls and settlement reconciliation.

CREATE TYPE "ProcessingOrderType" AS ENUM ('PAY_IN', 'PAY_OUT');
CREATE TYPE "ProcessingOrderStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'PAYMENT_MARKED', 'PAYOUT_SENT', 'COMPLETED', 'DISPUTED', 'FAILED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "PaymentRailType" AS ENUM ('UPI', 'IMPS', 'NEFT', 'RTGS', 'BANK_TRANSFER');
CREATE TYPE "PaymentRailStatus" AS ENUM ('PENDING_REVIEW', 'ACTIVE', 'PAUSED', 'DISABLED');
CREATE TYPE "ProcessingSettlementStatus" AS ENUM ('OPEN', 'READY', 'SUBMITTED', 'CONFIRMED', 'DISPUTED', 'CANCELLED');

CREATE TABLE "PartnerProcessingAccount" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "approvedLimitInr" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "lockedExposureInr" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "payInFeeBps" INTEGER NOT NULL DEFAULT 0,
  "payOutFeeBps" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerProcessingAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartnerPaymentRail" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "type" "PaymentRailType" NOT NULL,
  "label" TEXT NOT NULL,
  "bankName" TEXT,
  "maskedDestination" TEXT NOT NULL,
  "encryptedDetails" TEXT NOT NULL,
  "minTicketInr" DECIMAL(18,2),
  "maxTicketInr" DECIMAL(18,2),
  "dailyLimitInr" DECIMAL(18,2),
  "status" "PaymentRailStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "reviewedById" TEXT,
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerPaymentRail_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProcessingSettlement" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "status" "ProcessingSettlementStatus" NOT NULL DEFAULT 'OPEN',
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "grossPayInInr" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "grossPayOutInr" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "partnerFeeInr" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "netPositionInr" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "settlementRate" DECIMAL(18,6),
  "settlementAmountUsdt" DECIMAL(18,6),
  "transactionHash" TEXT,
  "note" TEXT,
  "dueAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProcessingSettlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProcessingOrder" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "externalReference" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "partnerId" TEXT,
  "railId" TEXT,
  "settlementId" TEXT,
  "type" "ProcessingOrderType" NOT NULL,
  "status" "ProcessingOrderStatus" NOT NULL DEFAULT 'AVAILABLE',
  "requestedRail" "PaymentRailType" NOT NULL,
  "amountInr" DECIMAL(18,2) NOT NULL,
  "partnerFeeBps" INTEGER NOT NULL DEFAULT 0,
  "partnerFeeInr" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "counterpartyLabel" TEXT NOT NULL,
  "encryptedPaymentData" TEXT NOT NULL,
  "companyNote" TEXT,
  "internalNote" TEXT,
  "paymentReference" TEXT,
  "disputeReason" TEXT,
  "failureReason" TEXT,
  "createdById" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "assignedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "paymentMarkedAt" TIMESTAMP(3),
  "payoutSentAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "disputedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProcessingOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProcessingOrderEvent" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "fromStatus" "ProcessingOrderStatus",
  "toStatus" "ProcessingOrderStatus" NOT NULL,
  "actorId" TEXT,
  "actorLabel" TEXT NOT NULL,
  "actorRole" "Role" NOT NULL,
  "note" TEXT,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcessingOrderEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartnerProcessingAccount_partnerId_key" ON "PartnerProcessingAccount"("partnerId");
CREATE INDEX "PartnerProcessingAccount_enabled_idx" ON "PartnerProcessingAccount"("enabled");
CREATE UNIQUE INDEX "PartnerPaymentRail_reference_key" ON "PartnerPaymentRail"("reference");
CREATE INDEX "PartnerPaymentRail_partnerId_status_idx" ON "PartnerPaymentRail"("partnerId", "status");
CREATE INDEX "PartnerPaymentRail_type_status_idx" ON "PartnerPaymentRail"("type", "status");
CREATE UNIQUE INDEX "ProcessingSettlement_reference_key" ON "ProcessingSettlement"("reference");
CREATE INDEX "ProcessingSettlement_partnerId_status_idx" ON "ProcessingSettlement"("partnerId", "status");
CREATE INDEX "ProcessingSettlement_companyId_status_idx" ON "ProcessingSettlement"("companyId", "status");
CREATE INDEX "ProcessingSettlement_createdAt_idx" ON "ProcessingSettlement"("createdAt");
CREATE UNIQUE INDEX "ProcessingOrder_reference_key" ON "ProcessingOrder"("reference");
CREATE UNIQUE INDEX "ProcessingOrder_companyId_externalReference_key" ON "ProcessingOrder"("companyId", "externalReference");
CREATE INDEX "ProcessingOrder_status_createdAt_idx" ON "ProcessingOrder"("status", "createdAt");
CREATE INDEX "ProcessingOrder_partnerId_status_idx" ON "ProcessingOrder"("partnerId", "status");
CREATE INDEX "ProcessingOrder_companyId_createdAt_idx" ON "ProcessingOrder"("companyId", "createdAt");
CREATE INDEX "ProcessingOrder_expiresAt_status_idx" ON "ProcessingOrder"("expiresAt", "status");
CREATE INDEX "ProcessingOrder_settlementId_idx" ON "ProcessingOrder"("settlementId");
CREATE INDEX "ProcessingOrderEvent_orderId_createdAt_idx" ON "ProcessingOrderEvent"("orderId", "createdAt");

ALTER TABLE "PartnerProcessingAccount" ADD CONSTRAINT "PartnerProcessingAccount_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerPaymentRail" ADD CONSTRAINT "PartnerPaymentRail_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcessingSettlement" ADD CONSTRAINT "ProcessingSettlement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcessingSettlement" ADD CONSTRAINT "ProcessingSettlement_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcessingOrder" ADD CONSTRAINT "ProcessingOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcessingOrder" ADD CONSTRAINT "ProcessingOrder_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcessingOrder" ADD CONSTRAINT "ProcessingOrder_railId_fkey" FOREIGN KEY ("railId") REFERENCES "PartnerPaymentRail"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProcessingOrder" ADD CONSTRAINT "ProcessingOrder_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "ProcessingSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProcessingOrderEvent" ADD CONSTRAINT "ProcessingOrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProcessingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
