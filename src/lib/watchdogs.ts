import type { Direction } from "@prisma/client";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { directionLabel, statusLabel } from "@/lib/format";
import { rankPartners, type MatchSuggestion } from "@/lib/matching";
import { notify } from "@/lib/notify";
import { referrerLabel } from "@/lib/referral";
import { findDuplicateContactGroups, groupKey } from "@/lib/risk-radar";
import { sendTelegramAlert } from "@/lib/telegram";

// Three watchdogs, one shared idea: don't rely on an operator noticing.
// The audit log (already the system of record for every state change) also
// doubles as the dedup ledger here — "has this exact alert already fired
// for this entity" — so a watchdog never re-sends the same warning on every
// cron tick, and adding this cost zero new schema.

async function alreadyAlerted(action: string, entityId: string) {
  const existing = await db.auditLog.findFirst({
    where: { action, entityId },
    select: { id: true },
  });
  return existing != null;
}

/* ── 1. SLA-risk watchdog ─────────────────────────────────────────────────
   The site promises a first response within 24–48h. Warn before that
   promise breaks, not after — cutoff is deliberately inside the window. */

const SLA_WARNING_HOURS = 20;

export async function runSlaWatchdog() {
  const cutoff = new Date(Date.now() - SLA_WARNING_HOURS * 60 * 60 * 1000);
  const atRisk = await db.liquidityRequest.findMany({
    where: {
      status: { in: ["SUBMITTED", "IN_REVIEW"] },
      createdAt: { lte: cutoff },
    },
    select: {
      id: true,
      reference: true,
      createdAt: true,
      company: { select: { companyName: true } },
    },
  });

  let sent = 0;
  for (const r of atRisk) {
    const action = "watchdog.sla_risk";
    if (await alreadyAlerted(action, r.id)) continue;

    const hours = Math.round((Date.now() - r.createdAt.getTime()) / 3_600_000);
    const ok = await sendTelegramAlert(
      `⏱ <b>SLA risk</b>\n${r.reference} — ${r.company.companyName}\n` +
        `Still unactioned after ${hours}h. Site promise is 24–48h first response.`,
    );
    if (!ok) continue;

    await audit({
      action,
      entityType: "LiquidityRequest",
      entityId: r.id,
      actorLabel: "Watchdog",
      requestId: r.id,
      meta: { hoursElapsed: hours },
    });
    sent++;
  }
  return { checked: atRisk.length, sent };
}

/* ── 2. Overdue-revenue watchdog ──────────────────────────────────────────
   dueDate has existed on RevenueRecord all along; nothing ever read it for
   this purpose. Flags anything past due that isn't PAID/CANCELLED/LOST/WAIVED. */

export async function runRevenueOverdueWatchdog() {
  const now = new Date();
  const overdue = await db.revenueRecord.findMany({
    where: {
      status: { in: ["POTENTIAL", "QUOTED", "AGREED", "INVOICED"] },
      dueDate: { lt: now },
    },
    select: {
      id: true,
      amount: true,
      currency: true,
      dueDate: true,
      requestId: true,
      request: { select: { reference: true } },
      company: { select: { companyName: true } },
    },
  });

  let sent = 0;
  for (const rev of overdue) {
    const action = "watchdog.revenue_overdue";
    if (await alreadyAlerted(action, rev.id)) continue;

    const label = rev.request?.reference ?? `Retainer — ${rev.company?.companyName ?? "company"}`;
    const days = rev.dueDate ? Math.round((now.getTime() - rev.dueDate.getTime()) / 86_400_000) : 0;
    const ok = await sendTelegramAlert(
      `💸 <b>Revenue overdue</b>\n${label} — ₹${rev.amount.toString()} ${rev.currency}\n` +
        `${days}d past due date, still not marked paid.`,
    );
    if (!ok) continue;

    await audit({
      action,
      entityType: "RevenueRecord",
      entityId: rev.id,
      actorLabel: "Watchdog",
      requestId: rev.requestId,
      meta: { daysOverdue: days },
    });
    sent++;
  }
  return { checked: overdue.length, sent };
}

