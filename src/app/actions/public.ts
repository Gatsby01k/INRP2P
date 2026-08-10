"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { audit, nextReference } from "@/lib/audit";
import {
  createSession,
  generateAccessPassword,
  getSession,
  hashPassword,
} from "@/lib/auth";
import { runFullTriagePipeline, runPartnerTriagePipeline } from "@/lib/ai-triage";
import { db } from "@/lib/db";
import {
  assignCompanyReferralCode,
  assignPartnerReferralCode,
  REFERRAL_COOKIE,
  resolveReferralCode,
} from "@/lib/referral";
import {
  companyRequestSchema,
  emailOnlySchema,
  flattenErrors,
  partnerApplicationSchema,
  type ActionState,
} from "@/lib/schemas";
import { autoSuggestMatches, checkCoverageGap } from "@/lib/watchdogs";
import type { Direction, RequestType, Urgency } from "@prisma/client";
import { consumeRateLimit } from "@/lib/rate-limit";
import { issueEmailVerification } from "@/lib/email";
import { verifyTurnstile } from "@/lib/turnstile";

async function publicIdentity() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Reads the referral cookie (set client-side by ReferralCapture off a
    ?ref= URL param) and confirms it actually belongs to a real account
    before trusting it — never null-defends the caller into storing a
    cookie's raw contents unchecked. */
async function referredByCode(): Promise<string | null> {
  const raw = (await cookies()).get(REFERRAL_COOKIE)?.value ?? null;
  return resolveReferralCode(raw);
}

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

function arr(formData: FormData, key: string) {
  return formData.getAll(key).filter((v): v is string => typeof v === "string");
}

/**
 * Direction still drives partner-matching eligibility, so every request needs
 * one even when the broader "request type" isn't a clean corridor (partner
 * sourcing, other, generic liquidity). We map to the closest corridor and let
 * admins match manually for the non-corridor types.
 */
function deriveDirection(requestType: string): string {
  if (requestType === "INR_TO_USDT" || requestType === "USDT_TO_INR" || requestType === "INR_PAYOUTS") {
    return requestType;
  }
  if (requestType === "INR_LIQUIDITY") return "INR_TO_USDT";
  return "INR_PAYOUTS"; // PARTNER_SOURCING, OTHER, or unset
}

