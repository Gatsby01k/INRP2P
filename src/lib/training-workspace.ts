import { Prisma, type ProcessingOrderType, type ProcessingOrderStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { indiaPerformancePeriods } from "@/lib/partner-performance";
import { encryptProcessingData } from "@/lib/processing-data";
import {
  assertTrainingMode,
  isTrainingAccountEmail,
  trainingPartnerEmail,
  type TrainingScenario,
} from "@/lib/training";
import { TRAINING_HISTORY_ORDERS, TRAINING_QUEUE_ORDERS } from "@/lib/training-orders";

const TRAINING_COMPANY_EMAIL = "video-merchant@inrp2p.demo";
const TRAINING_PARTNER_REFERENCE = "TRN-PTR-VIDEO";
const TRAINING_VERIFICATION_REFERENCE = "TRN-VER-VIDEO";
const TRAINING_COMPANY_VERIFICATION_REFERENCE = "TRN-VER-MERCHANT";
const TRAINING_DEPOSIT_REFERENCE = "TRN-DEP-VIDEO-01";
const TRAINING_SETTLEMENT_REFERENCE = "TRN-SET-VIDEO-01";
const DAY_MS = 24 * 60 * 60 * 1000;

type TrainingActor = {
  id?: string | null;
  label: string;
};

function trainingPassword() {
  const value = process.env.TRAINING_PARTNER_PASSWORD?.trim();
  if (!value || value.length < 14 || !/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value)) {
    throw new Error("TRAINING_PARTNER_PASSWORD must be 14+ characters with uppercase, lowercase and a number.");
  }
  return value;
}

function fee(amount: number) {
  return new Prisma.Decimal(amount).mul(100).div(10_000).toDecimalPlaces(2);
}

function scenarioRank(scenario: TrainingScenario) {
  return ["NEW", "VERIFICATION", "RESERVE", "ACTIVE", "HISTORY"].indexOf(scenario);
}

function orderPaymentData(type: ProcessingOrderType, key: string) {
  return type === "PAY_IN"
    ? encryptProcessingData({
        payerName: "Training payer",
        payerReference: `TRAINING-PAYER-${key}`,
      })
    : encryptProcessingData({
        beneficiaryName: "Training beneficiary",
        accountNumber: `00000${key}01`,
        ifsc: "TEST0001234",
        bankName: "Training Bank",
        upiId: `training${key}@demo`,
      });
}

async function clearTrainingState(
  tx: Prisma.TransactionClient,
  input: { partnerId: string; companyId: string; organizationId: string; partnerUserId: string; companyUserId: string },
) {
  const orderIds = (await tx.processingOrder.findMany({
    where: { OR: [{ partnerId: input.partnerId }, { companyId: input.companyId }] },
    select: { id: true },
  })).map((order) => order.id);

  if (orderIds.length) await tx.processingOrderEvent.deleteMany({ where: { orderId: { in: orderIds } } });
  await tx.processingOrder.deleteMany({ where: { OR: [{ partnerId: input.partnerId }, { companyId: input.companyId }] } });
  await tx.processingSettlement.deleteMany({ where: { OR: [{ partnerId: input.partnerId }, { companyId: input.companyId }] } });
  await tx.partnerPaymentRail.deleteMany({ where: { partnerId: input.partnerId } });
  await tx.partnerProcessingAccount.deleteMany({ where: { partnerId: input.partnerId } });
  await tx.partnerDeposit.deleteMany({ where: { partnerId: input.partnerId } });
  await tx.verificationCase.deleteMany({ where: { OR: [{ partnerId: input.partnerId }, { organizationId: input.organizationId }] } });
  await tx.companyPartnerConnection.deleteMany({ where: { partnerId: input.partnerId } });
  await tx.capacityPulse.deleteMany({ where: { partnerId: input.partnerId } });
  await tx.incident.deleteMany({ where: { partnerId: input.partnerId } });
  await tx.notification.deleteMany({ where: { userId: { in: [input.partnerUserId, input.companyUserId] } } });
  await tx.auditLog.deleteMany({
    where: {
      OR: [
        { partnerId: input.partnerId },
        { actorId: { in: [input.partnerUserId, input.companyUserId] } },
        ...(orderIds.length ? [{ entityId: { in: orderIds } }] : []),
      ],
    },
  });
}