/* ── 3. Follow-up-due watchdog ─────────────────────────────────────────────
   followUpDate has been readable on the operator dashboard all along ("due
   today" list) but only if someone opens /admin and looks. This pushes the
   same query to Telegram. Dedup key includes the follow-up date itself (not
   just the introduction id) — so if an operator pushes the date forward
   after acting on it, a fresh alert can still fire for the new date instead
   of staying silenced forever by the first alert. */

export async function runFollowUpWatchdog() {
  const now = new Date();
  const due = await db.introduction.findMany({
    where: { followUpDate: { lte: now }, status: { notIn: ["SUCCESSFUL", "FAILED"] } },
    select: {
      id: true,
      followUpDate: true,
      status: true,
      match: {
        select: {
          id: true,
          requestId: true,
          request: { select: { reference: true } },
          partner: { select: { displayName: true } },
        },
      },
    },
  });

  let sent = 0;
  for (const intro of due) {
    if (!intro.followUpDate) continue;
    const dateKey = intro.followUpDate.toISOString().slice(0, 10);
    const action = `watchdog.followup_due:${dateKey}`;
    if (await alreadyAlerted(action, intro.id)) continue;

    const days = Math.round((now.getTime() - intro.followUpDate.getTime()) / 86_400_000);
    const ok = await sendTelegramAlert(
      `📌 <b>Follow-up due</b>\n${intro.match.request.reference} — ${intro.match.partner.displayName}\n` +
        `Still ${statusLabel(intro.status)}. Follow-up was due ${days > 0 ? `${days}d ago` : "today"}.`,
    );
    if (!ok) continue;

    await audit({
      action,
      entityType: "Introduction",
      entityId: intro.id,
      actorLabel: "Watchdog",
      requestId: intro.match.requestId,
      matchId: intro.match.id,
      meta: { followUpDate: dateKey, status: intro.status },
    });
    sent++;
  }
  return { checked: due.length, sent };
}

/* ── 4. Agreed-but-not-invoiced watchdog ──────────────────────────────────
   A fee can sit "AGREED" indefinitely if nobody remembers to invoice it —
   there's no separate agreedAt timestamp, so updatedAt (bumped on every
   status write) is used as a proxy for "when it became AGREED". */

const REVENUE_AGREED_STALE_DAYS = 5;

export async function runRevenueUninvoicedWatchdog() {
  const cutoff = new Date(Date.now() - REVENUE_AGREED_STALE_DAYS * 24 * 60 * 60 * 1000);
  const stale = await db.revenueRecord.findMany({
    where: { status: "AGREED", updatedAt: { lte: cutoff } },
    select: {
      id: true,
      amount: true,
      currency: true,
      updatedAt: true,
      requestId: true,
      request: { select: { reference: true } },
      company: { select: { companyName: true } },
    },
  });

  let sent = 0;
  for (const rev of stale) {
    const action = "watchdog.revenue_uninvoiced";
    if (await alreadyAlerted(action, rev.id)) continue;

    const label = rev.request?.reference ?? `Retainer — ${rev.company?.companyName ?? "company"}`;
    const days = Math.round((Date.now() - rev.updatedAt.getTime()) / 86_400_000);
    const ok = await sendTelegramAlert(
      `🧾 <b>Agreed, not invoiced</b>\n${label} — ₹${rev.amount.toString()} ${rev.currency}\n` +
        `Agreed ${days}d ago, no invoice sent yet.`,
    );
    if (!ok) continue;

    await audit({
      action,
      entityType: "RevenueRecord",
      entityId: rev.id,
      actorLabel: "Watchdog",
      requestId: rev.requestId,
      meta: { daysSinceAgreed: days },
    });
    sent++;
  }
  return { checked: stale.length, sent };
}