/** Company submits an INR liquidity request (public form or company workspace). */
export async function submitCompanyRequest(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Honeypot — bots fill hidden fields; pretend success without writing.
  if (str(formData, "website_hp")) redirect("/request/submitted?ref=received");
  const identity = await publicIdentity();
  if (!(await consumeRateLimit("company-request", identity, 5, 60 * 60 * 1000))) return { fieldErrors: {}, error: "Too many submissions. Try again later." };

  const session = await getSession();
  if (session?.user.role === "COMPANY" && !session.user.emailVerifiedAt) redirect("/verify-email?status=pending");
  const loggedInCompany =
    session && session.user.role === "COMPANY" && session.user.company
      ? session.user.company
      : null;

  const input = {
    companyName: loggedInCompany ? loggedInCompany.companyName : str(formData, "companyName"),
    website: loggedInCompany ? (loggedInCompany.website ?? "") : str(formData, "website"),
    companyJurisdiction: loggedInCompany
      ? loggedInCompany.jurisdiction
      : str(formData, "companyJurisdiction"),
    contactName: loggedInCompany ? loggedInCompany.contactName : str(formData, "contactName"),
    contactRole: loggedInCompany ? (loggedInCompany.contactRole ?? "") : str(formData, "contactRole"),
    telegram: loggedInCompany ? (loggedInCompany.telegram ?? "") : str(formData, "telegram"),
    phone: loggedInCompany ? (loggedInCompany.phone ?? "") : str(formData, "phone"),
    direction: deriveDirection(str(formData, "requestType")),
    requestType: str(formData, "requestType"),
    dailyVolumeBand: str(formData, "dailyVolumeBand"),
    monthlyVolumeBand: str(formData, "monthlyVolumeBand"),
    ticketSize: str(formData, "ticketSize"),
    urgency: str(formData, "urgency") || "STANDARD",
    countriesInvolved: str(formData, "countriesInvolved"),
    banks: arr(formData, "banks"),
    methods: arr(formData, "methods"),
    requiredSpeed: str(formData, "requiredSpeed"),
    jurisdiction: str(formData, "jurisdiction"),
    kycReadiness: str(formData, "kycReadiness"),
    kycNotes: str(formData, "kycNotes"),
    partnerRequirements: str(formData, "partnerRequirements"),
    notes: str(formData, "notes"),
  };

  const parsed = companyRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: flattenErrors(parsed.error) };
  }
  const data = parsed.data;

  let accountEmail: string | null = null;
  if (!loggedInCompany) {
    const account = emailOnlySchema.safeParse({ email: str(formData, "email") });
    if (!account.success) {
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: flattenErrors(account.error),
      };
    }
    const existing = await db.user.findUnique({ where: { email: account.data.email } });
    if (existing) {
      return {
        fieldErrors: {},
        error:
          "An account already exists for this email. Log in first, then submit the request from your workspace.",
      };
    }
    accountEmail = account.data.email;
  }

  if (!(await verifyTurnstile(str(formData, "cf-turnstile-response")))) {
    return { fieldErrors: {}, error: "Security check expired. Complete it again and resubmit." };
  }

  let companyId: string;
  let userId: string | null = null;
  let actor = data.companyName;
  let newAccount: { id: string; email: string } | null = null;

  if (loggedInCompany) {
    companyId = loggedInCompany.id;
    userId = session!.user.id;
    actor = loggedInCompany.companyName;
  } else {
    // No one invents a password mid-form — it's generated here and shown once
    // on the confirmation page, right after the account is already signed in.
    const plainPassword = generateAccessPassword();
    const passwordHash = await hashPassword(plainPassword);
    const referredBy = await referredByCode();
    const created = await db.user.create({
      data: {
        email: accountEmail!,
        passwordHash,
        mustSetPassword: true,
        name: data.contactName,
        role: "COMPANY",
        company: {
          create: {
            companyName: data.companyName,
            website: data.website,
            jurisdiction: data.companyJurisdiction,
            contactName: data.contactName,
            contactRole: data.contactRole,
            telegram: data.telegram,
            phone: data.phone,
            referredByCode: referredBy,
          },
        },
      },
      include: { company: true },
    });
    companyId = created.company!.id;
    userId = created.id;
    newAccount = { id: created.id, email: accountEmail! };
    // A single fast update, awaited directly (not after()) so the referral
    // code already exists by the time this account's workspace renders its
    // "your referral link" card.
    await assignCompanyReferralCode(companyId);
  }

  const reference = await nextReference("request");
  const request = await db.liquidityRequest.create({
    data: {
      reference,
      companyId,
      direction: data.direction as Direction,
      requestType: data.requestType as RequestType,
      dailyVolumeBand: data.dailyVolumeBand,
      monthlyVolumeBand: data.monthlyVolumeBand,
      ticketSize: data.ticketSize,
      urgency: data.urgency as Urgency,
      countriesInvolved: data.countriesInvolved,
      banks: data.banks,
      methods: data.methods,
      requiredSpeed: data.requiredSpeed,
      jurisdiction: data.jurisdiction,
      kycReadiness: data.kycReadiness,
      kycNotes: data.kycNotes,
      partnerRequirements: data.partnerRequirements,
      notes: data.notes,
      routingEnabled: !["PARTNER_SOURCING", "OTHER"].includes(data.requestType),
    },
  });

  await audit({
    action: "request.submitted",
    entityType: "LiquidityRequest",
    entityId: request.id,
    actorId: userId,
    actorLabel: actor,
    requestId: request.id,
    meta: { reference, requestType: data.requestType },
  });

  // Fire-and-forget-safe: neither call ever throws or blocks submission.
  // Reuses the same scoring the admin "suggested partners" panel runs, just
  // triggered the moment the request exists instead of whenever someone
  // happens to open it — checkCoverageGap flags the no-fit case,
  // autoSuggestMatches pre-populates the good-fit case.
  await checkCoverageGap(request);
  await autoSuggestMatches(request);

  // AI pre-flight triage — scheduled to run *after* the response (this
  // action's redirect) has already gone out, via Next's after(), so the
  // company never waits on an LLM round-trip to submit their request. By
  // the time an operator opens their queue, the easy majority of requests
  // already have a triage verdict and top-match explanations attached.
  after(() => runFullTriagePipeline(request.id));

  if (!loggedInCompany && userId) await createSession(userId);
  if (newAccount) after(() => issueEmailVerification(newAccount!.id, newAccount!.email).catch(() => false));
  redirect(`/request/submitted?ref=${encodeURIComponent(reference)}`);
}