async function createApprovedPartnerVerification(tx: Prisma.TransactionClient, partnerId: string, actor: TrainingActor, now: Date) {
  await tx.verificationCase.create({
    data: {
      reference: TRAINING_VERIFICATION_REFERENCE,
      partnerId,
      status: "APPROVED",
      riskLevel: "LOW",
      decisionNote: "Training scenario approval. No live counterparty decision.",
      decidedById: actor.id ?? null,
      decidedAt: now,
      expiresAt: new Date(now.getTime() + 365 * DAY_MS),
      checks: {
        create: ["IDENTITY", "SANCTIONS_PEP", "BANK_ACCOUNT", "WALLET_RISK", "REFERENCES"].map((type) => ({
          type,
          provider: "TRAINING_SIMULATOR",
          providerReference: `TRN-${type}`,
          status: "PASSED",
          summary: "Completed in the isolated Training Mode scenario.",
          reviewedById: actor.id ?? null,
          reviewedAt: now,
        })),
      },
    },
  });
}

async function createCompanyVerification(tx: Prisma.TransactionClient, organizationId: string, actor: TrainingActor, now: Date) {
  await tx.verificationCase.create({
    data: {
      reference: TRAINING_COMPANY_VERIFICATION_REFERENCE,
      organizationId,
      status: "APPROVED",
      riskLevel: "LOW",
      decisionNote: "Training merchant approved for scenario playback only.",
      decidedById: actor.id ?? null,
      decidedAt: now,
      expiresAt: new Date(now.getTime() + 365 * DAY_MS),
      checks: {
        create: ["KYB", "UBO", "SANCTIONS_PEP", "BANK_ACCOUNT"].map((type) => ({
          type,
          provider: "TRAINING_SIMULATOR",
          providerReference: `TRN-MERCHANT-${type}`,
          status: "PASSED",
          summary: "Synthetic training merchant check.",
          reviewedById: actor.id ?? null,
          reviewedAt: now,
        })),
      },
    },
  });
}

async function createVerificationInProgress(tx: Prisma.TransactionClient, partnerId: string, actor: TrainingActor, now: Date) {
  const checks = [
    ["IDENTITY", "PASSED", "Identity specimen reviewed."],
    ["SANCTIONS_PEP", "PASSED", "Training screening returned no match."],
    ["BANK_ACCOUNT", "REVIEW", "Bank ownership evidence is under operator review."],
    ["WALLET_RISK", "PENDING", "Waiting for reserve-wallet evidence."],
    ["REFERENCES", "PENDING", "Operating reference has not been reviewed yet."],
  ] as const;
  await tx.verificationCase.create({
    data: {
      reference: TRAINING_VERIFICATION_REFERENCE,
      partnerId,
      status: "IN_PROGRESS",
      riskLevel: "PENDING",
      checks: {
        create: checks.map(([type, status, summary]) => ({
          type,
          provider: status === "PENDING" ? null : "TRAINING_SIMULATOR",
          status,
          summary,
          reviewedById: status === "PENDING" ? null : actor.id ?? null,
          reviewedAt: status === "PENDING" ? null : now,
        })),
      },
    },
  });
}

