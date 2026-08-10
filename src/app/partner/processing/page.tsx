import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { claimProcessingOrder, createPaymentRail, partnerDisputeSettlement, updatePaymentRailStatus } from "@/app/actions/processing";
import { PartnerOrderPreview } from "@/components/processing/partner-order-preview";
import { OrderExpiry } from "@/components/processing/order-expiry";
import { SubmitButton } from "@/components/submit-button";
import { EmptyState, Field, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { Flash } from "@/components/workspace/flash";
import { requireVerifiedRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { logError } from "@/lib/error-log";
import { fmtDateTime } from "@/lib/format";
import { indiaPerformancePeriods } from "@/lib/partner-performance";
import { partnerProgramLevel } from "@/lib/partner-program";
import { bpsLabel, inr, paymentRailLabel, processingTypeLabel } from "@/lib/processing";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadPartnerProcessingDesk(partnerId: string, now: Date, today: Date) {
  const [account, rails, deposits, mine, completedToday, settlements, connections] = await Promise.all([
    db.partnerProcessingAccount.findUnique({ where: { partnerId } }),
    db.partnerPaymentRail.findMany({ where: { partnerId }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] }),
    db.partnerDeposit.findMany({ where: { partnerId, status: "CONFIRMED" }, select: { amount: true, actualAmount: true } }),
    db.processingOrder.findMany({ where: { partnerId }, include: { company: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.processingOrder.findMany({ where: { partnerId, status: "COMPLETED", completedAt: { gte: today } }, select: { type: true, amountInr: true, partnerFeeInr: true } }),
    db.processingSettlement.findMany({ where: { partnerId }, include: { company: true, _count: { select: { orders: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.companyPartnerConnection.findMany({ where: { partnerId, status: "ACTIVE" }, select: { organization: { select: { companyProfileId: true } } } }),
  ]);

  const activeRails = rails.filter((rail) => rail.status === "ACTIVE");
  const railTypes = [...new Set(activeRails.map((rail) => rail.type))];
  const availableLimit = account ? account.approvedLimitInr.minus(account.lockedExposureInr) : null;
  const connectedCompanyIds = connections.map((connection) => connection.organization.companyProfileId);
  const queue = account?.enabled && availableLimit?.gt(0)
    ? await db.processingOrder.findMany({
        where: {
          status: "AVAILABLE",
          companyId: { in: connectedCompanyIds },
          expiresAt: { gt: now },
          amountInr: { lte: availableLimit },
          OR: [{ type: "PAY_OUT" }, { type: "PAY_IN", requestedRail: { in: railTypes } }],
        },
        include: { company: { select: { id: true } } },
        orderBy: [{ createdAt: "asc" }],
        take: 50,
      })
    : [];

  return { account, rails, deposits, mine, completedToday, settlements, activeRails, availableLimit, queue };
}

export default async function PartnerProcessingPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string; plan?: string }>;
}) {
  const user = await requireVerifiedRole("PARTNER");
  if (!user.partner) redirect("/login");
  const query = await searchParams;
  const selectedLevel = partnerProgramLevel(query.plan ?? user.partner.programLevel);

  let confirmedReserve = false;
  let confirmedReserveUsdt = 0;
  let activationState: "NOT_STARTED" | "AWAITING_PAYMENT" | "UNDER_REVIEW" = "NOT_STARTED";
  try {
    const reserveEntries = await db.partnerDeposit.findMany({
      where: { partnerId: user.partner.id },
      select: { status: true, amount: true, actualAmount: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    confirmedReserveUsdt = reserveEntries
      .filter((entry) => entry.status === "CONFIRMED")
      .reduce((sum, entry) => sum + Number((entry.actualAmount ?? entry.amount).toString()), 0);
    confirmedReserve = confirmedReserveUsdt >= selectedLevel.activationReserveUsdt;
    activationState = reserveEntries.some((entry) => entry.status === "CONFIRMING")
      ? "UNDER_REVIEW"
      : reserveEntries.some((entry) => entry.status === "AWAITING_PAYMENT")
        ? "AWAITING_PAYMENT"
        : "NOT_STARTED";
  } catch (cause) {
    await logError({
      error: cause,
      source: "page:/partner/processing:reserve-gate",
      severity: "ERROR",
      url: "/partner/processing",
      userId: user.id,
      meta: { partnerId: user.partner.id },
    });
  }

  if (!confirmedReserve) {
    return (
      <>
        <PageHeader
          title="Orders"
          sub="Explore the order workflow, choose your operating level and activate your desk from any sample order."
        />
        <Flash notice={query.notice} error={query.error} />
        <PartnerOrderPreview
          selectedLevel={selectedLevel}
          activationState={activationState}
          confirmedReserveUsdt={confirmedReserveUsdt}
        />
      </>
    );
  }

  const now = new Date();
  const { todayStart } = indiaPerformancePeriods(now);

  let desk: Awaited<ReturnType<typeof loadPartnerProcessingDesk>>;
  try {
    desk = await loadPartnerProcessingDesk(user.partner.id, now, todayStart);
  } catch (cause) {
    await logError({
      error: cause,
      source: "page:/partner/processing",
      severity: "FATAL",
      url: "/partner/processing",
      userId: user.id,
      meta: { partnerId: user.partner.id },
    });

    return (
      <>
        <PageHeader title="Orders" sub="Your processing workspace is temporarily unavailable." />
        <Flash notice={query.notice} error={query.error} />
        <section className="card p-6 sm:p-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-600">Temporary server issue</p>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">Your profile and application were not affected</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Live order data could not be loaded. Operations has received the technical reference automatically. Retry shortly or return to your partner home.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/partner/processing" className="btn btn-gold btn-sm">Retry orders</Link>
            <Link href="/partner" className="btn btn-ghost btn-sm">Partner home</Link>
          </div>
        </section>
      </>
    );
  }

  const { account, rails, deposits, mine, completedToday, settlements, activeRails, availableLimit, queue } = desk;
  const reserve = deposits.reduce((sum, deposit) => sum + Number((deposit.actualAmount ?? deposit.amount).toString()), 0);
  const activeOrders = mine.filter((order) => ["ASSIGNED", "PAYMENT_MARKED", "PAYOUT_SENT", "DISPUTED"].includes(order.status));
  const orderHistory = mine.filter((order) => !["ASSIGNED", "PAYMENT_MARKED", "PAYOUT_SENT", "DISPUTED"].includes(order.status));
  const payInToday = completedToday.filter((order) => order.type === "PAY_IN").reduce((sum, order) => sum + Number(order.amountInr), 0);
  const payOutToday = completedToday.filter((order) => order.type === "PAY_OUT").reduce((sum, order) => sum + Number(order.amountInr), 0);
  const feesToday = completedToday.reduce((sum, order) => sum + Number(order.partnerFeeInr), 0);

  return (
    <>
      <PageHeader title="Orders" sub="Take eligible pay-in and pay-out orders, complete the next required action and keep every payment reference attached to the order." />
      <Flash notice={query.notice} error={query.error} />

      <section className="mb-5 overflow-hidden rounded-2xl bg-[#07152e] text-white shadow-card">
        <div className="grid gap-px bg-white/10 lg:grid-cols-[1.35fr_repeat(4,1fr)]">
          <div className="bg-[#07152e] p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-400">Your INR order limit</p>
              <StatusBadge status={account?.enabled ? "ACTIVE" : "PAUSED"} className="border-white/10 bg-white/10 text-white" />
            </div>
            <p className="mt-3 text-3xl font-semibold tabular-nums">{availableLimit ? inr(availableLimit) : "Not enabled"}</p>
            <p className="mt-1 text-xs text-white/50">Free limit available for new orders</p>
          </div>
          <div className="bg-[#07152e] p-5"><p className="text-[10px] uppercase tracking-[0.1em] text-white/45">Approved limit</p><p className="mt-2 text-lg font-semibold tabular-nums">{account ? inr(account.approvedLimitInr) : "—"}</p></div>
          <div className="bg-[#07152e] p-5"><p className="text-[10px] uppercase tracking-[0.1em] text-white/45">In active orders</p><p className="mt-2 text-lg font-semibold tabular-nums">{account ? inr(account.lockedExposureInr) : "—"}</p></div>
          <div className="bg-[#07152e] p-5"><p className="text-[10px] uppercase tracking-[0.1em] text-white/45">Confirmed reserve</p><p className="mt-2 text-lg font-semibold tabular-nums">{reserve.toLocaleString("en-US", { maximumFractionDigits: 6 })} USDT</p></div>
          <div className="bg-[#07152e] p-5"><p className="text-[10px] uppercase tracking-[0.1em] text-white/45">Fee schedule</p><p className="mt-2 text-sm font-semibold">{account ? `${bpsLabel(account.payInFeeBps)} in · ${bpsLabel(account.payOutFeeBps)} out` : "—"}</p></div>
        </div>
      </section>

      {!account?.enabled ? <div className="mb-5 rounded-xl border border-gold-500/25 bg-gold-500/[0.07] px-4 py-3 text-xs leading-relaxed text-gold-800"><strong className="font-semibold">Orders are still locked.</strong> Complete partner review, confirm the operating reserve and add a payment account. Operations then assigns your INR order limit.</div> : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Need action" value={activeOrders.length} tone={activeOrders.length ? "gold" : "default"} />
        <Stat label="Pay-in completed today" value={inr(payInToday)} />
        <Stat label="Pay-out completed today" value={inr(payOutToday)} />
        <Stat label="Fee from completed orders" value={inr(feesToday)} tone="emerald" />
      </div>

      <section className="card mb-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] px-5 py-4">
          <div><h2 className="text-sm font-semibold text-slate-900">Available orders</h2><p className="mt-0.5 text-[11px] text-slate-500">Only orders that fit your active merchant connections, payment accounts and free INR limit appear here.</p></div>
          <span className="chip border-black/[0.08] bg-black/[0.03] text-slate-600">{queue.length} eligible</span>
        </div>
        {queue.length ? <div className="divide-y divide-black/[0.06]">
          {queue.map((order) => {
            const matchingRails = activeRails.filter((rail) => rail.type === order.requestedRail && (!rail.minTicketInr || order.amountInr.gte(rail.minTicketInr)) && (!rail.maxTicketInr || order.amountInr.lte(rail.maxTicketInr)));
            return <article key={order.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(100px,.55fr))_minmax(220px,.9fr)] lg:items-center">
              <div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-semibold text-gold-700">{order.reference}</span><span className={order.type === "PAY_IN" ? "chip border-sky-200 bg-sky-50 text-sky-700" : "chip border-leaf-200 bg-leaf-50 text-leaf-700"}>{processingTypeLabel(order.type)}</span></div><p className="mt-1 text-[11px] text-slate-400">Merchant identity opens after assignment</p></div>
              <div><p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">Amount</p><p className="mt-1 font-semibold tabular-nums text-slate-900">{inr(order.amountInr)}</p></div>
              <div><p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">Rail</p><p className="mt-1 text-sm text-slate-700">{paymentRailLabel(order.requestedRail)}</p></div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">Offer hold</p>
                <p className="mt-1"><OrderExpiry expiresAt={order.expiresAt.toISOString()} initialSeconds={Math.max(0, Math.ceil((order.expiresAt.getTime() - now.getTime()) / 1_000))} /></p>
                <p className="mt-0.5 text-[8px] text-slate-400">until {fmtDateTime(order.expiresAt)}</p>
              </div>
              <form action={claimProcessingOrder} className="flex min-w-0 gap-2">
                <input type="hidden" name="orderId" value={order.id} />
                {order.type === "PAY_IN" ? <select className="input h-9 min-w-0 flex-1 py-0 text-xs" name="railId" required defaultValue=""><option value="" disabled>Select rail</option>{matchingRails.map((rail) => <option key={rail.id} value={rail.id}>{rail.label} · {rail.maskedDestination}</option>)}</select> : null}
                <SubmitButton className="btn btn-gold btn-sm shrink-0" pendingLabel="Taking…">Take order</SubmitButton>
              </form>
            </article>;
          })}
        </div> : <div className="p-5"><EmptyState title="No eligible orders in the queue" body={account?.enabled ? "The desk updates as merchants release orders that fit your live limit and payment rails." : "Operations must enable your processing account before live orders can appear."} /></div>}
      </section>

      <section className="card mb-6 overflow-hidden">
        <div className="border-b border-black/[0.06] px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Orders requiring action</h2><p className="mt-0.5 text-[11px] text-slate-500">Finish these before taking more work. The order page shows the exact next action.</p></div>
        {activeOrders.length ? <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Order</th><th>Merchant</th><th>Flow</th><th>Amount</th><th>Rail</th><th>Status</th><th></th></tr></thead><tbody>{activeOrders.map((order) => <tr key={order.id}><td className="font-mono text-xs text-gold-700">{order.reference}</td><td>{order.company.companyName}</td><td>{processingTypeLabel(order.type)}</td><td className="font-semibold tabular-nums">{inr(order.amountInr)}</td><td>{paymentRailLabel(order.requestedRail)}</td><td><StatusBadge status={order.status} /></td><td><Link className="text-xs font-semibold text-gold-700 hover:underline" href={`/partner/processing/${order.id}`}>Continue →</Link></td></tr>)}</tbody></table></div> : <div className="p-5"><EmptyState title="No order needs action" body={account?.enabled ? "Take an eligible order from the queue when you are ready." : "Complete activation before taking orders."} /></div>}
        {orderHistory.length ? <details className="border-t border-black/[0.06]"><summary className="cursor-pointer px-5 py-4 text-xs font-semibold text-slate-600">Recent order history · {orderHistory.length}</summary><div className="overflow-x-auto border-t border-black/[0.06]"><table className="tbl"><thead><tr><th>Order</th><th>Merchant</th><th>Flow</th><th>Amount</th><th>Fee</th><th>Status</th><th></th></tr></thead><tbody>{orderHistory.map((order) => <tr key={order.id}><td className="font-mono text-xs text-gold-700">{order.reference}</td><td>{order.company.companyName}</td><td>{processingTypeLabel(order.type)}</td><td className="font-semibold tabular-nums">{inr(order.amountInr)}</td><td>{inr(order.partnerFeeInr)}</td><td><StatusBadge status={order.status} /></td><td><Link className="text-xs font-semibold text-gold-700 hover:underline" href={`/partner/processing/${order.id}`}>Open →</Link></td></tr>)}</tbody></table></div></details> : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,.7fr)]">
        <section id="payment-accounts" className="card scroll-mt-24 overflow-hidden">
          <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-900">Payment accounts</h2><p className="mt-0.5 text-[11px] text-slate-500">Add the UPI IDs or bank accounts used for pay-in orders. Full details remain encrypted.</p></div><span className="chip border-black/[0.08] bg-black/[0.03] text-slate-600">{rails.length}</span></div>
          {rails.length ? <div className="divide-y divide-black/[0.06]">{rails.map((rail) => <div key={rail.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-semibold text-gold-700">{rail.reference}</span><StatusBadge status={rail.status} /><span className="text-xs font-semibold text-slate-700">{rail.label}</span></div><p className="mt-1 text-xs text-slate-500">{paymentRailLabel(rail.type)} · {rail.bankName || "UPI"} · {rail.maskedDestination}</p><p className="mt-1 text-[10px] text-slate-400">Ticket {rail.minTicketInr ? inr(rail.minTicketInr) : "any"}–{rail.maxTicketInr ? inr(rail.maxTicketInr) : "any"} · daily {rail.dailyLimitInr ? inr(rail.dailyLimitInr) : "not capped"}</p></div><form action={updatePaymentRailStatus} className="flex gap-2"><input type="hidden" name="railId" value={rail.id} />{rail.status === "ACTIVE" ? <SubmitButton className="btn btn-ghost btn-sm" name="status" value="PAUSED" pendingLabel="Pausing…">Pause</SubmitButton> : rail.status === "PAUSED" ? <SubmitButton className="btn btn-ghost btn-sm" name="status" value="ACTIVE" pendingLabel="Activating…">Activate</SubmitButton> : null}{rail.status !== "DISABLED" ? <SubmitButton className="btn btn-ghost btn-sm text-rose-600" name="status" value="DISABLED" pendingLabel="Disabling…">Disable</SubmitButton> : null}</form></div>)}</div> : <div className="p-5"><EmptyState title="No payment rails" body="Add at least one UPI or bank destination before accepting pay-in orders." /></div>}
        </section>

        <details className="card h-fit p-5" open={!rails.length}>
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">Add UPI or bank account</summary>
          <form action={createPaymentRail} className="mt-4 space-y-3">
            <Field label="Rail type"><select className="input" name="type" defaultValue="UPI"><option value="UPI">UPI</option><option value="IMPS">IMPS</option><option value="NEFT">NEFT</option><option value="RTGS">RTGS</option><option value="BANK_TRANSFER">Bank transfer</option></select></Field>
            <Field label="Desk label"><input className="input" name="label" placeholder="HDFC collection 01" maxLength={80} required /></Field>
            <Field label="Account holder"><input className="input" name="accountHolder" maxLength={120} required /></Field>
            <Field label="UPI ID" hint="Required only for UPI rails."><input className="input" name="upiId" placeholder="name@bank" maxLength={120} /></Field>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><Field label="Bank name"><input className="input" name="bankName" maxLength={120} /></Field><Field label="Account number"><input className="input" name="accountNumber" maxLength={40} /></Field></div>
            <Field label="IFSC"><input className="input uppercase" name="ifsc" maxLength={20} /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Min ticket"><input className="input" name="minTicketInr" type="number" min="1" step="0.01" /></Field><Field label="Max ticket"><input className="input" name="maxTicketInr" type="number" min="1" step="0.01" /></Field></div>
            <Field label="Daily rail limit"><input className="input" name="dailyLimitInr" type="number" min="1" step="0.01" /></Field>
            <SubmitButton className="btn btn-gold w-full" pendingLabel="Saving securely…">Submit account for review</SubmitButton>
          </form>
        </details>
      </div>

      <section className="card mt-6 overflow-hidden">
        <div className="border-b border-black/[0.06] px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Settlement history</h2><p className="mt-0.5 text-[11px] text-slate-500">Completed orders, fees and the final INR position are reconciled before an external settlement is recorded.</p></div>
        {settlements.length ? <div className="divide-y divide-black/[0.06]">{settlements.map((item) => <div key={item.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_repeat(4,minmax(100px,.6fr))_220px] lg:items-center"><div><div className="flex items-center gap-2"><span className="font-mono text-xs font-semibold text-gold-700">{item.reference}</span><StatusBadge status={item.status} /></div><p className="mt-1 text-xs text-slate-500">{item.company.companyName} · {item._count.orders} orders</p></div><div><p className="text-[10px] text-slate-400">Pay-in</p><p className="text-sm font-semibold">{inr(item.grossPayInInr)}</p></div><div><p className="text-[10px] text-slate-400">Pay-out</p><p className="text-sm font-semibold">{inr(item.grossPayOutInr)}</p></div><div><p className="text-[10px] text-slate-400">Fee</p><p className="text-sm font-semibold">{inr(item.partnerFeeInr)}</p></div><div><p className="text-[10px] text-slate-400">Net position</p><p className="text-sm font-semibold">{inr(item.netPositionInr)}</p></div><div>{["OPEN", "READY", "SUBMITTED"].includes(item.status) ? <details><summary className="cursor-pointer text-xs font-semibold text-rose-600">Report discrepancy</summary><form action={partnerDisputeSettlement} className="mt-2 space-y-2"><input type="hidden" name="settlementId" value={item.id} /><textarea className="input min-h-20" name="reason" minLength={10} required /><SubmitButton className="btn btn-ghost btn-sm w-full" pendingLabel="Opening…">Open settlement dispute</SubmitButton></form></details> : <p className="text-xs text-slate-500">{item.transactionHash || "No external reference"}</p>}</div></div>)}</div> : <div className="p-5"><EmptyState title="No settlements yet" body="Completed orders appear in a settlement after operations creates a reconciliation batch." /></div>}
      </section>
    </>
  );
}