/* ── 5. Retainer-renewal watchdog ─────────────────────────────────────────
   Monthly retainer billing lives on CompanyProfile (retainerActive/
   retainerAmount/retainerNextRenewal), independent of any single request —
   this is the recurring-revenue counterpart to Task #57. When a company's
   retainerNextRenewal comes due, this creates a POTENTIAL RevenueRecord tied
   to the company directly (no requestId) and rolls the renewal date forward
   a month, so operations never has to remember to re-invoice manually. */

function advanceRetainerDate(from: Date, dayOfMonth: number): Date {
  // Roll to the same day next month, clamped to that month's real length
  // (e.g. dayOfMonth=31 in a 30-day month lands on the 30th, not Dec 1st).
  const next = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  const daysInNextMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(dayOfMonth, daysInNextMonth));
  return next;
}

export async function runRetainerRenewalWatchdog() {
  const now = new Date();
  const due = await db.companyProfile.findMany({
    where: {
      retainerActive: true,
      retainerNextRenewal: { lte: now },
      retainerAmount: { not: null },
    },
    select: {
      id: true,
      companyName: true,
      retainerAmount: true,
      retainerCurrency: true,
      retainerDayOfMonth: true,
      retainerNextRenewal: true,
    },
  });

  let sent = 0;
  for (const company of due) {
    if (!company.retainerAmount || !company.retainerNextRenewal) continue;
    const dateKey = company.retainerNextRenewal.toISOString().slice(0, 10);
    const action = `watchdog.retainer_renewal:${dateKey}`;
    if (await alreadyAlerted(action, company.id)) continue;

    const currency = company.retainerCurrency ?? "INR";
    const monthLabel = company.retainerNextRenewal.toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    });

    const record = await db.revenueRecord.create({
      data: {
        companyId: company.id,
        amount: company.retainerAmount,
        currency,
        type: "MONTHLY_RETAINER",
        payerType: "Company",
        payerName: company.companyName,
        basis: `Monthly retainer — ${monthLabel}`,
        status: "POTENTIAL",
        dueDate: company.retainerNextRenewal,
      },
    });

    const dayOfMonth = company.retainerDayOfMonth ?? company.retainerNextRenewal.getDate();
    const nextRenewal = advanceRetainerDate(company.retainerNextRenewal, dayOfMonth);
    await db.companyProfile.update({
      where: { id: company.id },
      data: { retainerNextRenewal: nextRenewal },
    });

    const ok = await sendTelegramAlert(
      `🔁 <b>Retainer due</b>\n${company.companyName} — ${company.retainerAmount.toString()} ${currency}\n` +
        `${monthLabel} retainer invoice created. Next renewal ${nextRenewal.toISOString().slice(0, 10)}.`,
    );
    void ok; // best-effort notify; the revenue record itself is the source of truth

    await audit({
      action,
      entityType: "RevenueRecord",
      entityId: record.id,
      actorLabel: "Watchdog",
      meta: { companyId: company.id, amount: company.retainerAmount.toString(), currency, nextRenewal: nextRenewal.toISOString() },
    });
    sent++;
  }
  return { checked: due.length, sent };
}

/* ── 6. Coverage-gap watchdog ─────────────────────────────────────────────
   Not cron-driven — fired synchronously the moment a request is created,
   reusing the same scoreMatch() the admin "suggested partners" panel uses.
   If nobody in the network can plausibly fill this, operations should know
   in seconds, not whenever someone happens to open the request. Never
   throws — a failure here must not break the company's submission flow. */

// Exported so the public confirmation pages can use the exact same bar for
// "does this partner plausibly fit" as the internal coverage-gap alert —
// one definition of "good enough," not two that can drift apart.
export const COVERAGE_GAP_SCORE_THRESHOLD = 35;

type CoverageGapRequest = {
  id: string;
  reference: string;
  direction: Direction;
  banks: string[];
  methods: string[];
  dailyVolumeBand: string;
  jurisdiction: string;
  countriesInvolved: string | null;
};