async function createActiveInfrastructure(
  tx: Prisma.TransactionClient,
  input: {
    partnerId: string;
    companyId: string;
    organizationId: string;
    actor: TrainingActor;
    now: Date;
  },
) {
  const { partnerId, companyId, organizationId, actor, now } = input;
  const deposit = await tx.partnerDeposit.create({
    data: {
      reference: TRAINING_DEPOSIT_REFERENCE,
      partnerId,
      amount: new Prisma.Decimal(400),
      actualAmount: new Prisma.Decimal(400),
      status: "CONFIRMED",
      provider: "TRAINING_SIMULATOR",
      providerStatus: "simulated_confirmed",
      transactionHash: "d".repeat(64),
      reviewedById: actor.id ?? null,
      reviewNote: "Simulated reserve. No token transfer occurred.",
      submittedAt: new Date(now.getTime() - 35 * 60 * 1000),
      confirmedAt: new Date(now.getTime() - 30 * 60 * 1000),
      createdAt: new Date(now.getTime() - 40 * 60 * 1000),
    },
  });

  const upiRail = await tx.partnerPaymentRail.create({
    data: {
      reference: "TRN-RAIL-VIDEO-UPI",
      partnerId,
      type: "UPI",
      label: "Training UPI desk",
      bankName: "Training Bank",
      maskedDestination: "tr••••••@demo",
      encryptedDetails: encryptProcessingData({ accountHolder: "Training operator", upiId: "training.operator@demo", bankName: "Training Bank" }),
      minTicketInr: new Prisma.Decimal(500),
      maxTicketInr: new Prisma.Decimal(100_000),
      dailyLimitInr: new Prisma.Decimal(500_000),
      status: "ACTIVE",
      reviewedById: actor.id ?? null,
      reviewNote: "Synthetic rail for Training Mode only.",
      reviewedAt: now,
    },
  });
  const impsRail = await tx.partnerPaymentRail.create({
    data: {
      reference: "TRN-RAIL-VIDEO-IMPS",
      partnerId,
      type: "IMPS",
      label: "Training IMPS desk",
      bankName: "Training Bank",
      maskedDestination: "••••••••0101",
      encryptedDetails: encryptProcessingData({ accountHolder: "Training operator", accountNumber: "000000000101", ifsc: "TEST0001234", bankName: "Training Bank" }),
      minTicketInr: new Prisma.Decimal(10_000),
      maxTicketInr: new Prisma.Decimal(500_000),
      dailyLimitInr: new Prisma.Decimal(1_500_000),
      status: "ACTIVE",
      reviewedById: actor.id ?? null,
      reviewNote: "Synthetic rail for Training Mode only.",
      reviewedAt: now,
    },
  });
  const rtgsRail = await tx.partnerPaymentRail.create({
    data: {
      reference: "TRN-RAIL-VIDEO-RTGS",
      partnerId,
      type: "RTGS",
      label: "Training RTGS desk",
      bankName: "Training Bank",
      maskedDestination: "••••••••0202",
      encryptedDetails: encryptProcessingData({ accountHolder: "Training operator", accountNumber: "000000000202", ifsc: "TEST0001234", bankName: "Training Bank" }),
      minTicketInr: new Prisma.Decimal(200_000),
      maxTicketInr: new Prisma.Decimal(2_000_000),
      dailyLimitInr: new Prisma.Decimal(3_000_000),
      status: "ACTIVE",
      reviewedById: actor.id ?? null,
      reviewNote: "Synthetic rail for Training Mode only.",
      reviewedAt: now,
    },
  });

  await tx.companyPartnerConnection.create({
    data: { organizationId, partnerId, status: "ACTIVE", approvedAt: now },
  });
  await createCompanyVerification(tx, organizationId, actor, now);
  await tx.partnerProcessingAccount.create({
    data: {
      partnerId,
      enabled: true,
      approvedLimitInr: new Prisma.Decimal(750_000),
      lockedExposureInr: new Prisma.Decimal(0),
      payInFeeBps: 100,
      payOutFeeBps: 100,
    },
  });

  for (const [index, spec] of TRAINING_QUEUE_ORDERS.entries()) {
    await tx.processingOrder.create({
      data: {
        reference: `TRN-ORD-Q-${spec.key}`,
        externalReference: `TRAINING-QUEUE-${spec.key}`,
        companyId,
        type: spec.type,
        status: "AVAILABLE",
        requestedRail: spec.rail,
        amountInr: new Prisma.Decimal(spec.amount),
        counterpartyLabel: spec.type === "PAY_IN" ? "Training payer · protected" : "Training beneficiary · protected",
        encryptedPaymentData: orderPaymentData(spec.type, spec.key),
        companyNote: "Training order — no external transfer instruction.",
        internalNote: "Synthetic order generated by Training Studio.",
        createdById: actor.id ?? companyId,
        expiresAt: new Date(now.getTime() + (30 + index * 6) * 60 * 1000),
        createdAt: new Date(now.getTime() - (index + 1) * 60 * 1000),
        events: {
          create: {
            toStatus: "AVAILABLE",
            actorId: actor.id ?? null,
            actorLabel: "Training merchant",
            actorRole: "COMPANY",
            note: "Synthetic order released to the isolated training queue.",
            meta: { training: true },
            createdAt: new Date(now.getTime() - (index + 1) * 60 * 1000),
          },
        },
      },
    });
  }

  return { deposit, upiRail, impsRail, rtgsRail };
}