/** Liquidity partner applies to join the network. */
export async function submitPartnerApplication(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (str(formData, "website_hp")) redirect("/apply/submitted?ref=received");
  const identity = await publicIdentity();
  if (!(await consumeRateLimit("partner-application", identity, 3, 60 * 60 * 1000))) return { fieldErrors: {}, error: "Too many submissions. Try again later." };

  const session = await getSession();
  if (session?.user.role === "PARTNER" && !session.user.emailVerifiedAt) redirect("/verify-email?status=pending");
  if (session?.user.role === "PARTNER") redirect("/partner");

  const input = {
    displayName: str(formData, "displayName"),
    legalName: str(formData, "legalName"),
    contactName: str(formData, "contactName"),
    telegram: str(formData, "telegram"),
    phone: str(formData, "phone"),
    experienceBand: str(formData, "experienceBand"),
    directions: arr(formData, "directions"),
    banks: arr(formData, "banks"),
    methods: arr(formData, "methods"),
    dailyCapacityBand: str(formData, "dailyCapacityBand"),
    monthlyCapacityBand: str(formData, "monthlyCapacityBand"),
    minTicket: str(formData, "minTicket"),
    maxTicket: str(formData, "maxTicket"),
    settlementPreference: str(formData, "settlementPreference"),
    workingHours: str(formData, "workingHours"),
    reserveBand: str(formData, "reserveBand"),
    jurisdictions: str(formData, "jurisdictions"),
    operatingCountry: str(formData, "operatingCountry"),
    complianceFlags: arr(formData, "complianceFlags"),
    complianceNotes: str(formData, "complianceNotes"),
    references: str(formData, "references"),
    riskNotes: str(formData, "riskNotes"),
    additionalComments: str(formData, "additionalComments"),
  };

  const parsed = partnerApplicationSchema.safeParse(input);
  const account = emailOnlySchema.safeParse({ email: str(formData, "email") });

  if (!parsed.success || !account.success) {
    const fieldErrors = {
      ...(parsed.success ? {} : flattenErrors(parsed.error)),
      ...(account.success ? {} : flattenErrors(account.error)),
    };
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  const existing = await db.user.findUnique({ where: { email: account.data.email } });
  if (existing) {
    return {
      error: "This email already has an INRP2P account. Log in, or contact operations if you need partner access added to an existing company account.",
    };
  }

  if (!(await verifyTurnstile(str(formData, "cf-turnstile-response")))) {
    return { fieldErrors: {}, error: "Security check expired. Complete it again and resubmit." };
  }

  const data = parsed.data;
  // No one invents a password mid-form — it's generated here and shown once
  // on the confirmation page, right after the account is already signed in.
  const plainPassword = generateAccessPassword();
  const passwordHash = await hashPassword(plainPassword);
  const reference = await nextReference("partner");
  const referredBy = await referredByCode();

  const created = await db.user.create({
    data: {
      email: account.data.email,
      passwordHash,
      mustSetPassword: true,
      name: data.contactName,
      role: "PARTNER",
      partner: {
        create: {
          reference,
          displayName: data.displayName,
          legalName: data.legalName,
          contactName: data.contactName,
          telegram: data.telegram,
          phone: data.phone,
          experienceBand: data.experienceBand,
          directions: data.directions as Direction[],
          banks: data.banks,
          methods: data.methods,
          dailyCapacityBand: data.dailyCapacityBand,
          monthlyCapacityBand: data.monthlyCapacityBand,
          minTicket: data.minTicket,
          maxTicket: data.maxTicket,
          settlementPreference: data.settlementPreference,
          workingHours: data.workingHours,
          reserveBand: data.reserveBand,
          jurisdictions: data.jurisdictions,
          operatingCountry: data.operatingCountry,
          complianceFlags: data.complianceFlags,
          complianceNotes: data.complianceNotes,
          references: data.references,
          riskNotes: data.riskNotes,
          additionalComments: data.additionalComments,
          referredByCode: referredBy,
        },
      },
    },
    include: { partner: true },
  });

  await audit({
    action: "partner.applied",
    entityType: "PartnerProfile",
    entityId: created.partner!.id,
    actorId: created.id,
    actorLabel: data.displayName,
    partnerId: created.partner!.id,
    meta: { reference },
  });

  // A single fast update, awaited directly so the referral code already
  // exists by the time this account's workspace renders its "your referral
  // link" card.
  await assignPartnerReferralCode(created.partner!.id);

  // Same after()-scheduled AI pre-flight pattern as company requests — runs
  // once the response (this action's redirect) has already gone out, so the
  // applicant never waits on an LLM round-trip. By the time an operator
  // opens the partners queue, most applications already have a vetting
  // verdict attached.
  after(() => runPartnerTriagePipeline(created.partner!.id));

  await createSession(created.id);
  after(() => issueEmailVerification(created.id, account.data.email).catch(() => false));
  redirect(`/apply/submitted?ref=${encodeURIComponent(reference)}`);
}