export async function checkCoverageGap(request: CoverageGapRequest) {
  try {
    const eligiblePartners = await db.partnerProfile.findMany({
      where: {
        status: { in: ["VERIFIED", "LIMITED"] },
        directions: { has: request.direction },
      },
    });

    let best: MatchSuggestion | undefined;
    if (eligiblePartners.length > 0) {
      best = rankPartners(request, eligiblePartners, 1)[0];
    }
    const bestScore = best?.score ?? 0;

    if (eligiblePartners.length > 0 && bestScore >= COVERAGE_GAP_SCORE_THRESHOLD) return;

    const action = "watchdog.coverage_gap";
    if (await alreadyAlerted(action, request.id)) return;

    const ok = await sendTelegramAlert(
      `⚠️ <b>Coverage gap</b>\n${request.reference} — ${directionLabel(request.direction)}\n` +
        (eligiblePartners.length === 0
          ? "No verified or limited partner on this corridor at all."
          : `Best available fit only scores ${bestScore}/100.`),
    );
    if (!ok) return;

    await audit({
      action,
      entityType: "LiquidityRequest",
      entityId: request.id,
      actorLabel: "Watchdog",
      requestId: request.id,
      meta: { eligiblePartners: eligiblePartners.length, bestScore },
    });
  } catch (err) {
    console.error("checkCoverageGap failed", err);
  }
}

/* Live processing queue expiry. Only unassigned orders expire automatically;
   once a trader has taken an order, its exposure remains locked until a real
   participant or operator records the outcome. */
export async function runProcessingOrderExpiryWatchdog() {
  const expired = await db.processingOrder.findMany({
    where: { status: "AVAILABLE", expiresAt: { lte: new Date() } },
    select: { id: true, reference: true, companyId: true },
    take: 500,
  });
  let changed = 0;
  for (const order of expired) {
    const updated = await db.$transaction(async (tx) => {
      const result = await tx.processingOrder.updateMany({
        where: { id: order.id, status: "AVAILABLE" },
        data: { status: "EXPIRED", failureReason: "Queue assignment window expired", version: { increment: 1 } },
      });
      if (!result.count) return false;
      await tx.processingOrderEvent.create({
        data: { orderId: order.id, fromStatus: "AVAILABLE", toStatus: "EXPIRED", actorLabel: "Processing watchdog", actorRole: "ADMIN", note: "Order expired before partner assignment." },
      });
      return true;
    });
    if (!updated) continue;
    await audit({ action: "processing.order_expired", entityType: "ProcessingOrder", entityId: order.id, actorLabel: "Processing watchdog", meta: { reference: order.reference, companyId: order.companyId } });
    changed++;
  }
  return { checked: expired.length, changed };
}

/* ── 7. Auto-suggest matches ──────────────────────────────────────────────
   Also fired synchronously at submission time, alongside checkCoverageGap —
   the flip side of the same signal. Where checkCoverageGap raises an alert
   when nobody fits, this pre-creates SUGGESTED Match rows for the partners
   who clearly do, so an operator opening the request for the first time
   finds ranked candidates already waiting instead of having to run the
   matching search themselves. It only ever creates SUGGESTED rows — nothing
   is released to either side, and no match here skips manual review before
   a real introduction happens. Never throws, same as checkCoverageGap. */

export const AUTO_MATCH_SCORE_THRESHOLD = 60;
const AUTO_MATCH_MAX = 3;

export async function autoSuggestMatches(request: CoverageGapRequest) {
  try {
    const eligiblePartners = await db.partnerProfile.findMany({
      where: {
        status: { in: ["VERIFIED", "LIMITED"] },
        directions: { has: request.direction },
      },
    });
    if (eligiblePartners.length === 0) return;

    const ranked = rankPartners(request, eligiblePartners, AUTO_MATCH_MAX).filter(
      (r) => r.score >= AUTO_MATCH_SCORE_THRESHOLD,
    );
    if (ranked.length === 0) return;

    for (const { partner, score, reasons } of ranked) {
      try {
        const match = await db.match.create({
          data: {
            requestId: request.id,
            partnerId: partner.id,
            confidenceScore: score,
            adminNote: `Auto-suggested by the matching engine: ${reasons.join("; ")}.`,
          },
        });
        await audit({
          action: "match.auto_suggested",
          entityType: "Match",
          entityId: match.id,
          actorLabel: "Auto-match",
          requestId: request.id,
          partnerId: partner.id,
          matchId: match.id,
          meta: { partnerName: partner.displayName, score },
        });
      } catch (err) {
        // P2002 (unique requestId+partnerId) can't actually happen for a
        // brand-new request, but never let one bad row block the rest.
        console.error("autoSuggestMatches: failed to create one suggestion", err);
      }
    }
  } catch (err) {
    console.error("autoSuggestMatches failed", err);
  }
}

