"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { isValidDepositAmount, normalizeDepositTxHash } from "@/lib/deposit-policy";
import { companyUsdtTrc20Address } from "@/lib/deposit-wallet";
import { ensurePartnerDepositLedger } from "@/lib/deposit-ledger";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { partnerProgramLevel } from "@/lib/partner-program";
import { createReference } from "@/lib/secure-token";

const DEPOSIT_PATH = "/partner/deposit";
const ADMIN_PATH = "/admin/deposits";

function text(fd: FormData, key: string) {
  const value = fd.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function finish(
  path: string,
  kind: "notice" | "error",
  message: string,
  extra?: Record<string, string | undefined>,
): never {
  revalidatePath(path);
  const query = new URLSearchParams({ [kind]: message });
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value) query.set(key, value);
  }
  redirect(`${path}?${query.toString()}`);
}

function decimalAmount(raw: string): Prisma.Decimal | null {
  return isValidDepositAmount(raw) ? new Prisma.Decimal(raw) : null;
}

async function notifyOperators(title: string, body: string) {
  const admins = await db.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  await Promise.all(admins.map((admin) => notify(admin.id, {
    title,
    body,
    telegramHtml: `🔔 <b>${title}</b>\n${body}`,
    link: ADMIN_PATH,
  })));
}

/** Record the moment a partner chooses a preview order and begins activation. */
export async function beginPartnerActivation(fd: FormData) {
  const user = await requireRole("PARTNER");
  if (!user.partner) redirect("/login");
  const selectedLevel = partnerProgramLevel(text(fd, "programLevel"));
  const requestedOrder = text(fd, "sourceOrder");
  const sourceOrder = /^PX-(?:IN|OUT)-\d{4}$/.test(requestedOrder) ? requestedOrder : null;

  if (!sourceOrder) {
    finish("/partner/processing", "error", "Choose an order from the preview queue to begin activation.");
  }
  if (["REJECTED", "SUSPENDED"].includes(user.partner.status)) {
    finish("/partner/processing", "error", "Order activation is unavailable while this partner account is restricted.");
  }

  await audit({
    action: "partner.activation_started",
    entityType: "PartnerProfile",
    entityId: user.partner.id,
    actorId: user.id,
    actorLabel: user.partner.displayName,
    partnerId: user.partner.id,
    meta: { programLevel: selectedLevel.code, sourceOrder },
  });

  redirect(`/partner/deposit?plan=${selectedLevel.code}&order=${sourceOrder}`);
}