function event(
  input: {
    status: ProcessingOrderStatus;
    actorId: string;
    actorLabel: string;
    actorRole: "COMPANY" | "PARTNER";
    note: string;
    createdAt: Date;
    fromStatus?: ProcessingOrderStatus;
  },
) {
  return {
    fromStatus: input.fromStatus ?? null,
    toStatus: input.status,
    actorId: input.actorId,
    actorLabel: input.actorLabel,
    actorRole: input.actorRole,
    note: input.note,
    meta: { training: true },
    createdAt: input.createdAt,
  };
}

async function createHistory(
  tx: Prisma.TransactionClient,
  input: {
    partnerId: string;
    partnerUserId: string;
    companyId: string;
    companyUserId: string;
    upiRailId: string;
    impsRailId: string;
    rtgsRailId: string;
    actor: TrainingActor;
    now: Date;
  },
) {
  const { partnerId, partnerUserId, companyId, companyUserId, upiRailId, impsRailId, rtgsRailId, actor, now } = input;
  const periods = indiaPerformancePeriods(now);
  const maxDayAgo = Math.max(0, Math.floor((now.getTime() - periods.monthStart.getTime()) / DAY_MS));
  const completedOrderIds: string[] = [];
  let grossPayIn = new Prisma.Decimal(0);
  let grossPayOut = new Prisma.Decimal(0);
  let totalFees = new Prisma.Decimal(0);

  for (const [index, spec] of TRAINING_HISTORY_ORDERS.entries()) {
    const effectiveDayAgo = Math.min(spec.dayAgo ?? 0, maxDayAgo);
    const candidate = now.getTime() - effectiveDayAgo * DAY_MS - (index + 1) * 22 * 60 * 1000;
    const completedAt = new Date(Math.max(periods.monthStart.getTime() + 60_000, Math.min(candidate, now.getTime() - 60_000)));
    const assignedAt = new Date(completedAt.getTime() - 18 * 60 * 1000);
    const middleAt = new Date(completedAt.getTime() - 7 * 60 * 1000);
    const createdAt = new Date(completedAt.getTime() - 24 * 60 * 1000);
    const amount = new Prisma.Decimal(spec.amount);
    const partnerFee = fee(spec.amount);
    const isPayIn = spec.type === "PAY_IN";
    const order = await tx.processingOrder.create({
      data: {
        reference: `TRN-ORD-C-${spec.key}`,
        externalReference: `TRAINING-COMPLETED-${spec.key}`,
        companyId,
        partnerId,
        railId: isPayIn ? (spec.rail === "IMPS" ? impsRailId : spec.rail === "RTGS" ? rtgsRailId : upiRailId) : null,
        type: spec.type,
        status: "COMPLETED",
        requestedRail: spec.rail,
        amountInr: amount,
        partnerFeeBps: 100,
        partnerFeeInr: partnerFee,
        counterpartyLabel: isPayIn ? "Training payer · protected" : "Training beneficiary · protected",
        encryptedPaymentData: orderPaymentData(spec.type, spec.key),
        companyNote: "Completed Training Mode order. No external funds moved.",
        internalNote: "Synthetic order generated by Training Studio.",
        paymentReference: `TRAINING-UTR-${spec.key}`,
        createdById: companyUserId,
        assignedAt,
        expiresAt: new Date(completedAt.getTime() + 30 * 60 * 1000),
        paymentMarkedAt: isPayIn ? middleAt : null,
        payoutSentAt: isPayIn ? null : middleAt,
        completedAt,
        createdAt,
        events: {
          create: [
            event({ status: "AVAILABLE", actorId: companyUserId, actorLabel: "Training merchant", actorRole: "COMPANY", note: "Training order released.", createdAt }),
            event({ status: "ASSIGNED", fromStatus: "AVAILABLE", actorId: partnerUserId, actorLabel: "Training trader", actorRole: "PARTNER", note: "Training trader accepted the order.", createdAt: assignedAt }),
            event({ status: isPayIn ? "PAYMENT_MARKED" : "PAYOUT_SENT", fromStatus: "ASSIGNED", actorId: isPayIn ? companyUserId : partnerUserId, actorLabel: isPayIn ? "Training merchant" : "Training trader", actorRole: isPayIn ? "COMPANY" : "PARTNER", note: isPayIn ? "Simulated payer transfer marked sent." : "Simulated payout reference recorded.", createdAt: middleAt }),
            event({ status: "COMPLETED", fromStatus: isPayIn ? "PAYMENT_MARKED" : "PAYOUT_SENT", actorId: isPayIn ? partnerUserId : companyUserId, actorLabel: isPayIn ? "Training trader" : "Training merchant", actorRole: isPayIn ? "PARTNER" : "COMPANY", note: "Training order completed and reconciled.", createdAt: completedAt }),
          ],
        },
      },
    });
    completedOrderIds.push(order.id);
    if (isPayIn) grossPayIn = grossPayIn.plus(amount);
    else grossPayOut = grossPayOut.plus(amount);
    totalFees = totalFees.plus(partnerFee);
  }

  const activeAmount = 32_500;
  await tx.processingOrder.create({
    data: {
      reference: "TRN-ORD-A-201",
      externalReference: "TRAINING-ACTIVE-201",
      companyId,
      partnerId,
      railId: upiRailId,
      type: "PAY_IN",
      status: "PAYMENT_MARKED",
      requestedRail: "UPI",
      amountInr: new Prisma.Decimal(activeAmount),
      partnerFeeBps: 100,
      partnerFeeInr: fee(activeAmount),
      counterpartyLabel: "Training payer · protected",
      encryptedPaymentData: orderPaymentData("PAY_IN", "201"),
      companyNote: "Open this order and confirm the simulated INR receipt.",
      internalNote: "Training Studio action order.",
      paymentReference: "TRAINING-UTR-201",
      createdById: companyUserId,
      assignedAt: new Date(now.getTime() - 12 * 60 * 1000),
      paymentMarkedAt: new Date(now.getTime() - 4 * 60 * 1000),
      expiresAt: new Date(now.getTime() + 25 * 60 * 1000),
      createdAt: new Date(now.getTime() - 18 * 60 * 1000),
      events: {
        create: [
          event({ status: "AVAILABLE", actorId: companyUserId, actorLabel: "Training merchant", actorRole: "COMPANY", note: "Training order released.", createdAt: new Date(now.getTime() - 18 * 60 * 1000) }),
          event({ status: "ASSIGNED", fromStatus: "AVAILABLE", actorId: partnerUserId, actorLabel: "Training trader", actorRole: "PARTNER", note: "Order accepted by the training trader.", createdAt: new Date(now.getTime() - 12 * 60 * 1000) }),
          event({ status: "PAYMENT_MARKED", fromStatus: "ASSIGNED", actorId: companyUserId, actorLabel: "Training merchant", actorRole: "COMPANY", note: "Simulated payer transfer marked sent. Trader confirmation is required.", createdAt: new Date(now.getTime() - 4 * 60 * 1000) }),
        ],
      },
    },
  });
  await tx.partnerProcessingAccount.update({
    where: { partnerId },
    data: { lockedExposureInr: new Prisma.Decimal(activeAmount), version: { increment: 1 } },
  });

  const settledIds = completedOrderIds.slice(3);
  const settledOrders = await tx.processingOrder.findMany({ where: { id: { in: settledIds } }, select: { type: true, amountInr: true, partnerFeeInr: true } });
  const settledPayIn = settledOrders.filter((order) => order.type === "PAY_IN").reduce((sum, order) => sum.plus(order.amountInr), new Prisma.Decimal(0));
  const settledPayOut = settledOrders.filter((order) => order.type === "PAY_OUT").reduce((sum, order) => sum.plus(order.amountInr), new Prisma.Decimal(0));
  const settledFees = settledOrders.reduce((sum, order) => sum.plus(order.partnerFeeInr), new Prisma.Decimal(0));
  const settlement = await tx.processingSettlement.create({
    data: {
      reference: TRAINING_SETTLEMENT_REFERENCE,
      companyId,
      partnerId,
      status: "READY",
      periodStart: periods.monthStart,
      periodEnd: new Date(now.getTime() - DAY_MS),
      grossPayInInr: settledPayIn,
      grossPayOutInr: settledPayOut,
      partnerFeeInr: settledFees,
      netPositionInr: settledPayIn.minus(settledPayOut).minus(settledFees),
      note: "Training reconciliation batch. No external settlement instruction.",
      dueAt: new Date(now.getTime() + DAY_MS),
      createdById: actor.id ?? companyUserId,
    },
  });
  await tx.processingOrder.updateMany({ where: { id: { in: settledIds } }, data: { settlementId: settlement.id } });

  return { completedOrders: completedOrderIds.length, grossPayIn, grossPayOut, totalFees, settlementId: settlement.id };
}