/* ── 8. Stale-suggestion watchdog ─────────────────────────────────────────
   Closes the loop on autoSuggestMatches above — pre-filling candidates is
   only a win if someone actually looks at them. Flags any match still sitting
   at SUGGESTED (never shortlisted, released or declined) after a couple of
   days, whether it was auto-created or added by hand, so the new automation
   never quietly creates a queue nobody reviews. */

const STALE_SUGGESTION_HOURS = 48;

/* ── 9. Introduction follow-up: reminder + escalation ─────────────────────
   An introduction going out is only useful if someone actually talks. Rather
   than depend on an operator manually chasing every SENT introduction, this
   nudges whichever side has gone quiet in the deal room, then escalates to
   ops if both sides stay completely silent past a harder deadline. */

const INTRO_REMINDER_HOURS = 48;
const INTRO_ESCALATION_HOURS = 24 * 7;

export async function runIntroductionReminderWatchdog() {
  const reminderCutoff = new Date(Date.now() - INTRO_REMINDER_HOURS * 60 * 60 * 1000);
  const candidates = await db.introduction.findMany({
    where: { status: "SENT", sentAt: { lte: reminderCutoff } },
    select: {
      id: true,
      sentAt: true,
      match: {
        select: {
          id: true,
          requestId: true,
          partnerId: true,
          request: { select: { reference: true, company: { select: { userId: true } } } },
          partner: { select: { userId: true, displayName: true } },
        },
      },
      messages: { select: { authorSide: true } },
    },
  });

  let sent = 0;
  for (const intro of candidates) {
    if (!intro.sentAt) continue;
    const hasCompanyMsg = intro.messages.some((m) => m.authorSide === "COMPANY");
    const hasPartnerMsg = intro.messages.some((m) => m.authorSide === "PARTNER");
    const hours = Math.round((Date.now() - intro.sentAt.getTime()) / 3_600_000);
    const reference = intro.match.request.reference;

    // Gentle nudge, once — only to whichever side(s) haven't spoken yet.
    if (!hasCompanyMsg || !hasPartnerMsg) {
      const reminderAction = "watchdog.intro_reminder";
      if (!(await alreadyAlerted(reminderAction, intro.id))) {
        await Promise.all([
          !hasCompanyMsg
            ? notify(intro.match.request.company.userId, {
                title: "Still there?",
                body: `${reference} — you were introduced to ${intro.match.partner.displayName} ${hours}h ago.`,
                telegramHtml: `👋 <b>Still there?</b>\n${reference} — you were introduced to ${intro.match.partner.displayName} ${hours}h ago. Open the deal room and say hello.`,
                link: `/company/matches/${intro.match.id}`,
              })
            : Promise.resolve(),
          !hasPartnerMsg
            ? notify(intro.match.partner.userId, {
                title: "Still there?",
                body: `${reference} — you were introduced ${hours}h ago.`,
                telegramHtml: `👋 <b>Still there?</b>\n${reference} — you were introduced ${hours}h ago. Open the deal room and say hello.`,
                link: `/partner/matches/${intro.match.id}`,
              })
            : Promise.resolve(),
        ]);
        await audit({
          action: reminderAction,
          entityType: "Introduction",
          entityId: intro.id,
          actorLabel: "Watchdog",
          requestId: intro.match.requestId,
          partnerId: intro.match.partnerId,
          meta: { hoursElapsed: hours, hasCompanyMsg, hasPartnerMsg },
        });
        sent++;
      }
    }

    // Harder escalation to ops if BOTH sides have stayed completely silent.
    if (
      !hasCompanyMsg &&
      !hasPartnerMsg &&
      intro.sentAt.getTime() <= Date.now() - INTRO_ESCALATION_HOURS * 60 * 60 * 1000
    ) {
      const escalationAction = "watchdog.intro_escalation";
      if (!(await alreadyAlerted(escalationAction, intro.id))) {
        const ok = await sendTelegramAlert(
          `🚨 <b>Introduction gone quiet</b>\n${reference} — ${intro.match.partner.displayName}\n` +
            `No messages from either side ${hours}h after introduction. Consider a manual check-in.`,
        );
        if (ok) {
          await audit({
            action: escalationAction,
            entityType: "Introduction",
            entityId: intro.id,
            actorLabel: "Watchdog",
            requestId: intro.match.requestId,
            partnerId: intro.match.partnerId,
            meta: { hoursElapsed: hours },
          });
          sent++;
        }
      }
    }
  }
  return { checked: candidates.length, sent };
}

