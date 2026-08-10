import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { addPartnerNote } from "@/app/actions/portal";
import { EmptyState, FormError, PageHeader, StatusBadge } from "@/components/ui";
import { NoteComposer, NoteList } from "@/components/workspace/records";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { directionLabel, fmtDateTime } from "@/lib/format";
import { inr, processingTypeLabel } from "@/lib/processing";

export const metadata: Metadata = { title: "Partner home" };
export const dynamic = "force-dynamic";

const STATUS_COPY: Record<string, string> = {
  APPLIED: "Your workspace is active. Complete verification so operations can review your desk.",
  UNDER_REVIEW: "Your partner review is in progress. Watch this page for the next request from operations.",
  VERIFIED: "Your partner profile is approved. Complete any remaining activation steps to receive eligible orders.",
  LIMITED: "Your profile is approved with operating limits. Only eligible orders inside those limits will appear.",
  REJECTED: "Partner access was not approved. Contact operations if you have new evidence for review.",
  SUSPENDED: "New order access is paused. Contact operations before taking further action.",
};

type NextAction = {
  eyebrow: string;
  title: string;
  body: string;
  href?: string;
  label?: string;
  tone: "gold" | "emerald" | "rose";
};

export default async function PartnerHomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireRole("PARTNER");
  if (!user.partner) redirect("/login");
  const { error } = await searchParams;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [partner, completedToday] = await Promise.all([
    db.partnerProfile.findUnique({
      where: { id: user.partner.id },
      include: {
        verificationCases: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { checks: true },
        },
        processingAccount: true,
        paymentRails: { select: { status: true } },
        deposits: {
          where: { status: "CONFIRMED" },
          select: { amount: true, actualAmount: true },
        },
        processingOrders: {
          include: { company: { select: { companyName: true } } },
          orderBy: { createdAt: "desc" },
          take: 12,
        },
        matches: {
          where: { releasedToPartner: true },
          include: { request: true },
          orderBy: { createdAt: "desc" },
          take: 3,
        },
        notesList: {
          where: { visibility: "PARTNER" },
          orderBy: { createdAt: "desc" },
          take: 4,
        },
      },
    }),
    db.processingOrder.findMany({
      where: {
        partnerId: user.partner.id,
        status: "COMPLETED",
        completedAt: { gte: today },
      },
      select: { amountInr: true, partnerFeeInr: true },
    }),
  ]);

  if (!partner) redirect("/login");

  const verification = partner.verificationCases[0] ?? null;
  const approved = partner.status === "VERIFIED" || partner.status === "LIMITED";
  const activeRailCount = partner.paymentRails.filter((rail) => rail.status === "ACTIVE").length;
  const confirmedReserve = partner.deposits.reduce(
    (sum, deposit) => sum + Number((deposit.actualAmount ?? deposit.amount).toString()),
    0,
  );
  const processingEnabled = Boolean(partner.processingAccount?.enabled);
  const activeOrders = partner.processingOrders.filter((order) =>
    ["ASSIGNED", "PAYMENT_MARKED", "PAYOUT_SENT", "DISPUTED"].includes(order.status),
  );
  const completedVolumeToday = completedToday.reduce(
    (sum, order) => sum + Number(order.amountInr),
    0,
  );
  const earnedToday = completedToday.reduce(
    (sum, order) => sum + Number(order.partnerFeeInr),
    0,
  );

  const setup = [
    { label: "Application submitted", complete: true },
    { label: "Partner verification", complete: approved },
    { label: "Operating reserve", complete: confirmedReserve > 0 },
    { label: "Payment account approved", complete: activeRailCount > 0 },
    { label: "INR order limit enabled", complete: processingEnabled },
  ];
  const completedSetup = setup.filter((item) => item.complete).length;

  let nextAction: NextAction;
  if (partner.status === "REJECTED" || partner.status === "SUSPENDED") {
    nextAction = {
      eyebrow: "Operations review required",
      title: partner.status === "SUSPENDED" ? "Order access is paused" : "Application not approved",
      body: STATUS_COPY[partner.status],
      tone: "rose",
    };
  } else if (!verification) {
    nextAction = {
      eyebrow: "Step 2 of 5",
      title: "Start partner verification",
      body: "Prepare identity, bank and operating evidence. The guided checklist takes about five minutes to begin.",
      href: "/partner/verification",
      label: "Start verification",
      tone: "gold",
    };
  } else if (!approved) {
    nextAction = {
      eyebrow: "Review in progress",
      title: "Continue your verification checklist",
      body: "Open verification to see missing evidence or the latest decision from operations.",
      href: "/partner/verification",
      label: "Open verification",
      tone: "gold",
    };
  } else if (confirmedReserve <= 0) {
    nextAction = {
      eyebrow: "Step 3 of 5",
      title: "Confirm your operating reserve",
      body: "Create a reserve instruction and submit the transfer reference for operations review.",
      href: "/partner/deposit",
      label: "Open reserve setup",
      tone: "gold",
    };
  } else if (activeRailCount === 0) {
    nextAction = {
      eyebrow: "Step 4 of 5",
      title: "Add a UPI or bank account",
      body: "Payment details stay encrypted. Operations must approve at least one account before pay-in orders can appear.",
      href: "/partner/processing#payment-accounts",
      label: "Add payment account",
      tone: "gold",
    };
  } else if (!processingEnabled) {
    nextAction = {
      eyebrow: "Final activation check",
      title: "Waiting for your INR order limit",
      body: "Your review, reserve and payment account are ready. Operations now assigns the INR exposure limit that controls order access.",
      tone: "gold",
    };
  } else if (activeOrders.length > 0) {
    nextAction = {
      eyebrow: "Action required now",
      title: `${activeOrders.length} ${activeOrders.length === 1 ? "order needs" : "orders need"} your attention`,
      body: "Open the oldest active order, complete its next step and record the required payment evidence.",
      href: `/partner/processing/${activeOrders.at(-1)!.id}`,
      label: "Continue active order",
      tone: "emerald",
    };
  } else {
    nextAction = {
      eyebrow: "Desk ready",
      title: "Check available orders",
      body: "Your processing desk is active. Only orders matching your merchant connections, rails and free limit are shown.",
      href: "/partner/processing",
      label: "Open order queue",
      tone: "emerald",
    };
  }

  return (
    <>
      <PageHeader
        title={partner.displayName}
        sub={`${partner.reference} · ${STATUS_COPY[partner.status]}`}
        actions={
          processingEnabled ? (
            <Link href="/partner/processing" className="btn btn-gold btn-sm">
              Open orders
            </Link>
          ) : null
        }
      />

      {error ? (
        <div className="mb-5">
          <FormError message={error} />
        </div>
      ) : null}

      <section
        className={`partner-next-action partner-next-action-${nextAction.tone}`}
      >
        <div className="partner-next-copy">
          <div className="flex flex-wrap items-center gap-2">
            <p>{nextAction.eyebrow}</p>
            <StatusBadge status={partner.status} />
          </div>
          <h2>{nextAction.title}</h2>
          <p>{nextAction.body}</p>
          {nextAction.href && nextAction.label ? (
            <Link href={nextAction.href} className="btn btn-gold mt-5 min-h-11">
              {nextAction.label} →
            </Link>
          ) : null}
        </div>
        <div className="partner-activation-score">
          <span>Activation</span>
          <strong>{completedSetup}/{setup.length}</strong>
          <div aria-label={`${completedSetup} of ${setup.length} activation steps complete`}>
            {setup.map((item) => <i key={item.label} data-complete={item.complete ? "true" : undefined} />)}
          </div>
          <small>{processingEnabled ? "Desk enabled" : "Complete the next step"}</small>
        </div>
      </section>

      <section className="card mb-5 overflow-hidden">
        <div className="border-b border-black/[0.06] px-5 py-4 sm:px-6">
          <h2 className="text-sm font-semibold text-slate-900">Activation checklist</h2>
          <p className="mt-1 text-[11px] text-slate-500">Finish these once. The dashboard then opens directly into daily order work.</p>
        </div>
        <ol className="partner-setup-list">
          {setup.map((item, index) => (
            <li key={item.label} data-complete={item.complete ? "true" : undefined}>
              <span>{item.complete ? "✓" : index + 1}</span>
              <p>{item.label}</p>
              <small>{item.complete ? "Complete" : index === completedSetup ? "Next" : "Locked"}</small>
            </li>
          ))}
        </ol>
      </section>

      {processingEnabled ? (
        <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="partner-stat"><span>Active orders</span><strong>{activeOrders.length}</strong><small>Need action or confirmation</small></div>
          <div className="partner-stat"><span>Completed today</span><strong>{completedToday.length}</strong><small>{inr(completedVolumeToday)} processed</small></div>
          <div className="partner-stat"><span>Fee today</span><strong>{inr(earnedToday)}</strong><small>From completed orders</small></div>
          <div className="partner-stat"><span>Free INR limit</span><strong>{partner.processingAccount ? inr(partner.processingAccount.approvedLimitInr.minus(partner.processingAccount.lockedExposureInr)) : "—"}</strong><small>{inr(partner.processingAccount?.lockedExposureInr ?? 0)} currently locked</small></div>
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] px-5 py-4 sm:px-6">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Active orders</h2>
              <p className="mt-1 text-[11px] text-slate-500">Only work requiring your attention appears here.</p>
            </div>
            {activeOrders.length ? <Link href="/partner/processing" className="text-xs font-semibold text-gold-700">View all →</Link> : null}
          </div>
          {activeOrders.length ? (
            <div className="divide-y divide-black/[0.06]">
              {activeOrders.slice(0, 5).map((order) => (
                <Link
                  key={order.id}
                  href={`/partner/processing/${order.id}`}
                  className="partner-order-row"
                >
                  <div>
                    <span>{order.reference}</span>
                    <p>{processingTypeLabel(order.type)} · {order.company.companyName}</p>
                  </div>
                  <strong>{inr(order.amountInr)}</strong>
                  <StatusBadge status={order.status} />
                  <small>{fmtDateTime(order.updatedAt)}</small>
                  <i aria-hidden>→</i>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-5 sm:p-6">
              <EmptyState
                title={processingEnabled ? "Nothing needs action" : "Orders unlock after activation"}
                body={processingEnabled ? "Open the order queue when you are ready to take new work." : "Follow the activation checklist above. Live access is enabled only after review."}
              />
            </div>
          )}
        </section>

        <section className="card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Operations support</h2>
              <p className="mt-1 text-[11px] text-slate-500">Ask one direct question. Replies stay in your workspace.</p>
            </div>
          </div>
          <div className="mt-4">
            <NoteComposer
              action={addPartnerNote}
              hidden={{}}
              placeholder="Ask about review, reserve, limits or an order…"
            />
          </div>
          {partner.notesList.length ? (
            <div className="mt-4 border-t border-black/[0.06] pt-4">
              <NoteList notes={partner.notesList} />
            </div>
          ) : null}
        </section>
      </div>

      {partner.matches.length ? (
        <section className="card mt-5 overflow-hidden">
          <div className="border-b border-black/[0.06] px-5 py-4 sm:px-6">
            <h2 className="text-sm font-semibold text-slate-900">Introductions</h2>
            <p className="mt-1 text-[11px] text-slate-500">Private company opportunities released to your profile.</p>
          </div>
          <div className="divide-y divide-black/[0.06]">
            {partner.matches.map((match) => (
              <Link key={match.id} href={`/partner/matches/${match.id}`} className="partner-intro-row">
                <span>{match.request.reference}</span>
                <strong>{directionLabel(match.request.direction)}</strong>
                <StatusBadge status={match.status} />
                <i aria-hidden>Open →</i>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <p className="mt-5 text-[10.5px] leading-5 text-slate-400">
        INRP2P coordinates access and records operational evidence. Partner and company accounts remain external; live order access and volume are never guaranteed.
      </p>
    </>
  );
}