export async function applyTrainingScenario(scenario: TrainingScenario, actor: TrainingActor) {
  assertTrainingMode();
  const email = trainingPartnerEmail();
  if (!isTrainingAccountEmail(email)) throw new Error("Training partner identity is outside the reserved demo domain.");
  const passwordHash = await bcrypt.hash(trainingPassword(), 12);
  const now = new Date();

  return db.$transaction(async (tx) => {
    const partnerUser = await tx.user.upsert({
      where: { email },
      update: { name: "Training trader", role: "PARTNER", passwordHash, emailVerifiedAt: now, mustSetPassword: false, failedLoginAttempts: 0, lockedUntil: null, telegramChatId: null },
      create: { email, name: "Training trader", role: "PARTNER", passwordHash, emailVerifiedAt: now },
    });
    const companyUser = await tx.user.upsert({
      where: { email: TRAINING_COMPANY_EMAIL },
      update: { name: "Training merchant", role: "COMPANY", passwordHash, emailVerifiedAt: now, mustSetPassword: false, failedLoginAttempts: 0, lockedUntil: null, telegramChatId: null },
      create: { email: TRAINING_COMPANY_EMAIL, name: "Training merchant", role: "COMPANY", passwordHash, emailVerifiedAt: now },
    });
    const partner = await tx.partnerProfile.upsert({
      where: { userId: partnerUser.id },
      update: {
        reference: TRAINING_PARTNER_REFERENCE,
        displayName: "INRP2P Training Desk",
        legalName: "Training entity — not a live counterparty",
        contactName: "Training operator",
        experienceBand: "Training scenario",
        directions: ["INR_PAYOUTS"],
        banks: ["Training Bank"],
        methods: ["UPI", "IMPS", "NEFT", "RTGS"],
        dailyCapacityBand: "₹5–10 lakh / training day",
        monthlyCapacityBand: "₹10–20 lakh / training month",
        minTicket: "₹500",
        maxTicket: "₹5 lakh",
        settlementPreference: "Training reconciliation only",
        workingHours: "Always available in Training Mode",
        reserveBand: "400 USDT simulated reserve",
        jurisdictions: "India — training environment",
        operatingCountry: "India",
        complianceFlags: ["Synthetic identity", "No live funds", "Training Mode"],
        complianceNotes: "This profile exists only for deterministic product walkthroughs.",
        riskNotes: null,
        additionalComments: "Never use production bank, wallet or customer information in this workspace.",
      },
      create: {
        userId: partnerUser.id,
        reference: TRAINING_PARTNER_REFERENCE,
        displayName: "INRP2P Training Desk",
        legalName: "Training entity — not a live counterparty",
        contactName: "Training operator",
        experienceBand: "Training scenario",
        directions: ["INR_PAYOUTS"],
        banks: ["Training Bank"],
        methods: ["UPI", "IMPS", "NEFT", "RTGS"],
        dailyCapacityBand: "₹5–10 lakh / training day",
        monthlyCapacityBand: "₹10–20 lakh / training month",
        minTicket: "₹500",
        maxTicket: "₹5 lakh",
        settlementPreference: "Training reconciliation only",
        workingHours: "Always available in Training Mode",
        reserveBand: "400 USDT simulated reserve",
        jurisdictions: "India — training environment",
        operatingCountry: "India",
        complianceFlags: ["Synthetic identity", "No live funds", "Training Mode"],
        complianceNotes: "This profile exists only for deterministic product walkthroughs.",
        additionalComments: "Never use production bank, wallet or customer information in this workspace.",
      },
    });
    const company = await tx.companyProfile.upsert({
      where: { userId: companyUser.id },
      update: { companyName: "INRP2P Training Merchant", website: "https://example.invalid", jurisdiction: "India", contactName: "Training merchant", contactRole: "Simulation", telegram: null, phone: null },
      create: { userId: companyUser.id, companyName: "INRP2P Training Merchant", website: "https://example.invalid", jurisdiction: "India", contactName: "Training merchant", contactRole: "Simulation" },
    });
    const organization = await tx.organization.upsert({
      where: { companyProfileId: company.id },
      update: { name: "INRP2P Training Merchant" },
      create: { companyProfileId: company.id, name: "INRP2P Training Merchant" },
    });

    await clearTrainingState(tx, {
      partnerId: partner.id,
      companyId: company.id,
      organizationId: organization.id,
      partnerUserId: partnerUser.id,
      companyUserId: companyUser.id,
    });

    await tx.partnerProfile.update({
      where: { id: partner.id },
      data: {
        status: scenario === "NEW" ? "APPLIED" : scenario === "VERIFICATION" ? "UNDER_REVIEW" : "VERIFIED",
        tier: scenarioRank(scenario) >= scenarioRank("RESERVE") ? "VERIFIED" : "CANDIDATE",
        programLevel: "STARTER",
        verifiedAt: scenarioRank(scenario) >= scenarioRank("RESERVE") ? now : null,
      },
    });

    if (scenario === "VERIFICATION") {
      await createVerificationInProgress(tx, partner.id, actor, now);
    } else if (scenarioRank(scenario) >= scenarioRank("RESERVE")) {
      await createApprovedPartnerVerification(tx, partner.id, actor, now);
    }

    let completedOrders = 0;
    let totalFees = new Prisma.Decimal(0);
    if (scenarioRank(scenario) >= scenarioRank("ACTIVE")) {
      const infrastructure = await createActiveInfrastructure(tx, {
        partnerId: partner.id,
        companyId: company.id,
        organizationId: organization.id,
        actor,
        now,
      });
      if (scenario === "HISTORY") {
        const history = await createHistory(tx, {
          partnerId: partner.id,
          partnerUserId: partnerUser.id,
          companyId: company.id,
          companyUserId: companyUser.id,
          upiRailId: infrastructure.upiRail.id,
          impsRailId: infrastructure.impsRail.id,
          rtgsRailId: infrastructure.rtgsRail.id,
          actor,
          now,
        });
        completedOrders = history.completedOrders;
        totalFees = history.totalFees;
      }
    }

    await tx.auditLog.create({
      data: {
        action: "training.scenario_applied",
        entityType: "PartnerProfile",
        entityId: partner.id,
        actorId: actor.id ?? null,
        actorLabel: actor.label,
        partnerId: partner.id,
        meta: {
          scenario,
          training: true,
          completedOrders,
          totalFeesInr: totalFees.toString(),
          noLiveFunds: true,
        },
      },
    });

    return { partnerId: partner.id, partnerUserId: partnerUser.id, companyId: company.id, scenario };
  }, { maxWait: 5_000, timeout: 30_000 });
}