export async function runStaleSuggestionWatchdog() {
  const cutoff = new Date(Date.now() - STALE_SUGGESTION_HOURS * 60 * 60 * 1000);
  const stale = await db.match.findMany({
    where: { status: "SUGGESTED", createdAt: { lte: cutoff } },
    select: {
      id: true,
      createdAt: true,
      requestId: true,
      partnerId: true,
      request: { select: { reference: true } },
      partner: { select: { displayName: true } },
    },
  });

  let sent = 0;
  for (const match of stale) {
    const action = "watchdog.stale_suggestion";
    if (await alreadyAlerted(action, match.id)) continue;

    const hours = Math.round((Date.now() - match.createdAt.getTime()) / 3_600_000);
    const ok = await sendTelegramAlert(
      `🕵️ <b>Suggested match unreviewed</b>\n${match.request.reference} — ${match.partner.displayName}\n` +
        `Still sitting at Suggested after ${hours}h. Review, shortlist, or decline.`,
    );
    if (!ok) continue;

    await audit({
      action,
      entityType: "Match",
      entityId: match.id,
      actorLabel: "Watchdog",
      requestId: match.requestId,
      partnerId: match.partnerId,
      matchId: match.id,
      meta: { hoursElapsed: hours },
    });
    sent++;
  }
  return { checked: stale.length, sent };
}

/* ── 8. Duplicate/self-dealing contact watchdog ──────────────────────────
   Runs the deterministic cross-reference in src/lib/risk-radar.ts and
   alerts ops about each duplicate group exactly once — same audit-log-as-
   dedup-ledger trick as every other watchdog above, keyed on a stable hash
   of the group's members (groupKey) instead of a single entity id, since a
   duplicate finding is inherently about a pair, not one record. */

export async function runDuplicateRiskWatchdog() {
  const groups = await findDuplicateContactGroups();

  let sent = 0;
  for (const group of groups) {
    const action = "watchdog.duplicate_contact";
    const key = groupKey(group);
    if (await alreadyAlerted(action, key)) continue;

    const names = group.entities
      .map((e) => `${e.kind === "company" ? "Company" : "Partner"} ${e.label}`)
      .join(" ↔ ");
    const icon = group.severity === "cross_side" ? "⚠️" : "🕵️";
    const headline = group.severity === "cross_side" ? "Same contact on both sides" : "Duplicate contact";
    const ok = await sendTelegramAlert(
      `${icon} <b>${headline}</b>\n${names}\nShared ${group.field}: ${group.value}\nCheck /admin/risk before matching either.`,
    );
    if (!ok) continue;

    await audit({
      action,
      entityType: "RiskGroup",
      entityId: key,
      actorLabel: "Watchdog",
      meta: { field: group.field, severity: group.severity, entities: group.entities },
    });
    sent++;
  }
  return { checked: groups.length, sent };
}

