"use server";

import { Prisma, type PaymentRailStatus, type ProcessingOrderStatus, type ProcessingSettlementStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { actorLabel, requireRole, requireVerifiedRole, type SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { partnerProgramLevel } from "@/lib/partner-program";
import { encryptProcessingData, initials, maskDestination } from "@/lib/processing-data";
import { paymentRailSchema, processingAccountSchema, processingOrderSchema } from "@/lib/processing-schemas";
import { createReference } from "@/lib/secure-token";
import { isTrainingAccountEmail } from "@/lib/training";

const PARTNER_PROCESSING_PATH = "/partner/processing";
const COMPANY_PROCESSING_PATH = "/company/processing";
const ADMIN_PROCESSING_PATH = "/admin/processing";

class ProcessingActionError extends Error {}

function text(fd: FormData, key: string) {
  const value = fd.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function fieldRecord(fd: FormData, fields: readonly string[]) {
  return Object.fromEntries(fields.map((field) => [field, text(fd, field)]));
}

function finish(path: string, kind: "notice" | "error", message: string): never {
  revalidateProcessingPaths();
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
}

function revalidateProcessingPaths(orderId?: string) {
  revalidatePath(PARTNER_PROCESSING_PATH);
  revalidatePath(COMPANY_PROCESSING_PATH);
  revalidatePath(ADMIN_PROCESSING_PATH);
  revalidatePath("/partner");
  revalidatePath("/company");
  revalidatePath("/admin");
  if (orderId) {
    revalidatePath(`/partner/processing/${orderId}`);
    revalidatePath(`/company/processing/${orderId}`);
    revalidatePath(`/admin/processing/${orderId}`);
  }
}

function firstIssue(result: { success: false; error: { issues: Array<{ message: string }> } }) {
  return result.error.issues[0]?.message ?? "Check the highlighted processing fields.";
}

function decimal(value: number | string) {
  return new Prisma.Decimal(value);
}

function feeFor(amount: Prisma.Decimal, bps: number) {
  return amount.mul(bps).div(10_000).toDecimalPlaces(2);
}

async function recordEvent(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    fromStatus?: ProcessingOrderStatus | null;
    toStatus: ProcessingOrderStatus;
    user: SessionUser;
    note?: string | null;
    meta?: Prisma.InputJsonValue;
  },
) {
  await tx.processingOrderEvent.create({
    data: {
      orderId: input.orderId,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus,
      actorId: input.user.id,
      actorLabel: actorLabel(input.user),
      actorRole: input.user.role,
      note: input.note ?? null,
      meta: input.meta,
    },
  });
}

async function releaseExposure(tx: Prisma.TransactionClient, partnerId: string, amount: Prisma.Decimal) {
  const account = await tx.partnerProcessingAccount.findUnique({ where: { partnerId } });
  if (!account) return;
  const remaining = account.lockedExposureInr.minus(amount);
  const next = remaining.lt(0) ? decimal(0) : remaining;
  await tx.partnerProcessingAccount.update({
    where: { id: account.id },
    data: { lockedExposureInr: next, version: { increment: 1 } },
  });
}

async function notifyOrderCompany(companyUserId: string, _title: string, _body: string, orderId: string) {
  await notify(companyUserId, { title: "Processing order updated", body: "A processing order changed. Open the secure workspace for details.", telegramHtml: "<b>Processing order updated</b>\nOpen your secure INRP2P workspace for details.", link: `/company/processing/${orderId}` });
}

async function notifyOrderPartner(partnerUserId: string, _title: string, _body: string, orderId: string) {
  await notify(partnerUserId, { title: "Processing order updated", body: "A processing order changed. Open the secure workspace for details.", telegramHtml: "<b>Processing order updated</b>\nOpen your secure INRP2P workspace for details.", link: `/partner/processing/${orderId}` });
}

export async function createPaymentRail(fd: FormData) {
  const user = await requireVerifiedRole("PARTNER");
  if (!user.partner) redirect("/login");
  if (isTrainingAccountEmail(user.email)) {
    finish(PARTNER_PROCESSING_PATH, "error", "Training payment rails are prepared in Training Studio. Never enter real bank details in a training account.");
  }
  if (["REJECTED", "SUSPENDED"].includes(user.partner.status)) {
    finish(PARTNER_PROCESSING_PATH, "error", "Payment rails are unavailable while this partner account is restricted.");
  }

  const parsed = paymentRailSchema.safeParse(fieldRecord(fd, [
    "type", "label", "accountHolder", "upiId", "bankName", "accountNumber", "ifsc",
    "minTicketInr", "maxTicketInr", "dailyLimitInr",
  ]));
  if (!parsed.success) finish(PARTNER_PROCESSING_PATH, "error", firstIssue(parsed));

  const data = parsed.data;
  const destination = data.type === "UPI" ? data.upiId : data.accountNumber;
  const rail = await db.partnerPaymentRail.create({
    data: {
      reference: createReference("RAIL"),
      partnerId: user.partner.id,
      type: data.type,
      label: data.label,
      bankName: data.bankName || null,
      maskedDestination: maskDestination(destination),
      encryptedDetails: encryptProcessingData({
        accountHolder: data.accountHolder,
        upiId: data.upiId || undefined,
        bankName: data.bankName || undefined,
        accountNumber: data.accountNumber || undefined,
        ifsc: data.ifsc.toUpperCase() || undefined,
      }),
      minTicketInr: data.minTicketInr ? decimal(data.minTicketInr) : null,
      maxTicketInr: data.maxTicketInr ? decimal(data.maxTicketInr) : null,
      dailyLimitInr: data.dailyLimitInr ? decimal(data.dailyLimitInr) : null,
    },
  });
  await audit({
    action: "processing.rail_created",
    entityType: "PartnerPaymentRail",
    entityId: rail.id,
    actorId: user.id,
    actorLabel: actorLabel(user),
    partnerId: user.partner.id,
    meta: { reference: rail.reference, type: rail.type, maskedDestination: rail.maskedDestination },
  });
  finish(PARTNER_PROCESSING_PATH, "notice", "Payment rail encrypted and sent to operations for review.");
}

export async function updatePaymentRailStatus(fd: FormData) {
  const user = await requireVerifiedRole("PARTNER");
  if (!user.partner) redirect("/login");
  const status = text(fd, "status") as PaymentRailStatus;
  if (!["ACTIVE", "PAUSED", "DISABLED"].includes(status)) {
    finish(PARTNER_PROCESSING_PATH, "error", "Invalid payment rail status.");
  }
  const rail = await db.partnerPaymentRail.findFirst({ where: { id: text(fd, "railId"), partnerId: user.partner.id } });
  if (!rail) finish(PARTNER_PROCESSING_PATH, "error", "Payment rail not found.");
  if (rail.status === "PENDING_REVIEW") {
    finish(PARTNER_PROCESSING_PATH, "error", "This rail is still waiting for operator review.");
  }
  if (rail.status === "DISABLED" && status !== "DISABLED") {
    finish(PARTNER_PROCESSING_PATH, "error", "A disabled rail cannot be reactivated; add a fresh verified destination.");
  }
  await db.partnerPaymentRail.update({ where: { id: rail.id }, data: { status } });
  await audit({ action: "processing.rail_status_changed", entityType: "PartnerPaymentRail", entityId: rail.id, actorId: user.id, actorLabel: actorLabel(user), partnerId: user.partner.id, meta: { from: rail.status, to: status } });
  finish(PARTNER_PROCESSING_PATH, "notice", `Payment rail ${status === "ACTIVE" ? "activated" : status === "PAUSED" ? "paused" : "disabled"}.`);
}

export async function reviewPaymentRail(fd: FormData) {
  const admin = await requireRole("ADMIN");
  const decision = text(fd, "decision");
  const note = text(fd, "note");
  if (!["approve", "reject"].includes(decision) || note.length < 5) {
    finish(ADMIN_PROCESSING_PATH, "error", "Record the rail review evidence and select a valid decision.");
  }
  const rail = await db.partnerPaymentRail.findUnique({ where: { id: text(fd, "railId") }, include: { partner: true } });
  if (!rail || rail.status !== "PENDING_REVIEW") finish(ADMIN_PROCESSING_PATH, "error", "This rail is no longer waiting for review.");
  const next: PaymentRailStatus = decision === "approve" ? "ACTIVE" : "DISABLED";
  await db.partnerPaymentRail.update({ where: { id: rail.id }, data: { status: next, reviewedById: admin.id, reviewNote: note, reviewedAt: new Date() } });
  await audit({ action: "processing.rail_reviewed", entityType: "PartnerPaymentRail", entityId: rail.id, actorId: admin.id, actorLabel: "Operator", partnerId: rail.partnerId, meta: { decision, from: rail.status, to: next, maskedDestination: rail.maskedDestination, note } });
  await notify(rail.partner.userId, { title: "Payment rail review completed", body: "A payment rail review was completed. Open the secure workspace for the decision.", telegramHtml: "<b>Payment rail review completed</b>\nOpen your secure INRP2P workspace for the decision.", link: PARTNER_PROCESSING_PATH });
  finish(ADMIN_PROCESSING_PATH, "notice", `Payment rail ${decision === "approve" ? "approved" : "rejected"}.`);
}

export async function configureProcessingAccount(fd: FormData) {
  const admin = await requireRole("ADMIN");
  const parsed = processingAccountSchema.safeParse(fieldRecord(fd, ["partnerId", "enabled", "approvedLimitInr", "payInFeeBps", "payOutFeeBps"]));
  if (!parsed.success) finish(ADMIN_PROCESSING_PATH, "error", firstIssue(parsed));
  const data = parsed.data;
  const partner = await db.partnerProfile.findUnique({ where: { id: data.partnerId }, include: { deposits: { where: { status: "CONFIRMED" } } } });
  if (!partner) finish(ADMIN_PROCESSING_PATH, "error", "Partner not found.");
  const confirmedReserve = partner.deposits.reduce((sum, item) => sum.plus(item.actualAmount ?? item.amount), decimal(0));
  const selectedLevel = partnerProgramLevel(partner.programLevel);
  const requiredReserve = decimal(selectedLevel.activationReserveUsdt);
  if (data.enabled && !["VERIFIED", "LIMITED"].includes(partner.status)) {
    finish(ADMIN_PROCESSING_PATH, "error", "Only a verified or limited partner can enter the processing queue.");
  }
  if (data.enabled && confirmedReserve.lt(requiredReserve)) {
    finish(
      ADMIN_PROCESSING_PATH,
      "error",
      `${selectedLevel.name} requires ${requiredReserve.toString()} USDT confirmed reserve before enabling live processing.`,
    );
  }
  const existing = await db.partnerProcessingAccount.findUnique({ where: { partnerId: partner.id } });
  if (existing && decimal(data.approvedLimitInr).lt(existing.lockedExposureInr)) {
    finish(ADMIN_PROCESSING_PATH, "error", "Approved limit cannot be lower than the partner's currently locked exposure.");
  }
  const account = await db.partnerProcessingAccount.upsert({
    where: { partnerId: partner.id },
    create: {
      partnerId: partner.id,
      enabled: data.enabled,
      approvedLimitInr: decimal(data.approvedLimitInr),
      payInFeeBps: data.payInFeeBps,
      payOutFeeBps: data.payOutFeeBps,
    },
    update: {
      enabled: data.enabled,
      approvedLimitInr: decimal(data.approvedLimitInr),
      payInFeeBps: data.payInFeeBps,
      payOutFeeBps: data.payOutFeeBps,
      version: { increment: 1 },
    },
  });
  await audit({ action: "processing.account_configured", entityType: "PartnerProcessingAccount", entityId: account.id, actorId: admin.id, actorLabel: "Operator", partnerId: partner.id, meta: { enabled: data.enabled, approvedLimitInr: data.approvedLimitInr, payInFeeBps: data.payInFeeBps, payOutFeeBps: data.payOutFeeBps, programLevel: selectedLevel.code, requiredReserveUsdt: requiredReserve.toString(), confirmedReserveUsdt: confirmedReserve.toString() } });
  finish(ADMIN_PROCESSING_PATH, "notice", `${partner.displayName} processing controls updated.`);
}

async function createOrderForCompany(user: SessionUser, companyId: string, fd: FormData, returnPath: string) {
  const parsed = processingOrderSchema.safeParse(fieldRecord(fd, [
    "externalReference", "type", "requestedRail", "amountInr", "expiryMinutes", "payerName",
    "payerReference", "beneficiaryName", "upiId", "bankName", "accountNumber", "ifsc", "companyNote",
  ]));
  if (!parsed.success) finish(returnPath, "error", firstIssue(parsed));
  const data = parsed.data;
  const paymentData = data.type === "PAY_IN"
    ? { payerName: data.payerName, payerReference: data.payerReference || undefined }
    : { beneficiaryName: data.beneficiaryName, upiId: data.upiId || undefined, bankName: data.bankName || undefined, accountNumber: data.accountNumber || undefined, ifsc: data.ifsc.toUpperCase() || undefined };
  const counterpartyLabel = data.type === "PAY_IN"
    ? initials(data.payerName)
    : `${initials(data.beneficiaryName)} · ${maskDestination(data.requestedRail === "UPI" ? data.upiId : data.accountNumber)}`;

  try {
    const order = await db.$transaction(async (tx) => {
      const created = await tx.processingOrder.create({
        data: {
          reference: createReference("ORD"),
          externalReference: data.externalReference,
          companyId,
          type: data.type,
          requestedRail: data.requestedRail,
          amountInr: decimal(data.amountInr),
          counterpartyLabel,
          encryptedPaymentData: encryptProcessingData(paymentData),
          companyNote: data.companyNote || null,
          createdById: user.id,
          expiresAt: new Date(Date.now() + data.expiryMinutes * 60 * 1000),
        },
      });
      await recordEvent(tx, { orderId: created.id, toStatus: "AVAILABLE", user, note: "Order released to the verified partner queue." });
      return created;
    });
    await audit({ action: "processing.order_created", entityType: "ProcessingOrder", entityId: order.id, actorId: user.id, actorLabel: actorLabel(user), meta: { reference: order.reference, companyId, type: order.type, amountInr: order.amountInr.toString(), requestedRail: order.requestedRail } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      finish(returnPath, "error", "This merchant order reference already exists for the company.");
    }
    throw error;
  }
  finish(returnPath, "notice", "Order released to the live processing queue.");
}

export async function createProcessingOrder(fd: FormData) {
  const user = await requireVerifiedRole("COMPANY");
  if (!user.company) redirect("/login");
  const organization = await db.organization.findUnique({
    where: { companyProfileId: user.company.id },
    include: {
      verificationCases: { where: { status: "APPROVED", expiresAt: { gt: new Date() } }, take: 1 },
      partnerConnections: { where: { status: "ACTIVE", partner: { processingAccount: { is: { enabled: true } }, status: { in: ["VERIFIED", "LIMITED"] } } }, take: 1 },
    },
  });
  if (!organization?.verificationCases.length) {
    finish(COMPANY_PROCESSING_PATH, "error", "Company verification must be approved before releasing live processing orders.");
  }
  if (!organization.partnerConnections.length) {
    finish(COMPANY_PROCESSING_PATH, "error", "Connect at least one enabled processing partner before releasing a live order.");
  }
  return createOrderForCompany(user, user.company.id, fd, COMPANY_PROCESSING_PATH);
}

export async function createProcessingOrderAsAdmin(fd: FormData) {
  const admin = await requireRole("ADMIN");
  const companyId = text(fd, "companyId");
  const company = await db.companyProfile.findUnique({ where: { id: companyId } });
  if (!company) finish(ADMIN_PROCESSING_PATH, "error", "Select a valid merchant company.");
  return createOrderForCompany(admin, company.id, fd, ADMIN_PROCESSING_PATH);
}

export async function claimProcessingOrder(fd: FormData) {
  const user = await requireVerifiedRole("PARTNER");
  if (!user.partner) redirect("/login");
  const orderId = text(fd, "orderId");
  const railId = text(fd, "railId") || null;
  let claimed: { reference: string; companyUserId: string };

  try {
    claimed = await db.$transaction(async (tx) => {
      const order = await tx.processingOrder.findUnique({ where: { id: orderId }, include: { company: true } });
      if (!order || order.status !== "AVAILABLE" || order.partnerId) throw new ProcessingActionError("This order is no longer available.");
      if (order.expiresAt <= new Date()) throw new ProcessingActionError("This order has expired.");
      if (!["VERIFIED", "LIMITED"].includes(user.partner!.status)) throw new ProcessingActionError("Partner verification is required before taking live orders.");
      const connection = await tx.companyPartnerConnection.findFirst({ where: { partnerId: user.partner!.id, status: "ACTIVE", organization: { companyProfileId: order.companyId } }, select: { id: true } });
      if (!connection) throw new ProcessingActionError("This merchant is not in your active private network.");

      const [account, confirmedDeposits] = await Promise.all([
        tx.partnerProcessingAccount.findUnique({ where: { partnerId: user.partner!.id } }),
        tx.partnerDeposit.findMany({ where: { partnerId: user.partner!.id, status: "CONFIRMED" }, select: { amount: true, actualAmount: true } }),
      ]);
      if (!account?.enabled) throw new ProcessingActionError("Processing access is not enabled for this account.");
      if (!confirmedDeposits.some((item) => (item.actualAmount ?? item.amount).gt(0))) throw new ProcessingActionError("A confirmed insurance reserve is required before taking orders.");
      if (account.approvedLimitInr.minus(account.lockedExposureInr).lt(order.amountInr)) throw new ProcessingActionError("Available insurance limit is below this order amount.");

      let selectedRailId: string | null = null;
      if (order.type === "PAY_IN") {
        if (!railId) throw new ProcessingActionError("Select the payment rail that will receive this pay-in.");
        const rail = await tx.partnerPaymentRail.findFirst({ where: { id: railId, partnerId: user.partner!.id, status: "ACTIVE" } });
        if (!rail || rail.type !== order.requestedRail) throw new ProcessingActionError("The selected payment rail is not eligible for this order.");
        if (rail.minTicketInr && order.amountInr.lt(rail.minTicketInr)) throw new ProcessingActionError("Order amount is below this rail's minimum ticket.");
        if (rail.maxTicketInr && order.amountInr.gt(rail.maxTicketInr)) throw new ProcessingActionError("Order amount is above this rail's maximum ticket.");
        if (rail.dailyLimitInr) {
          const start = new Date();
          start.setUTCHours(0, 0, 0, 0);
          const used = await tx.processingOrder.aggregate({ where: { railId: rail.id, assignedAt: { gte: start }, status: { notIn: ["CANCELLED", "FAILED", "EXPIRED"] } }, _sum: { amountInr: true } });
          if ((used._sum.amountInr ?? decimal(0)).plus(order.amountInr).gt(rail.dailyLimitInr)) throw new ProcessingActionError("This rail's daily limit would be exceeded.");
        }
        selectedRailId = rail.id;
      }

      const feeBps = order.type === "PAY_IN" ? account.payInFeeBps : account.payOutFeeBps;
      const accountResult = await tx.partnerProcessingAccount.updateMany({
        where: { id: account.id, version: account.version, enabled: true },
        data: { lockedExposureInr: { increment: order.amountInr }, version: { increment: 1 } },
      });
      if (accountResult.count !== 1) throw new ProcessingActionError("Your processing balance changed. Refresh and take the order again.");
      const orderResult = await tx.processingOrder.updateMany({
        where: { id: order.id, status: "AVAILABLE", partnerId: null, version: order.version },
        data: { status: "ASSIGNED", partnerId: user.partner!.id, railId: selectedRailId, assignedAt: new Date(), partnerFeeBps: feeBps, partnerFeeInr: feeFor(order.amountInr, feeBps), version: { increment: 1 } },
      });
      if (orderResult.count !== 1) throw new ProcessingActionError("Another trader took this order first.");
      await recordEvent(tx, { orderId: order.id, fromStatus: "AVAILABLE", toStatus: "ASSIGNED", user, note: "Order taken by partner.", meta: { railId: selectedRailId, feeBps } });
      return { reference: order.reference, companyUserId: order.company.userId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof ProcessingActionError) finish(PARTNER_PROCESSING_PATH, "error", error.message);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") finish(PARTNER_PROCESSING_PATH, "error", "Another trader updated this order. Refresh the queue and try again.");
    throw error;
  }

  await audit({ action: "processing.order_claimed", entityType: "ProcessingOrder", entityId: orderId, actorId: user.id, actorLabel: actorLabel(user), partnerId: user.partner.id, meta: { reference: claimed.reference } });
  await notifyOrderCompany(claimed.companyUserId, "Processing order assigned", `${claimed.reference} has been taken by a verified processing partner.`, orderId);
  revalidateProcessingPaths(orderId);
  redirect(`/partner/processing/${orderId}?notice=${encodeURIComponent("Order assigned to your desk.")}`);
}

export async function releaseProcessingOrder(fd: FormData) {
  const user = await requireVerifiedRole("PARTNER");
  if (!user.partner) redirect("/login");
  const orderId = text(fd, "orderId");
  const order = await db.$transaction(async (tx) => {
    const current = await tx.processingOrder.findFirst({ where: { id: orderId, partnerId: user.partner!.id } });
    if (!current || current.status !== "ASSIGNED") throw new ProcessingActionError("Only an untouched assigned order can be released.");
    await releaseExposure(tx, user.partner!.id, current.amountInr);
    await tx.processingOrder.update({ where: { id: current.id }, data: { status: "AVAILABLE", partnerId: null, railId: null, assignedAt: null, partnerFeeBps: 0, partnerFeeInr: 0, version: { increment: 1 } } });
    await recordEvent(tx, { orderId: current.id, fromStatus: "ASSIGNED", toStatus: "AVAILABLE", user, note: text(fd, "note") || "Partner released the order before payment activity." });
    return current;
  }).catch((error: unknown) => {
    if (error instanceof ProcessingActionError) finish(PARTNER_PROCESSING_PATH, "error", error.message);
    throw error;
  });
  await audit({ action: "processing.order_released", entityType: "ProcessingOrder", entityId: order.id, actorId: user.id, actorLabel: actorLabel(user), partnerId: user.partner.id, meta: { from: "ASSIGNED", to: "AVAILABLE" } });
  finish(PARTNER_PROCESSING_PATH, "notice", "Order returned to the live queue and exposure released.");
}

export async function companyMarkPayInPaid(fd: FormData) {
  const user = await requireVerifiedRole("COMPANY");
  if (!user.company) redirect("/login");
  const orderId = text(fd, "orderId");
  const paymentReference = text(fd, "paymentReference");
  if (paymentReference.length < 4) finish(`/company/processing/${orderId}`, "error", "Enter the payer UTR or payment reference.");
  const order = await db.processingOrder.findFirst({ where: { id: orderId, companyId: user.company.id }, include: { partner: true } });
  if (!order || order.type !== "PAY_IN" || order.status !== "ASSIGNED" || !order.partner) finish(`/company/processing/${orderId}`, "error", "This pay-in is not waiting for payment confirmation.");
  await db.$transaction(async (tx) => {
    await tx.processingOrder.update({ where: { id: order.id }, data: { status: "PAYMENT_MARKED", paymentReference, paymentMarkedAt: new Date(), version: { increment: 1 } } });
    await recordEvent(tx, { orderId: order.id, fromStatus: "ASSIGNED", toStatus: "PAYMENT_MARKED", user, note: "Merchant marked the payer transfer as sent.", meta: { paymentReference } });
  });
  await audit({ action: "processing.payin_marked_paid", entityType: "ProcessingOrder", entityId: order.id, actorId: user.id, actorLabel: actorLabel(user), partnerId: order.partnerId, meta: { paymentReference } });
  await notifyOrderPartner(order.partner.userId, "Pay-in marked paid", `${order.reference} now requires receipt confirmation.`, order.id);
  finish(`/company/processing/${order.id}`, "notice", "Payment reference sent to the partner for receipt confirmation.");
}

export async function partnerConfirmPayIn(fd: FormData) {
  const user = await requireVerifiedRole("PARTNER");
  if (!user.partner) redirect("/login");
  const orderId = text(fd, "orderId");
  const order = await db.processingOrder.findFirst({ where: { id: orderId, partnerId: user.partner.id }, include: { company: true } });
  if (!order || order.type !== "PAY_IN" || order.status !== "PAYMENT_MARKED") finish(`/partner/processing/${orderId}`, "error", "This pay-in is not ready for receipt confirmation.");
  await db.$transaction(async (tx) => {
    await releaseExposure(tx, user.partner!.id, order.amountInr);
    await tx.processingOrder.update({ where: { id: order.id }, data: { status: "COMPLETED", completedAt: new Date(), version: { increment: 1 } } });
    await recordEvent(tx, { orderId: order.id, fromStatus: "PAYMENT_MARKED", toStatus: "COMPLETED", user, note: text(fd, "note") || "Partner confirmed INR receipt." });
  });
  await audit({ action: "processing.payin_completed", entityType: "ProcessingOrder", entityId: order.id, actorId: user.id, actorLabel: actorLabel(user), partnerId: user.partner.id, meta: { amountInr: order.amountInr.toString(), paymentReference: order.paymentReference } });
  await notifyOrderCompany(order.company.userId, "Pay-in completed", `${order.reference} receipt was confirmed by the processing partner.`, order.id);
  finish(`/partner/processing/${order.id}`, "notice", "Pay-in completed and insurance exposure released.");
}

export async function partnerSubmitPayout(fd: FormData) {
  const user = await requireVerifiedRole("PARTNER");
  if (!user.partner) redirect("/login");
  const orderId = text(fd, "orderId");
  const paymentReference = text(fd, "paymentReference");
  if (paymentReference.length < 4) finish(`/partner/processing/${orderId}`, "error", "Enter the payout UTR or payment reference.");
  const order = await db.processingOrder.findFirst({ where: { id: orderId, partnerId: user.partner.id }, include: { company: true } });
  if (!order || order.type !== "PAY_OUT" || order.status !== "ASSIGNED") finish(`/partner/processing/${orderId}`, "error", "This payout is not ready to be sent.");
  await db.$transaction(async (tx) => {
    await tx.processingOrder.update({ where: { id: order.id }, data: { status: "PAYOUT_SENT", paymentReference, payoutSentAt: new Date(), version: { increment: 1 } } });
    await recordEvent(tx, { orderId: order.id, fromStatus: "ASSIGNED", toStatus: "PAYOUT_SENT", user, note: text(fd, "note") || "Partner recorded the external INR payout.", meta: { paymentReference } });
  });
  await audit({ action: "processing.payout_sent", entityType: "ProcessingOrder", entityId: order.id, actorId: user.id, actorLabel: actorLabel(user), partnerId: user.partner.id, meta: { paymentReference, amountInr: order.amountInr.toString() } });
  await notifyOrderCompany(order.company.userId, "Payout sent", `${order.reference} has a UTR/payment reference and requires merchant confirmation.`, order.id);
  finish(`/partner/processing/${order.id}`, "notice", "Payout reference recorded. Waiting for merchant confirmation.");
}

export async function companyConfirmPayout(fd: FormData) {
  const user = await requireVerifiedRole("COMPANY");
  if (!user.company) redirect("/login");
  const orderId = text(fd, "orderId");
  const order = await db.processingOrder.findFirst({ where: { id: orderId, companyId: user.company.id }, include: { partner: true } });
  if (!order || order.type !== "PAY_OUT" || order.status !== "PAYOUT_SENT" || !order.partner) finish(`/company/processing/${orderId}`, "error", "This payout is not awaiting merchant confirmation.");
  await db.$transaction(async (tx) => {
    await releaseExposure(tx, order.partnerId!, order.amountInr);
    await tx.processingOrder.update({ where: { id: order.id }, data: { status: "COMPLETED", completedAt: new Date(), version: { increment: 1 } } });
    await recordEvent(tx, { orderId: order.id, fromStatus: "PAYOUT_SENT", toStatus: "COMPLETED", user, note: text(fd, "note") || "Merchant confirmed payout completion." });
  });
  await audit({ action: "processing.payout_completed", entityType: "ProcessingOrder", entityId: order.id, actorId: user.id, actorLabel: actorLabel(user), partnerId: order.partnerId, meta: { amountInr: order.amountInr.toString(), paymentReference: order.paymentReference } });
  await notifyOrderPartner(order.partner.userId, "Payout completed", `${order.reference} was confirmed by the merchant.`, order.id);
  finish(`/company/processing/${order.id}`, "notice", "Payout completed and partner exposure released.");
}

export async function raiseProcessingDispute(fd: FormData) {
  const user = await requireVerifiedRole(text(fd, "side") === "partner" ? "PARTNER" : "COMPANY");
  const orderId = text(fd, "orderId");
  const reason = text(fd, "reason");
  if (reason.length < 10) finish(user.role === "PARTNER" ? `/partner/processing/${orderId}` : `/company/processing/${orderId}`, "error", "Describe the dispute clearly in at least 10 characters.");
  const order = await db.processingOrder.findFirst({
    where: { id: orderId, ...(user.role === "PARTNER" ? { partnerId: user.partner?.id } : { companyId: user.company?.id }) },
    include: { company: true, partner: true },
  });
  if (!order || !["ASSIGNED", "PAYMENT_MARKED", "PAYOUT_SENT"].includes(order.status)) finish(user.role === "PARTNER" ? PARTNER_PROCESSING_PATH : COMPANY_PROCESSING_PATH, "error", "This order cannot be disputed from its current status.");
  const previous = order.status;
  await db.$transaction(async (tx) => {
    await tx.processingOrder.update({ where: { id: order.id }, data: { status: "DISPUTED", disputeReason: reason, disputedAt: new Date(), version: { increment: 1 } } });
    await recordEvent(tx, { orderId: order.id, fromStatus: previous, toStatus: "DISPUTED", user, note: reason });
  });
  await audit({ action: "processing.order_disputed", entityType: "ProcessingOrder", entityId: order.id, actorId: user.id, actorLabel: actorLabel(user), partnerId: order.partnerId, meta: { from: previous, to: "DISPUTED", reason } });
  if (!isTrainingAccountEmail(user.email)) {
    const admins = await db.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
    await Promise.all(admins.map((admin) => notify(admin.id, { title: "Processing dispute opened", body: "A live processing dispute requires operator review in the secure workspace.", telegramHtml: "<b>Processing dispute opened</b>\nReview it in the secure INRP2P workspace.", link: `/admin/processing/${order.id}` })));
  }
  finish(user.role === "PARTNER" ? `/partner/processing/${order.id}` : `/company/processing/${order.id}`, "notice", "Dispute opened. Exposure remains locked until operator resolution.");
}

export async function cancelProcessingOrder(fd: FormData) {
  const user = await requireVerifiedRole("COMPANY");
  if (!user.company) redirect("/login");
  const orderId = text(fd, "orderId");
  const order = await db.processingOrder.findFirst({ where: { id: orderId, companyId: user.company.id } });
  if (!order || order.status !== "AVAILABLE") finish(COMPANY_PROCESSING_PATH, "error", "Only an unassigned order can be cancelled.");
  await db.$transaction(async (tx) => {
    await tx.processingOrder.update({ where: { id: order.id }, data: { status: "CANCELLED", failureReason: text(fd, "note") || "Cancelled by merchant", version: { increment: 1 } } });
    await recordEvent(tx, { orderId: order.id, fromStatus: "AVAILABLE", toStatus: "CANCELLED", user, note: text(fd, "note") || "Merchant cancelled the unassigned order." });
  });
  await audit({ action: "processing.order_cancelled", entityType: "ProcessingOrder", entityId: order.id, actorId: user.id, actorLabel: actorLabel(user), meta: { from: "AVAILABLE", to: "CANCELLED" } });
  finish(COMPANY_PROCESSING_PATH, "notice", "Order cancelled before assignment.");
}

export async function resolveProcessingDispute(fd: FormData) {
  const admin = await requireRole("ADMIN");
  const orderId = text(fd, "orderId");
  const resolution = text(fd, "resolution") as "COMPLETED" | "FAILED";
  const note = text(fd, "note");
  if (!["COMPLETED", "FAILED"].includes(resolution) || note.length < 10) finish(`/admin/processing/${orderId}`, "error", "Select a resolution and record the evidence reviewed.");
  const order = await db.processingOrder.findUnique({ where: { id: orderId }, include: { company: true, partner: true } });
  if (!order || order.status !== "DISPUTED" || !order.partnerId) finish(ADMIN_PROCESSING_PATH, "error", "Only an open dispute can be resolved.");
  await db.$transaction(async (tx) => {
    await releaseExposure(tx, order.partnerId!, order.amountInr);
    await tx.processingOrder.update({ where: { id: order.id }, data: { status: resolution, completedAt: resolution === "COMPLETED" ? new Date() : null, failureReason: resolution === "FAILED" ? note : order.failureReason, internalNote: note, version: { increment: 1 } } });
    await recordEvent(tx, { orderId: order.id, fromStatus: "DISPUTED", toStatus: resolution, user: admin, note });
  });
  await audit({ action: "processing.dispute_resolved", entityType: "ProcessingOrder", entityId: order.id, actorId: admin.id, actorLabel: "Operator", partnerId: order.partnerId, meta: { from: "DISPUTED", to: resolution, note } });
  await Promise.all([
    notifyOrderCompany(order.company.userId, "Processing dispute resolved", `${order.reference} was resolved as ${resolution.toLowerCase()}.`, order.id),
    order.partner ? notifyOrderPartner(order.partner.userId, "Processing dispute resolved", `${order.reference} was resolved as ${resolution.toLowerCase()}.`, order.id) : Promise.resolve(),
  ]);
  finish(`/admin/processing/${order.id}`, "notice", "Dispute resolved and locked exposure released.");
}

export async function createProcessingSettlement(fd: FormData) {
  const admin = await requireRole("ADMIN");
  const companyId = text(fd, "companyId");
  const partnerId = text(fd, "partnerId");
  const dueAtRaw = text(fd, "dueAt");
  const dueAt = dueAtRaw ? new Date(`${dueAtRaw}T23:59:59.000Z`) : null;
  let settlement: { id: string; reference: string; orderCount: number };
  try {
    settlement = await db.$transaction(async (tx) => {
      const orders = await tx.processingOrder.findMany({ where: { companyId, partnerId, status: "COMPLETED", settlementId: null }, orderBy: { completedAt: "asc" } });
      if (!orders.length) throw new ProcessingActionError("No completed unsettled orders exist for this merchant and partner.");
      const grossPayIn = orders.filter((order) => order.type === "PAY_IN").reduce((sum, order) => sum.plus(order.amountInr), decimal(0));
      const grossPayOut = orders.filter((order) => order.type === "PAY_OUT").reduce((sum, order) => sum.plus(order.amountInr), decimal(0));
      const partnerFee = orders.reduce((sum, order) => sum.plus(order.partnerFeeInr), decimal(0));
      const created = await tx.processingSettlement.create({
        data: {
          reference: createReference("STL"), companyId, partnerId, periodStart: orders[0]!.createdAt,
          periodEnd: orders[orders.length - 1]!.completedAt ?? new Date(), grossPayInInr: grossPayIn,
          grossPayOutInr: grossPayOut, partnerFeeInr: partnerFee, netPositionInr: grossPayIn.minus(grossPayOut),
          dueAt, note: text(fd, "note") || null, createdById: admin.id,
        },
      });
      const attached = await tx.processingOrder.updateMany({ where: { id: { in: orders.map((order) => order.id) }, settlementId: null }, data: { settlementId: created.id } });
      if (attached.count !== orders.length) throw new ProcessingActionError("Some orders were added to another settlement. Refresh and try again.");
      return { id: created.id, reference: created.reference, orderCount: orders.length };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof ProcessingActionError) finish(ADMIN_PROCESSING_PATH, "error", error.message);
    throw error;
  }
  await audit({ action: "processing.settlement_created", entityType: "ProcessingSettlement", entityId: settlement.id, actorId: admin.id, actorLabel: "Operator", partnerId, meta: { reference: settlement.reference, companyId, orderCount: settlement.orderCount } });
  finish(ADMIN_PROCESSING_PATH, "notice", `${settlement.reference} created from ${settlement.orderCount} completed orders.`);
}

const SETTLEMENT_TRANSITIONS: Record<ProcessingSettlementStatus, ProcessingSettlementStatus[]> = {
  OPEN: ["READY", "DISPUTED", "CANCELLED"],
  READY: ["SUBMITTED", "DISPUTED", "CANCELLED"],
  SUBMITTED: ["CONFIRMED", "DISPUTED"],
  CONFIRMED: [],
  DISPUTED: ["READY", "CANCELLED"],
  CANCELLED: [],
};

export async function updateProcessingSettlement(fd: FormData) {
  const admin = await requireRole("ADMIN");
  const settlementId = text(fd, "settlementId");
  const next = text(fd, "status") as ProcessingSettlementStatus;
  const note = text(fd, "note");
  const current = await db.processingSettlement.findUnique({ where: { id: settlementId } });
  if (!current || !SETTLEMENT_TRANSITIONS[current.status].includes(next)) finish(ADMIN_PROCESSING_PATH, "error", "Invalid settlement status transition.");
  const settlementRate = text(fd, "settlementRate");
  const settlementAmountUsdt = text(fd, "settlementAmountUsdt");
  const transactionHash = text(fd, "transactionHash");
  if (next === "SUBMITTED" && transactionHash.length < 4) finish(ADMIN_PROCESSING_PATH, "error", "Record the external settlement reference or TXID before submission.");
  if (["DISPUTED", "CANCELLED"].includes(next) && note.length < 10) finish(ADMIN_PROCESSING_PATH, "error", "Record a clear reason for this settlement decision.");
  await db.$transaction(async (tx) => {
    await tx.processingSettlement.update({ where: { id: current.id }, data: {
      status: next, note: note || current.note,
      settlementRate: settlementRate ? decimal(settlementRate) : current.settlementRate,
      settlementAmountUsdt: settlementAmountUsdt ? decimal(settlementAmountUsdt) : current.settlementAmountUsdt,
      transactionHash: transactionHash || current.transactionHash,
      submittedAt: next === "SUBMITTED" ? new Date() : current.submittedAt,
      confirmedAt: next === "CONFIRMED" ? new Date() : current.confirmedAt,
    } });
    if (next === "CANCELLED") await tx.processingOrder.updateMany({ where: { settlementId: current.id }, data: { settlementId: null } });
  });
  await audit({ action: "processing.settlement_status_changed", entityType: "ProcessingSettlement", entityId: current.id, actorId: admin.id, actorLabel: "Operator", partnerId: current.partnerId, meta: { from: current.status, to: next, transactionHash: transactionHash || undefined, note: note || undefined } });
  finish(ADMIN_PROCESSING_PATH, "notice", `Settlement moved to ${next.toLowerCase().replaceAll("_", " ")}.`);
}

export async function partnerDisputeSettlement(fd: FormData) {
  const user = await requireVerifiedRole("PARTNER");
  if (!user.partner) redirect("/login");
  const settlementId = text(fd, "settlementId");
  const reason = text(fd, "reason");
  if (reason.length < 10) finish(PARTNER_PROCESSING_PATH, "error", "Describe the settlement discrepancy clearly.");
  const settlement = await db.processingSettlement.findFirst({ where: { id: settlementId, partnerId: user.partner.id, status: { in: ["OPEN", "READY", "SUBMITTED"] } } });
  if (!settlement) finish(PARTNER_PROCESSING_PATH, "error", "This settlement can no longer be disputed.");
  await db.processingSettlement.update({ where: { id: settlement.id }, data: { status: "DISPUTED", note: reason } });
  await audit({ action: "processing.settlement_disputed", entityType: "ProcessingSettlement", entityId: settlement.id, actorId: user.id, actorLabel: actorLabel(user), partnerId: user.partner.id, meta: { from: settlement.status, to: "DISPUTED", reason } });
  finish(PARTNER_PROCESSING_PATH, "notice", "Settlement dispute opened for operator review.");
}