export async function getTrainingWorkspaceSummary() {
  assertTrainingMode();
  const email = trainingPartnerEmail();
  const user = await db.user.findUnique({ where: { email }, include: { partner: true } });
  const passwordReady = (() => {
    try { trainingPassword(); return true; } catch { return false; }
  })();
  if (!user?.partner) {
    return {
      initialized: false as const,
      email,
      passwordReady,
      scenario: null,
      verificationStatus: null,
      reserveUsdt: 0,
      accountEnabled: false,
      queueOrders: 0,
      activeOrders: 0,
      completedOrders: 0,
      completedVolumeInr: 0,
      commissionInr: 0,
      settlementStatus: null,
    };
  }

  const [verification, deposits, account, queueOrders, activeOrders, completed, settlement] = await Promise.all([
    db.verificationCase.findFirst({ where: { partnerId: user.partner.id }, orderBy: { createdAt: "desc" }, select: { status: true } }),
    db.partnerDeposit.findMany({ where: { partnerId: user.partner.id, status: "CONFIRMED" }, select: { amount: true, actualAmount: true } }),
    db.partnerProcessingAccount.findUnique({ where: { partnerId: user.partner.id }, select: { enabled: true } }),
    db.processingOrder.count({ where: { company: { user: { email: TRAINING_COMPANY_EMAIL } }, status: "AVAILABLE" } }),
    db.processingOrder.count({ where: { partnerId: user.partner.id, status: { in: ["ASSIGNED", "PAYMENT_MARKED", "PAYOUT_SENT", "DISPUTED"] } } }),
    db.processingOrder.aggregate({ where: { partnerId: user.partner.id, status: "COMPLETED" }, _count: { _all: true }, _sum: { amountInr: true, partnerFeeInr: true } }),
    db.processingSettlement.findFirst({ where: { partnerId: user.partner.id }, orderBy: { createdAt: "desc" }, select: { status: true } }),
  ]);
  const reserveUsdt = deposits.reduce((sum, item) => sum + Number((item.actualAmount ?? item.amount).toString()), 0);
  const scenario: TrainingScenario = completed._count._all > 0
    ? "HISTORY"
    : account?.enabled
      ? "ACTIVE"
      : verification?.status === "APPROVED"
        ? "RESERVE"
        : verification
          ? "VERIFICATION"
          : "NEW";

  return {
    initialized: true as const,
    email,
    passwordReady,
    scenario,
    verificationStatus: verification?.status ?? null,
    reserveUsdt,
    accountEnabled: Boolean(account?.enabled),
    queueOrders,
    activeOrders,
    completedOrders: completed._count._all,
    completedVolumeInr: Number(completed._sum.amountInr?.toString() ?? 0),
    commissionInr: Number(completed._sum.partnerFeeInr?.toString() ?? 0),
    settlementStatus: settlement?.status ?? null,
  };
}