/* ── 10. Referral-reward watchdog ─────────────────────────────────────────
   src/lib/referral.ts deliberately never auto-credits money — the actual
   discount/payout is a human call, same as every other financial action on
   this platform. This just makes sure ops finds out the moment it's owed,
   instead of relying on someone to remember to check. Fires once per
   referred account (company or partner) the moment they have any
   SUCCESSFUL introduction — dedup on the account's own id, so a second,
   third, etc. closed deal from the same referred account never re-fires. */

export async function runReferralRewardWatchdog() {
  const [companies, partners] = await Promise.all([
    db.companyProfile.findMany({
      where: {
        referredByCode: { not: null },
        requests: { some: { matches: { some: { introductions: { some: { status: "SUCCESSFUL" } } } } } },
      },
      select: { id: true, companyName: true, referredByCode: true },
    }),
    db.partnerProfile.findMany({
      where: {
        referredByCode: { not: null },
        matches: { some: { introductions: { some: { status: "SUCCESSFUL" } } } },
      },
      select: { id: true, displayName: true, referredByCode: true },
    }),
  ]);

  const action = "watchdog.referral_reward";
  let sent = 0;

  for (const c of companies) {
    if (await alreadyAlerted(action, c.id)) continue;
    const referrer = await referrerLabel(c.referredByCode);
    const ok = await sendTelegramAlert(
      `🎉 <b>Referral reward due</b>\nCompany ${c.companyName} — referred by ${referrer}\n` +
        `Their first deal just closed. Apply the referral reward manually — nothing is auto-credited.`,
    );
    if (!ok) continue;

    await audit({
      action,
      entityType: "CompanyProfile",
      entityId: c.id,
      actorLabel: "Watchdog",
      meta: { referredByCode: c.referredByCode, referrer },
    });
    sent++;
  }

  for (const p of partners) {
    if (await alreadyAlerted(action, p.id)) continue;
    const referrer = await referrerLabel(p.referredByCode);
    const ok = await sendTelegramAlert(
      `🎉 <b>Referral reward due</b>\nPartner ${p.displayName} — referred by ${referrer}\n` +
        `Their first deal just closed. Apply the referral reward manually — nothing is auto-credited.`,
    );
    if (!ok) continue;

    await audit({
      action,
      entityType: "PartnerProfile",
      entityId: p.id,
      actorLabel: "Watchdog",
      meta: { referredByCode: p.referredByCode, referrer },
    });
    sent++;
  }

  return { checked: companies.length + partners.length, sent };
}

export async function runNetworkMaintenance() {
  const now = new Date();
  const [offers, verification, evidence, sessions, limits, resetTokens, verificationTokens] = await db.$transaction([
    db.matchOffer.updateMany({ where: { status: "PENDING", expiresAt: { lte: now } }, data: { status: "EXPIRED" } }),
    db.verificationCase.updateMany({ where: { status: "APPROVED", expiresAt: { lte: now } }, data: { status: "EXPIRED" } }),
    db.evidenceArtifact.updateMany({ where: { status: { in: ["PENDING", "ACCEPTED"] }, expiresAt: { lte: now } }, data: { status: "EXPIRED" } }),
    db.session.deleteMany({ where: { expiresAt: { lte: now } } }),
    db.rateLimitState.deleteMany({ where: { expiresAt: { lte: now } } }),
    db.passwordResetToken.deleteMany({ where: { OR: [{ expiresAt: { lte: now } }, { usedAt: { not: null } }] } }),
    db.emailVerificationToken.deleteMany({ where: { OR: [{ expiresAt: { lte: now } }, { usedAt: { not: null } }] } }),
  ]);
  const result = { offers: offers.count, verification: verification.count, evidence: evidence.count, sessions: sessions.count, limits: limits.count, resetTokens: resetTokens.count, verificationTokens: verificationTokens.count };
  await audit({ action: "watchdog.network_maintenance", entityType: "System", entityId: now.toISOString(), actorLabel: "Watchdog", meta: result });
  return result;
}
