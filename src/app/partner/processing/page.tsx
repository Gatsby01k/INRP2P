import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { claimProcessingOrder, createPaymentRail, partnerDisputeSettlement, updatePaymentRailStatus } from "@/app/actions/processing";
import { SubmitButton } from "@/components/submit-button";
import { EmptyState, Field, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { Flash } from "@/components/workspace/flash";
import { requireVerifiedRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { bpsLabel, inr, paymentRailLabel, processingTypeLabel } from "@/lib/processing";

export const metadata: Metadata = { title: "Processing desk" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PartnerProcessingPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const user = await requireVerifiedRole("PARTNER");
  if (!user.partner) redirect("/login");
  const query = await searchParams;
  const now = new Date();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [account, rails, deposits, mine, completedToday, settlements, connections] = await Promise.all([
    db.partnerProcessingAccount.findUnique({ where: { partnerId: user.partner.id } }),
    db.partnerPaymentRail.findMany({ where: { partnerId: user.partner.id }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] }),
    db.partnerDeposit.findMany({ where: { partnerId: user.partner.id, status: "CONFIRMED" }, select: { amount: true, actualAmount: true } }),
    db.processingOrder.findMany({ where: { partnerId: user.partner.id }, include: { company: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.processingOrder.findMany({ where: { partnerId: user.partner.id, status: "COMPLETED", completedAt: { gte: today } }, select: { type: true, amountInr: true, partnerFeeInr: true } }),
    db.processingSettlement.findMany({ where: { partnerId: user.partner.id }, include: { company: true, _count: { select: { orders: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.companyPartnerConnection.findMany({ where: { partnerId: user.partner.id, status: "ACTIVE" }, select: { organization: { select: { companyProfileId: true } } } }),
  ]);

  const activeRails = rails.filter((rail) => rail.status === "ACTIVE");
  const railTypes = [...new Set(activeRails.map((rail) => rail.type))];
  const availableLimit = account ? account.approvedLimitInr.minus(account.lockedExposureInr) : null;
  const connectedCompanyIds = connections.map((connection) => connection.organization.companyProfileId);
  const queue = account?.enabled && availableLimit?.gt(0)
    ? (await db.processingOrder.findMany({
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
      }))
    : [];
  const reserve = deposits.reduce((sum, deposit) => sum + Number((deposit.actualAmount ?? deposit.amount).toString()), 0);
  const activeOrders = mine.filter((order) => ["ASSIGNED", "PAYMENT_MARKED", "PAYOUT_SENT", "DISPUTED"].includes(order.status));
  const payInToday = completedToday.filter((order) => order.type === "PAY_IN").reduce((sum, order) => sum + Number(order.amountInr), 0);
  const payOutToday = completedToday.filter((order) => order.type === "PAY_OUT").reduce((sum, order) => sum + Number(order.amountInr), 0);
  const feesToday = completedToday.reduce((sum, order) => sum + Number(order.partnerFeeInr), 0);

  return (
    <>
      <PageHeader title="Processing desk" sub="Take live merchant pay-in and pay-out orders, record bank evidence, resolve exceptions and reconcile settlements." />
      <Flash notice={query.notice} error={query.error} />

      <section className="mb-5 overflow-hidden rounded-2xl bg-[#07152e] text-white shadow-card">
        <div className="grid gap-px bg-white/10 lg:grid-cols-[1.35fr_repeat(4,1fr)]">
          <div className="bg-[#07152e] p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-400">Insurance-controlled capacity</p>
              <StatusBadge status={account?.enabled ? "ACTIVE" : "PAUSED"} className="border-white/10 bg-white/10 text-white" />
            </div>
            <p className="mt-3 text-3xl font-semibold tabular-nums">{availableLimit ? inr(availableLimit) : "Not enabled"}</p>
            <p className="mt-1 text-xs text-white/50">Available to take new orders</p>
          </div>
          <div className="bg-[#07152e] p-5"><p className="text-[10px] uppercase tracking-[0.1em] text-white/45">Approved limit</p><p className="mt-2 text-lg font-semibold tabular-nums">{account ? inr(account.approvedLimitInr) : "—"}</p></div>
          <div className="bg-[#07152e] p-5"><p className="text-[10px] uppercase tracking-[0.1em] text-white/45">Locked exposure</p><p className="mt-2 text-lg font-semibold tabular-nums">{account ? inr(account.lockedExposureInr) : "—"}</p></div>
          <div className="bg-[#07152e] p-5"><p className="text-[10px] uppercase tracking-[0.1em] text-white/45">Confirmed reserve</p><p className="mt-2 text-lg font-semibold tabular-nums">{reserve.toLocaleString("en-US", { maximumFractionDigits: 6 })} USDT</p></div>
          <div className="bg-[#07152e] p-5"><p className="text-[10px] uppercase tracking-[0.1em] text-white/45">Fee schedule</p><p className="mt-2 text-sm font-semibold">{account ? `${bpsLabel(account.payInFeeBps)} in · ${bpsLabel(account.payOutFeeBps)} out` : "—"}</p></div>
        </div>
      </section>

      {!account?.enabled ? <div className="mb-5 rounded-xl border border-gold-500/25 bg-gold-500/[0.07] px-4 py-3 text-xs leading-relaxed text-gold-800">Live processing is not enabled yet. Add and verify your payment rails, maintain a confirmed reserve, then operations assigns your INR exposure limit.</div> : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active orders" value={activeOrders.length} tone={activeOrders.length ? "gold" : "default"} />
        <Stat label="Pay-in today" value={inr(payInToday)} />
        <Stat label="Pay-out today" value={inr(payOutToday)} />
        <Stat label="Earned fee today" value={inr(feesToday)} tone="emerald" />
      </div>

      <section className="card mb-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] px-5 py-4">
          <div><h2 className="text-sm font-semibold text-slate-900">Live order queue</h2><p className="mt-0.5 text-[11px] text-slate-500">Oldest eligible orders first. Assignment and exposure lock happen atomically.</p></div>
          <span className="chip border-black/[0.08] bg-black/[0.03] text-slate-600">{queue.length} eligible</span>
        </div>
        {queue.length ? <div className="divide-y divide-black/[0.06]">
          {queue.map((order) => {
            const matchingRails = activeRails.filter((rail) => rail.type === order.requestedRail && (!rail.minTicketInr || order.amountInr.gte(rail.minTicketInr)) && (!rail.maxTicketInr || order.amountInr.lte(rail.maxTicketInr)));
            return <article key={order.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(100px,.55fr))_minmax(220px,.9fr)] lg:items-center">
              <div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-semibold text-gold-700">{order.reference}</span><span className={order.type === "PAY_IN" ? "chip border-sky-200 bg-sky-50 text-sky-700" : "chip border-leaf-200 bg-leaf-50 text-leaf-700"}>{processingTypeLabel(order.type)}</span></div><p className="mt-1 text-[11px] text-slate-400">Merchant identity opens after assignment</p></div>
              <div><p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">Amount</p><p className="mt-1 font-semibold tabular-nums text-slate-900">{inr(order.amountInr)}</p></div>
              <div><p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">Rail</p><p className="mt-1 text-sm text-slate-700">{paymentRailLabel(order.requestedRail)}</p></div>
              <div><p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">Expires</p><p className="mt-1 text-xs text-slate-600">{fmtDateTime(order.expiresAt)}</p></div>
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
        <div className="border-b border-black/[0.06] px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">My orders</h2><p className="mt-0.5 text-[11px] text-slate-500">Active work first, then recent completed and closed orders.</p></div>
        {mine.length ? <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Order</th><th>Merchant</th><th>Flow</th><th>Amount</th><th>Rail</th><th>Fee</th><th>Status</th><th></th></tr></thead><tbody>{mine.map((order) => <tr key={order.id}><td className="font-mono text-xs text-gold-700">{order.reference}</td><td>{order.company.companyName}</td><td>{processingTypeLabel(order.type)}</td><td className="font-semibold tabular-nums">{inr(order.amountInr)}</td><td>{paymentRailLabel(order.requestedRail)}</td><td>{inr(order.partnerFeeInr)}</td><td><StatusBadge status={order.status} /></td><td><Link className="text-xs font-semibold text-gold-700 hover:underline" href={`/partner/processing/${order.id}`}>Open →</Link></td></tr>)}</tbody></table></div> : <div className="p-5"><EmptyState title="No orders assigned yet" body="Take an eligible order from the queue when your capacity is available." /></div>}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,.7fr)]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-900">Payment rails</h2><p className="mt-0.5 text-[11px] text-slate-500">Full destinations stay encrypted; only masked values appear here.</p></div><span className="chip border-black/[0.08] bg-black/[0.03] text-slate-600">{rails.length}</span></div>
          {rails.length ? <div className="divide-y divide-black/[0.06]">{rails.map((rail) => <div key={rail.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-semibold text-gold-700">{rail.reference}</span><StatusBadge status={rail.status} /><span className="text-xs font-semibold text-slate-700">{rail.label}</span></div><p className="mt-1 text-xs text-slate-500">{paymentRailLabel(rail.type)} · {rail.bankName || "UPI"} · {rail.maskedDestination}</p><p className="mt-1 text-[10px] text-slate-400">Ticket {rail.minTicketInr ? inr(rail.minTicketInr) : "any"}–{rail.maxTicketInr ? inr(rail.maxTicketInr) : "any"} · daily {rail.dailyLimitInr ? inr(rail.dailyLimitInr) : "not capped"}</p></div><form action={updatePaymentRailStatus} className="flex gap-2"><input type="hidden" name="railId" value={rail.id} />{rail.status === "ACTIVE" ? <SubmitButton className="btn btn-ghost btn-sm" name="status" value="PAUSED" pendingLabel="Pausing…">Pause</SubmitButton> : rail.status === "PAUSED" ? <SubmitButton className="btn btn-ghost btn-sm" name="status" value="ACTIVE" pendingLabel="Activating…">Activate</SubmitButton> : null}{rail.status !== "DISABLED" ? <SubmitButton className="btn btn-ghost btn-sm text-rose-600" name="status" value="DISABLED" pendingLabel="Disabling…">Disable</SubmitButton> : null}</form></div>)}</div> : <div className="p-5"><EmptyState title="No payment rails" body="Add at least one UPI or bank destination before accepting pay-in orders." /></div>}
        </section>

        <details className="card h-fit p-5" open={!rails.length}>
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">Add payment rail</summary>
          <form action={createPaymentRail} className="mt-4 space-y-3">
            <Field label="Rail type"><select className="input" name="type" defaultValue="UPI"><option value="UPI">UPI</option><option value="IMPS">IMPS</option><option value="NEFT">NEFT</option><option value="RTGS">RTGS</option><option value="BANK_TRANSFER">Bank transfer</option></select></Field>
            <Field label="Desk label"><input className="input" name="label" placeholder="HDFC collection 01" maxLength={80} required /></Field>
            <Field label="Account holder"><input className="input" name="accountHolder" maxLength={120} required /></Field>
            <Field label="UPI ID" hint="Required only for UPI rails."><input className="input" name="upiId" placeholder="name@bank" maxLength={120} /></Field>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><Field label="Bank name"><input className="input" name="bankName" maxLength={120} /></Field><Field label="Account number"><input className="input" name="accountNumber" maxLength={40} /></Field></div>
            <Field label="IFSC"><input className="input uppercase" name="ifsc" maxLength={20} /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Min ticket"><input className="input" name="minTicketInr" type="number" min="1" step="0.01" /></Field><Field label="Max ticket"><input className="input" name="maxTicketInr" type="number" min="1" step="0.01" /></Field></div>
            <Field label="Daily rail limit"><input className="input" name="dailyLimitInr" type="number" min="1" step="0.01" /></Field>
            <SubmitButton className="btn btn-gold w-full" pendingLabel="Encrypting…">Add encrypted rail</SubmitButton>
          </form>
        </details>
      </div>

      <section className="card mt-6 overflow-hidden">
        <div className="border-b border-black/[0.06] px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Settlements</h2><p className="mt-0.5 text-[11px] text-slate-500">Completed orders are reconciled by merchant and partner before external settlement is recorded.</p></div>
        {settlements.length ? <div className="divide-y divide-black/[0.06]">{settlements.map((item) => <div key={item.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_repeat(4,minmax(100px,.6fr))_220px] lg:items-center"><div><div className="flex items-center gap-2"><span className="font-mono text-xs font-semibold text-gold-700">{item.reference}</span><StatusBadge status={item.status} /></div><p className="mt-1 text-xs text-slate-500">{item.company.companyName} · {item._count.orders} orders</p></div><div><p className="text-[10px] text-slate-400">Pay-in</p><p className="text-sm font-semibold">{inr(item.grossPayInInr)}</p></div><div><p className="text-[10px] text-slate-400">Pay-out</p><p className="text-sm font-semibold">{inr(item.grossPayOutInr)}</p></div><div><p className="text-[10px] text-slate-400">Fee</p><p className="text-sm font-semibold">{inr(item.partnerFeeInr)}</p></div><div><p className="text-[10px] text-slate-400">Net position</p><p className="text-sm font-semibold">{inr(item.netPositionInr)}</p></div><div>{["OPEN", "READY", "SUBMITTED"].includes(item.status) ? <details><summary className="cursor-pointer text-xs font-semibold text-rose-600">Report discrepancy</summary><form action={partnerDisputeSettlement} className="mt-2 space-y-2"><input type="hidden" name="settlementId" value={item.id} /><textarea className="input min-h-20" name="reason" minLength={10} required /><SubmitButton className="btn btn-ghost btn-sm w-full" pendingLabel="Opening…">Open settlement dispute</SubmitButton></form></details> : <p className="text-xs text-slate-500">{item.transactionHash || "No external reference"}</p>}</div></div>)}</div> : <div className="p-5"><EmptyState title="No settlements yet" body="Completed orders appear in a settlement after operations creates a reconciliation batch." /></div>}
      </section>
    </>
  );
}
