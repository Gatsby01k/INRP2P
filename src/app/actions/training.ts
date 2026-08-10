"use server";

import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { actorLabel, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { partnerProgramLevel } from "@/lib/partner-program";
import {
  assertTrainingMode,
  isTrainingAccountEmail,
  isTrainingScenario,
} from "@/lib/training";
import { applyTrainingScenario } from "@/lib/training-workspace";

function text(fd: FormData, key: string) {
  const value = fd.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function finish(path: string, kind: "notice" | "error", message: string): never {
  revalidatePath("/admin/training");
  revalidatePath("/partner");
  revalidatePath("/partner/verification");
  revalidatePath("/partner/deposit");
  revalidatePath("/partner/processing");
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
}

function requireTrainingPartner(user: Awaited<ReturnType<typeof requireRole>>) {
  assertTrainingMode();
  if (!user.partner || !isTrainingAccountEmail(user.email)) {
    throw new Error("This action is restricted to the isolated Training Mode account.");
  }
  return user.partner;
}

export async function setTrainingScenario(fd: FormData) {
  const admin = await requireRole("ADMIN");
  const scenario = text(fd, "scenario");
  if (!isTrainingScenario(scenario)) finish("/admin/training", "error", "Select a valid training scenario.");
  try {
    await applyTrainingScenario(scenario, { id: admin.id, label: "Training Studio operator" });
  } catch (error) {
    finish("/admin/training", "error", error instanceof Error ? error.message : "Training scenario could not be prepared.");
  }
  finish("/admin/training", "notice", `${scenario.replaceAll("_", " ")} scenario is ready for recording.`);
}

export async function createTrainingReserveInstruction(fd: FormData) {
  const user = await requireRole("PARTNER");
  let partner;
  try {
    partner = requireTrainingPartner(user);
  } catch (error) {
    finish("/partner/deposit", "error", error instanceof Error ? error.message : "Training reserve is unavailable.");
  }
  const level = partnerProgramLevel(text(fd, "programLevel") || partner.programLevel);
  const open = await db.partnerDeposit.findFirst({
    where: { partnerId: partner.id, status: { in: ["AWAITING_PAYMENT", "CONFIRMING", "CONFIRMED"] } },
  });
  if (open) finish("/partner/deposit", "notice", "The training reserve instruction is already recorded.");

  const deposit = await db.$transaction(async (tx) => {
    await tx.partnerProfile.update({ where: { id: partner.id }, data: { programLevel: level.code } });
    return tx.partnerDeposit.create({
      data: {
        reference: `TRN-DEP-${Date.now().toString(36).toUpperCase()}`,
        partnerId: partner.id,
        amount: new Prisma.Decimal(level.activationReserveUsdt),
        provider: "TRAINING_SIMULATOR",
        providerStatus: "instruction_created",
        status: "AWAITING_PAYMENT",
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
    });
  });
  await audit({
    action: "training.reserve_instruction_created",
    entityType: "PartnerDeposit",
    entityId: deposit.id,
    actorId: user.id,
    actorLabel: actorLabel(user),
    partnerId: partner.id,
    meta: { training: true, amount: deposit.amount.toString(), noLiveFunds: true, programLevel: level.code },
  });
  finish("/partner/deposit", "notice", "Training reserve instruction created. No wallet transfer is required.");
}

export async function submitTrainingReserveInstruction(fd: FormData) {
  const user = await requireRole("PARTNER");
  let partner;
  try {
    partner = requireTrainingPartner(user);
  } catch (error) {
    finish("/partner/deposit", "error", error instanceof Error ? error.message : "Training reserve is unavailable.");
  }
  const deposit = await db.partnerDeposit.findFirst({
    where: { id: text(fd, "depositId"), partnerId: partner.id, provider: "TRAINING_SIMULATOR", status: "AWAITING_PAYMENT" },
  });
  if (!deposit) finish("/partner/deposit", "error", "Training reserve instruction is no longer awaiting submission.");
  const simulatedReference = crypto.createHash("sha256").update(`training:${deposit.id}`).digest("hex");
  await db.partnerDeposit.update({
    where: { id: deposit.id },
    data: {
      status: "CONFIRMING",
      providerStatus: "simulated_transfer_submitted",
      transactionHash: simulatedReference,
      submittedAt: new Date(),
      reviewNote: "Training submission only. No token transfer occurred.",
    },
  });
  await audit({
    action: "training.reserve_submitted",
    entityType: "PartnerDeposit",
    entityId: deposit.id,
    actorId: user.id,
    actorLabel: actorLabel(user),
    partnerId: partner.id,
    meta: { training: true, noLiveFunds: true, simulatedReference },
  });
  finish("/partner/deposit", "notice", "Simulated reserve submitted for operator activation. No funds moved.");
}
