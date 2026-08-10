import { NextResponse, type NextRequest } from "next/server";
import { logError } from "@/lib/error-log";
import {
  runDuplicateRiskWatchdog,
  runFollowUpWatchdog,
  runIntroductionReminderWatchdog,
  runReferralRewardWatchdog,
  runRetainerRenewalWatchdog,
  runRevenueOverdueWatchdog,
  runRevenueUninvoicedWatchdog,
  runSlaWatchdog,
  runStaleSuggestionWatchdog,
  runNetworkMaintenance,
  runProcessingOrderExpiryWatchdog,
} from "@/lib/watchdogs";

// Vercel Cron hits this on schedule (see vercel.json). Protected by
// CRON_SECRET so it can't be triggered by anyone who finds the URL — Vercel
// automatically sends `Authorization: Bearer $CRON_SECRET` on cron-invoked
// requests when that env var is set.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [sla, revenue, followUp, uninvoiced, retainer, staleSuggestions, introReminders, duplicateRisk, referralRewards, networkMaintenance, processingExpiry] =
    await Promise.all([
    runSlaWatchdog().catch(async (err) => {
      await logError({ error: err, source: "cron:runSlaWatchdog", severity: "ERROR" });
      return { checked: 0, sent: 0, error: true };
    }),
    runRevenueOverdueWatchdog().catch(async (err) => {
      await logError({ error: err, source: "cron:runRevenueOverdueWatchdog", severity: "ERROR" });
      return { checked: 0, sent: 0, error: true };
    }),
    runFollowUpWatchdog().catch(async (err) => {
      await logError({ error: err, source: "cron:runFollowUpWatchdog", severity: "ERROR" });
      return { checked: 0, sent: 0, error: true };
    }),
    runRevenueUninvoicedWatchdog().catch(async (err) => {
      await logError({ error: err, source: "cron:runRevenueUninvoicedWatchdog", severity: "ERROR" });
      return { checked: 0, sent: 0, error: true };
    }),
    runRetainerRenewalWatchdog().catch(async (err) => {
      await logError({ error: err, source: "cron:runRetainerRenewalWatchdog", severity: "ERROR" });
      return { checked: 0, sent: 0, error: true };
    }),
    runStaleSuggestionWatchdog().catch(async (err) => {
      await logError({ error: err, source: "cron:runStaleSuggestionWatchdog", severity: "ERROR" });
      return { checked: 0, sent: 0, error: true };
    }),
    runIntroductionReminderWatchdog().catch(async (err) => {
      await logError({ error: err, source: "cron:runIntroductionReminderWatchdog", severity: "ERROR" });
      return { checked: 0, sent: 0, error: true };
    }),
    runDuplicateRiskWatchdog().catch(async (err) => {
      await logError({ error: err, source: "cron:runDuplicateRiskWatchdog", severity: "ERROR" });
      return { checked: 0, sent: 0, error: true };
    }),
    runReferralRewardWatchdog().catch(async (err) => {
      await logError({ error: err, source: "cron:runReferralRewardWatchdog", severity: "ERROR" });
      return { checked: 0, sent: 0, error: true };
    }),
    runNetworkMaintenance().catch(async (err) => {
      await logError({ error: err, source: "cron:runNetworkMaintenance", severity: "ERROR" });
      return { error: true };
    }),
    runProcessingOrderExpiryWatchdog().catch(async (err) => {
      await logError({ error: err, source: "cron:runProcessingOrderExpiryWatchdog", severity: "ERROR" });
      return { checked: 0, changed: 0, error: true };
    }),
  ]);

  return NextResponse.json({
    ok: true,
    sla,
    revenue,
    followUp,
    uninvoiced,
    retainer,
    staleSuggestions,
    introReminders,
    duplicateRisk,
    referralRewards,
    networkMaintenance,
    processingExpiry,
    ranAt: new Date().toISOString(),
  });
}