/** Create a reserve intent against the configured company USDT-TRC20 address. */
export async function createPartnerDeposit(fd: FormData) {
  const user = await requireRole("PARTNER");
  if (!user.partner) redirect("/login");
  const selectedLevel = partnerProgramLevel(text(fd, "programLevel"));
  const requestedOrder = text(fd, "sourceOrder");
  const sourceOrder = /^PX-(?:IN|OUT)-\d{4}$/.test(requestedOrder) ? requestedOrder : undefined;
  const activationQuery = { plan: selectedLevel.code, order: sourceOrder };
  if (["REJECTED", "SUSPENDED"].includes(user.partner.status)) {
    finish(DEPOSIT_PATH, "error", "Deposits are unavailable while this partner account is restricted.", activationQuery);
  }

  const amount = decimalAmount(text(fd, "amount"));
  if (!amount) finish(DEPOSIT_PATH, "error", "Enter a USDT amount from 10 to 1,000,000 with up to 6 decimals.", activationQuery);
  const destinationAddress = companyUsdtTrc20Address();
  if (!destinationAddress) finish(DEPOSIT_PATH, "error", "The company USDT-TRC20 wallet is not configured. Do not send funds yet.", activationQuery);

  await ensurePartnerDepositLedger();

  await db.partnerDeposit.updateMany({
    where: { partnerId: user.partner.id, status: "AWAITING_PAYMENT", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED", providerStatus: "expired_locally" },
  });
  const openInstructions = await db.partnerDeposit.count({
    where: { partnerId: user.partner.id, status: { in: ["AWAITING_PAYMENT", "CONFIRMING"] } },
  });
  if (openInstructions >= 3) {
    finish(DEPOSIT_PATH, "error", "You already have three active deposit instructions. Complete or wait for one to expire.", activationQuery);
  }

  const deposit = await db.partnerDeposit.create({
    data: {
      reference: createReference("DEP"),
      partnerId: user.partner.id,
      amount,
      provider: "DIRECT_TRC20",
      providerStatus: "awaiting_transfer",
      destinationAddress,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  await audit({
    action: "deposit.intent_created",
    entityType: "PartnerDeposit",
    entityId: deposit.id,
    actorId: user.id,
    actorLabel: user.partner.displayName,
    partnerId: user.partner.id,
    meta: {
      reference: deposit.reference,
      amount: amount.toString(),
      network: "TRC20",
      provider: "DIRECT_TRC20",
      destinationAddress,
      programLevel: selectedLevel.code,
      sourceOrder,
    },
  });
  finish(DEPOSIT_PATH, "notice", "Reserve instruction created. Send the exact amount, then submit the transaction hash.", activationQuery);
}

/** Partner reports the immutable on-chain transaction for operator review. */
export async function submitPartnerDepositTransaction(fd: FormData) {
  const user = await requireRole("PARTNER");
  if (!user.partner) redirect("/login");
  const depositId = text(fd, "depositId");
  const transactionHash = normalizeDepositTxHash(text(fd, "transactionHash"));
  if (!transactionHash) finish(DEPOSIT_PATH, "error", "Enter a valid 64-character TRON transaction hash.");

  await ensurePartnerDepositLedger();

  const deposit = await db.partnerDeposit.findFirst({
    where: { id: depositId, partnerId: user.partner.id },
  });
  if (!deposit) finish(DEPOSIT_PATH, "error", "Deposit instruction not found.");
  if (!["AWAITING_PAYMENT", "CONFIRMING", "EXPIRED"].includes(deposit.status)) {
    finish(DEPOSIT_PATH, "error", "This deposit is already final and cannot be changed.");
  }
  if (!deposit.destinationAddress) {
    finish(DEPOSIT_PATH, "error", "This legacy deposit has no company wallet attached. Contact operations before sending funds.");
  }
  const duplicate = await db.partnerDeposit.findFirst({
    where: { id: { not: deposit.id }, OR: [{ transactionHash }, { refundTransactionHash: transactionHash }] },
    select: { id: true },
  });
  if (duplicate) finish(DEPOSIT_PATH, "error", "This transaction hash is already attached to another ledger entry.");

  try {
    const result = await db.partnerDeposit.updateMany({
      where: { id: deposit.id, partnerId: user.partner.id, status: { in: ["AWAITING_PAYMENT", "CONFIRMING", "EXPIRED"] } },
      data: { status: "CONFIRMING", transactionHash, submittedAt: new Date(), providerStatus: "tx_submitted" },
    });
    if (result.count !== 1) finish(DEPOSIT_PATH, "error", "This deposit changed while you were submitting it. Refresh and try again.");
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      finish(DEPOSIT_PATH, "error", "This transaction hash is already attached to another ledger entry.");
    }
    throw error;
  }
  await audit({
    action: "deposit.transaction_submitted",
    entityType: "PartnerDeposit",
    entityId: deposit.id,
    actorId: user.id,
    actorLabel: user.partner.displayName,
    partnerId: deposit.partnerId,
    meta: { transactionHash, amount: deposit.amount.toString(), destinationAddress: deposit.destinationAddress },
  });
  await notifyOperators(
    "USDT deposit awaiting review",
    `${user.partner.displayName} submitted ${deposit.reference} for ${deposit.amount.toString()} USDT.`,
  );
  revalidatePath("/partner");
  revalidatePath(ADMIN_PATH);
  finish(DEPOSIT_PATH, "notice", "Transaction submitted. Operations will verify the address, token, amount and confirmations on TRON.");
}

/** Audited operator override for exceptional cases and full reserve refunds. */
export async function reviewPartnerDeposit(fd: FormData) {
  const admin = await requireRole("ADMIN");
  await ensurePartnerDepositLedger();
  const depositId = text(fd, "depositId");
  const decision = text(fd, "decision");
  const note = text(fd, "note");
  const deposit = await db.partnerDeposit.findUnique({
    where: { id: depositId },
    include: { partner: true },
  });
  if (!deposit) finish(ADMIN_PATH, "error", "Deposit not found.");

  const now = new Date();
  let nextStatus = deposit.status;
  let transactionHash: string | undefined;
  let refundTransactionHash: string | undefined;
  let actualAmount: Prisma.Decimal | undefined;

  if (decision === "confirm") {
    if (deposit.status !== "CONFIRMING") finish(ADMIN_PATH, "error", "The partner must submit a transaction hash before confirmation.");
    transactionHash = normalizeDepositTxHash(deposit.transactionHash ?? "") ?? undefined;
    if (!transactionHash || !deposit.destinationAddress) finish(ADMIN_PATH, "error", "The submitted transfer record is incomplete and cannot be confirmed.");
    actualAmount = decimalAmount(text(fd, "actualAmount")) ?? undefined;
    if (!actualAmount) finish(ADMIN_PATH, "error", "Enter the amount actually received before confirming.");
    if (!note) finish(ADMIN_PATH, "error", "Explain the evidence used for this manual confirmation.");
    nextStatus = "CONFIRMED";
  } else if (decision === "reject") {
    if (!["AWAITING_PAYMENT", "CONFIRMING", "EXPIRED"].includes(deposit.status)) finish(ADMIN_PATH, "error", "Only a non-final deposit can be rejected.");
    if (!note) finish(ADMIN_PATH, "error", "A rejection reason is required.");
    nextStatus = "REJECTED";
  } else if (decision === "refund") {
    if (deposit.status !== "CONFIRMED") finish(ADMIN_PATH, "error", "Only a confirmed deposit can be marked refunded.");
    refundTransactionHash = normalizeDepositTxHash(text(fd, "refundTransactionHash")) ?? undefined;
    if (!refundTransactionHash) finish(ADMIN_PATH, "error", "A valid refund transaction hash is required.");
    const duplicate = await db.partnerDeposit.findFirst({ where: { id: { not: deposit.id }, OR: [{ transactionHash: refundTransactionHash }, { refundTransactionHash }] }, select: { id: true } });
    if (duplicate) finish(ADMIN_PATH, "error", "This refund transaction hash is already recorded.");
    if (!note) finish(ADMIN_PATH, "error", "A refund note is required.");
    nextStatus = "REFUNDED";
  } else {
    finish(ADMIN_PATH, "error", "Invalid deposit decision.");
  }

  const result = await db.partnerDeposit.updateMany({
    where: { id: deposit.id, status: deposit.status },
    data: {
      status: nextStatus,
      actualAmount,
      transactionHash,
      refundTransactionHash,
      providerStatus: decision === "confirm" ? "operator_confirmed" : decision === "refund" ? "operator_refunded" : "operator_rejected",
      reviewedById: admin.id,
      reviewNote: note,
      confirmedAt: decision === "confirm" ? now : deposit.confirmedAt,
      refundedAt: decision === "refund" ? now : deposit.refundedAt,
    },
  });
  if (result.count !== 1) finish(ADMIN_PATH, "error", "This deposit changed while you were reviewing it. Refresh before taking another action.");
  await audit({
    action: `deposit.${decision === "confirm" ? "manually_confirmed" : decision === "refund" ? "refunded" : "rejected"}`,
    entityType: "PartnerDeposit",
    entityId: deposit.id,
    actorId: admin.id,
    actorLabel: "Operator",
    partnerId: deposit.partnerId,
    meta: { from: deposit.status, to: nextStatus, note, transactionHash, refundTransactionHash },
  });
  await notify(deposit.partner.userId, {
    title: nextStatus === "CONFIRMED" ? "USDT reserve confirmed" : nextStatus === "REFUNDED" ? "USDT reserve refunded" : "Deposit rejected",
    body: nextStatus === "CONFIRMED" ? `${(actualAmount ?? deposit.amount).toString()} USDT has been credited to your reserve.` : nextStatus === "REFUNDED" ? `${(deposit.actualAmount ?? deposit.amount).toString()} USDT has been marked refunded.` : `Deposit ${deposit.reference} was rejected. Open the deposit page for details.`,
    telegramHtml: nextStatus === "CONFIRMED" ? `✅ <b>USDT reserve confirmed</b>\n${(actualAmount ?? deposit.amount).toString()} USDT credited.` : nextStatus === "REFUNDED" ? `↩️ <b>USDT reserve refunded</b>\nDeposit ${deposit.reference}.` : `❌ <b>Deposit rejected</b>\n${deposit.reference}`,
    link: DEPOSIT_PATH,
  });
  revalidatePath(DEPOSIT_PATH);
  revalidatePath("/partner");
  revalidatePath(`/admin/partners/${deposit.partnerId}`);
  finish(ADMIN_PATH, "notice", `Deposit ${deposit.reference} updated to ${nextStatus.toLowerCase().replaceAll("_", " ")}.`);
}
