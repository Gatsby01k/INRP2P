import type { Metadata } from "next";
import Link from "next/link";
import { createProcessingOrderAsAdmin, createProcessingSettlement, configureProcessingAccount, reviewPaymentRail, updateProcessingSettlement } from "@/app/actions/processing";
import { SubmitButton } from "@/components/submit-button";
import { EmptyState, Field, PageHeader, SectionTitle, Stat, StatusBadge } from "@/components/ui";
import { Flash } from "@/components/workspace/flash";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { decryptProcessingData } from "@/lib/processing-data";
import { inr, paymentRailLabel, processingTypeLabel } from "@/lib/processing";

export const metadata: Metadata = { title: "Processing control" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminProcessingPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const query = await searchParams;
  const [orders, partners, companies, settlements, unsettled] = await Promise.all([
    db.processingOrder.findMany({ include: { company: true, partner: true }, orderBy: { createdAt: "desc" }, take: 300 }),
    db.partnerProfile.findMany({ where: { status: { in: ["VERIFIED", "LIMITED"] } }, include: { processingAccount: true, paymentRails: true, deposits: { where: { status: "CONFIRMED" } } }, orderBy: { displayName: "asc" } }),
    db.companyProfile.findMany({ orderBy: { companyName: "asc" }, select: { id: true, companyName: true } }),
    db.processingSettlement.findMany({ include: { company: true, partner: true, _count: { select: { orders: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.processingOrder.findMany({ where: { status: "COMPLETED", settlementId: null, partnerId: { not: null } }, include: { company: true, partner: true }, orderBy: { completedAt: "asc" }, take: 1000 }),
  ]);

  const active = orders.filter((order) => ["ASSIGNED", "PAYMENT_MARKED", "PAYOUT_SENT"].includes(order.status));
  const available = orders.filter((order) => order.status === "AVAILABLE" && order.expiresAt > new Date());
  const disputes = orders.filter((order) => order.status === "DISPUTED");
  const completed = orders.filter((order) => order.status === "COMPLETED");
  const completedVolume = completed.reduce((sum, order) => sum + Number(order.amountInr), 0);
  const lockedExposure = partners.reduce((sum, partner) => sum + Number(partner.processingAccount?.lockedExposureInr ?? 0), 0);
  const pendingRails = partners.flatMap((partner) => partner.paymentRails.filter((rail) => rail.status === "PENDING_REVIEW").map((rail) => ({ partner, rail })));
  const settlementCandidates = new Map<string, typeof unsettled>();
  for (const order of unsettled) {
    if (!order.partnerId) continue;
    const key = `${order.companyId}:${order.partnerId}`;
    settlementCandidates.set(key, [...(settlementCandidates.get(key) ?? []), order]);
  }

  return (
    <>
      <PageHeader title="Processing control" sub="Live pay-in/pay-out queue, trader exposure, disputes and external settlement reconciliation." actions={<Link href="/admin/deposits" className="btn btn-ghost btn-sm">Insurance reserve</Link>} />
      <Flash notice={query.notice} error={query.error} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Available queue" value={available.length} />
        <Stat label="Active orders" value={active.length} tone={active.length ? "gold" : "default"} />
        <Stat label="Open disputes" value={disputes.length} tone={disputes.length ? "gold" : "default"} />
        <Stat label="Completed volume" value={inr(completedVolume)} tone="emerald" />
        <Stat label="Locked exposure" value={inr(lockedExposure)} />
      </div>

      {disputes.length ? <section className="mb-6 rounded-2xl border border-rose-200 bg-rose-50/70 p-5"><SectionTitle title="Requires operator decision" /><div className="space-y-2">{disputes.map((order) => <Link key={order.id} href={`/admin/processing/${order.id}`} className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-white px-4 py-3 transition hover:border-rose-300 sm:flex-row sm:items-center sm:justify-between"><div><span className="font-mono text-xs font-semibold text-rose-700">{order.reference}</span><span className="ml-2 text-sm font-semibold text-slate-900">{order.company.companyName} ↔ {order.partner?.displayName}</span><p className="mt-1 text-xs text-rose-700">{order.disputeReason}</p></div><div className="flex items-center gap-3"><span className="font-semibold tabular-nums text-slate-900">{inr(order.amountInr)}</span><span className="text-xs font-semibold text-rose-700">Review →</span></div></Link>)}</div></section> : null}

      {pendingRails.length ? <section className="card mb-6 overflow-hidden"><div className="border-b border-black/[0.06] px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Payment rails awaiting review</h2><p className="mt-0.5 text-[11px] text-slate-500">Verify account ownership and destination outside the app, then record the evidence used.</p></div><div className="divide-y divide-black/[0.06]">{pendingRails.map(({ partner, rail }) => {
        let details: ReturnType<typeof decryptProcessingData> | null = null;
        try { details = decryptProcessingData(rail.encryptedDetails); } catch { details = null; }
        return <form key={rail.id} action={reviewPaymentRail} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(260px,.9fr)] lg:items-end"><input type="hidden" name="railId" value={rail.id} /><div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-semibold text-gold-700">{rail.reference}</span><StatusBadge status={rail.status} /></div><p className="mt-1 text-sm font-semibold text-slate-900">{partner.displayName} · {rail.label}</p><p className="mt-1 text-xs text-slate-500">{paymentRailLabel(rail.type)} · {rail.maskedDestination}</p></div><div className="grid grid-cols-2 gap-3 text-xs"><div><p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">Holder</p><p className="mt-1 select-all font-medium text-slate-800">{details?.accountHolder ?? "Encryption key unavailable"}</p></div><div><p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">Destination</p><p className="mt-1 select-all font-mono text-slate-800">{details?.upiId ?? details?.accountNumber ?? "—"}</p></div><div><p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">Bank</p><p className="mt-1 text-slate-700">{details?.bankName ?? "—"}</p></div><div><p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">IFSC</p><p className="mt-1 select-all font-mono text-slate-700">{details?.ifsc ?? "—"}</p></div></div><div><Field label="Review evidence"><textarea className="input min-h-20" name="note" minLength={5} required placeholder="Ownership check, penny test, video or bank proof" /></Field><div className="mt-2 grid grid-cols-2 gap-2"><SubmitButton className="btn btn-gold btn-sm" name="decision" value="approve" pendingLabel="Saving…">Approve rail</SubmitButton><SubmitButton className="btn btn-ghost btn-sm" name="decision" value="reject" pendingLabel="Saving…">Reject</SubmitButton></div></div></form>;
      })}</div></section> : null}

      <section className="card mb-6 overflow-hidden">
        <div className="border-b border-black/[0.06] px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Trader exposure controls</h2><p className="mt-0.5 text-[11px] text-slate-500">Enable only after reserve confirmation. Approved INR limit is the hard ceiling for concurrent order exposure.</p></div>
        {partners.length ? <div className="divide-y divide-black/[0.06]">{partners.map((partner) => {
          const reserve = partner.deposits.reduce((sum, item) => sum + Number(item.actualAmount ?? item.amount), 0);
          const account = partner.processingAccount;
          return <form key={partner.id} action={configureProcessingAccount} className="grid gap-4 px-5 py-4 xl:grid-cols-[minmax(220px,1.3fr)_repeat(5,minmax(120px,.7fr))_auto] xl:items-end">
            <input type="hidden" name="partnerId" value={partner.id} />
            <div><div className="flex flex-wrap items-center gap-2"><Link href={`/admin/partners/${partner.id}`} className="font-semibold text-slate-900 hover:text-gold-700">{partner.displayName}</Link><StatusBadge status={partner.status} /><StatusBadge status={account?.enabled ? "ACTIVE" : "PAUSED"} /></div><p className="mt-1 text-xs text-slate-500">{partner.reference} · {partner.paymentRails.filter((rail) => rail.status === "ACTIVE").length} active rails · {reserve.toLocaleString("en-US", { maximumFractionDigits: 6 })} USDT reserve</p></div>
            <Field label="Processing"><select className="input h-9 py-0 text-xs" name="enabled" defaultValue={account?.enabled ? "true" : "false"}><option value="false">Paused</option><option value="true">Enabled</option></select></Field>
            <Field label="Approved INR limit"><input className="input h-9 py-0" name="approvedLimitInr" type="number" min="0" step="0.01" defaultValue={account?.approvedLimitInr.toString() ?? "0"} required /></Field>
            <div><p className="lbl">Locked now</p><p className="flex h-9 items-center text-sm font-semibold tabular-nums">{inr(account?.lockedExposureInr ?? 0)}</p></div>
            <Field label="Pay-in fee, bps"><input className="input h-9 py-0" name="payInFeeBps" type="number" min="0" max="5000" defaultValue={account?.payInFeeBps ?? 0} required /></Field>
            <Field label="Pay-out fee, bps"><input className="input h-9 py-0" name="payOutFeeBps" type="number" min="0" max="5000" defaultValue={account?.payOutFeeBps ?? 0} required /></Field>
            <SubmitButton className="btn btn-gold btn-sm" pendingLabel="Saving…">Save controls</SubmitButton>
          </form>;
        })}</div> : <div className="p-5"><EmptyState title="No verified processing partners" body="Verify a partner and confirm their reserve before assigning a processing limit." /></div>}
      </section>

      <section className="card mb-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-900">Order control ledger</h2><p className="mt-0.5 text-[11px] text-slate-500">Merchant order, partner assignment, amount and operational state in one queue.</p></div><span className="chip border-black/[0.08] bg-black/[0.03] text-slate-600">Latest {orders.length}</span></div>
        {orders.length ? <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Order</th><th>Merchant</th><th>Partner</th><th>Flow</th><th>Amount</th><th>Rail</th><th>Fee</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><span className="font-mono text-xs font-semibold text-gold-700">{order.reference}</span><p className="mt-1 text-[10px] text-slate-400">{order.externalReference}</p></td><td>{order.company.companyName}</td><td>{order.partner?.displayName ?? "Queue"}</td><td>{processingTypeLabel(order.type)}</td><td className="font-semibold tabular-nums">{inr(order.amountInr)}</td><td>{paymentRailLabel(order.requestedRail)}</td><td>{inr(order.partnerFeeInr)}</td><td><StatusBadge status={order.status} /></td><td className="whitespace-nowrap text-xs text-slate-500">{fmtDateTime(order.updatedAt)}</td><td><Link className="text-xs font-semibold text-gold-700 hover:underline" href={`/admin/processing/${order.id}`}>Control →</Link></td></tr>)}</tbody></table></div> : <div className="p-5"><EmptyState title="No processing orders" body="Real merchant orders appear here after a company or operator releases them to the queue." /></div>}
      </section>

      <div className="mb-6 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,.9fr)]">
        <section className="card overflow-hidden">
          <div className="border-b border-black/[0.06] px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Ready to reconcile</h2><p className="mt-0.5 text-[11px] text-slate-500">Completed, unbatched orders grouped by merchant and trader.</p></div>
          {settlementCandidates.size ? <div className="divide-y divide-black/[0.06]">{[...settlementCandidates.entries()].map(([key, items]) => {
            const first = items[0]!;
            const payIn = items.filter((order) => order.type === "PAY_IN").reduce((sum, order) => sum + Number(order.amountInr), 0);
            const payOut = items.filter((order) => order.type === "PAY_OUT").reduce((sum, order) => sum + Number(order.amountInr), 0);
            const fee = items.reduce((sum, order) => sum + Number(order.partnerFeeInr), 0);
            return <form key={key} action={createProcessingSettlement} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_repeat(3,minmax(90px,.55fr))_150px] sm:items-end"><input type="hidden" name="companyId" value={first.companyId} /><input type="hidden" name="partnerId" value={first.partnerId!} /><div><p className="text-sm font-semibold text-slate-900">{first.company.companyName} ↔ {first.partner?.displayName}</p><p className="mt-1 text-xs text-slate-500">{items.length} completed orders</p></div><div><p className="text-[10px] text-slate-400">Pay-in</p><p className="text-sm font-semibold">{inr(payIn)}</p></div><div><p className="text-[10px] text-slate-400">Pay-out</p><p className="text-sm font-semibold">{inr(payOut)}</p></div><div><p className="text-[10px] text-slate-400">Partner fee</p><p className="text-sm font-semibold">{inr(fee)}</p></div><SubmitButton className="btn btn-gold btn-sm" pendingLabel="Creating…">Create batch</SubmitButton></form>;
          })}</div> : <div className="p-5"><EmptyState title="Nothing waiting for settlement" body="Only completed orders that are not already in a batch appear here." /></div>}
        </section>

        <details className="card h-fit overflow-hidden">
          <summary className="cursor-pointer border-b border-black/[0.06] px-5 py-4"><span className="text-sm font-semibold text-slate-900">Create order for merchant</span><span className="mt-0.5 block text-[11px] text-slate-500">Operator-assisted intake. The same validation applies as the company workspace.</span></summary>
          <form action={createProcessingOrderAsAdmin} className="space-y-3 p-5">
            <Field label="Merchant"><select className="input" name="companyId" required defaultValue=""><option value="" disabled>Select company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.companyName}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Flow"><select className="input" name="type"><option value="PAY_IN">Pay-in</option><option value="PAY_OUT">Pay-out</option></select></Field><Field label="Rail"><select className="input" name="requestedRail"><option value="UPI">UPI</option><option value="IMPS">IMPS</option><option value="NEFT">NEFT</option><option value="RTGS">RTGS</option><option value="BANK_TRANSFER">Bank transfer</option></select></Field></div>
            <div className="grid grid-cols-2 gap-3"><Field label="Merchant order ID"><input className="input" name="externalReference" required /></Field><Field label="INR amount"><input className="input" name="amountInr" type="number" min="1" step="0.01" required /></Field></div>
            <input type="hidden" name="expiryMinutes" value="30" />
            <Field label="Payer name (pay-in)"><input className="input" name="payerName" /></Field><Field label="Payer reference"><input className="input" name="payerReference" /></Field>
            <Field label="Beneficiary name (pay-out)"><input className="input" name="beneficiaryName" /></Field><Field label="Beneficiary UPI"><input className="input" name="upiId" /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Bank"><input className="input" name="bankName" /></Field><Field label="Account"><input className="input" name="accountNumber" /></Field></div><Field label="IFSC"><input className="input uppercase" name="ifsc" /></Field>
            <Field label="Merchant instruction"><textarea className="input min-h-20" name="companyNote" /></Field>
            <SubmitButton className="btn btn-gold w-full" pendingLabel="Releasing…">Release order</SubmitButton>
          </form>
        </details>
      </div>

      <section className="card overflow-hidden">
        <div className="border-b border-black/[0.06] px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Settlement control ledger</h2><p className="mt-0.5 text-[11px] text-slate-500">Review gross flows and fee separately before recording the external settlement reference.</p></div>
        {settlements.length ? <div className="divide-y divide-black/[0.06]">{settlements.map((item) => <article key={item.id} className="p-5"><div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(100px,.55fr))] lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-semibold text-gold-700">{item.reference}</span><StatusBadge status={item.status} /></div><p className="mt-1 text-sm font-semibold text-slate-900">{item.company.companyName} ↔ {item.partner.displayName}</p><p className="mt-1 text-xs text-slate-500">{item._count.orders} orders · created {fmtDateTime(item.createdAt)}</p></div><div><p className="text-[10px] text-slate-400">Pay-in</p><p className="text-sm font-semibold">{inr(item.grossPayInInr)}</p></div><div><p className="text-[10px] text-slate-400">Pay-out</p><p className="text-sm font-semibold">{inr(item.grossPayOutInr)}</p></div><div><p className="text-[10px] text-slate-400">Partner fee</p><p className="text-sm font-semibold">{inr(item.partnerFeeInr)}</p></div><div><p className="text-[10px] text-slate-400">Net position</p><p className="text-sm font-semibold">{inr(item.netPositionInr)}</p></div></div>
          <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-black/[0.06] pt-4">
            {item.status === "OPEN" || item.status === "DISPUTED" ? <form action={updateProcessingSettlement}><input type="hidden" name="settlementId" value={item.id} /><SubmitButton className="btn btn-ghost btn-sm" name="status" value="READY" pendingLabel="Saving…">Mark reconciled</SubmitButton></form> : null}
            {item.status === "READY" ? <form action={updateProcessingSettlement} className="grid w-full gap-2 sm:grid-cols-[140px_140px_minmax(180px,1fr)_auto]"><input type="hidden" name="settlementId" value={item.id} /><input className="input h-9 py-0" name="settlementRate" type="number" min="0" step="0.000001" placeholder="Rate" /><input className="input h-9 py-0" name="settlementAmountUsdt" type="number" min="0" step="0.000001" placeholder="USDT amount" /><input className="input h-9 py-0" name="transactionHash" placeholder="UTR / TXID / external settlement reference" required /><SubmitButton className="btn btn-gold btn-sm" name="status" value="SUBMITTED" pendingLabel="Recording…">Record submitted</SubmitButton></form> : null}
            {item.status === "SUBMITTED" ? <form action={updateProcessingSettlement}><input type="hidden" name="settlementId" value={item.id} /><SubmitButton className="btn btn-gold btn-sm" name="status" value="CONFIRMED" pendingLabel="Confirming…">Confirm settlement</SubmitButton></form> : null}
            {["OPEN", "READY", "SUBMITTED"].includes(item.status) ? <details className="ml-auto"><summary className="cursor-pointer text-xs font-semibold text-rose-600">Exception</summary><form action={updateProcessingSettlement} className="mt-2 grid gap-2 sm:grid-cols-[minmax(220px,1fr)_auto_auto]"><input type="hidden" name="settlementId" value={item.id} /><input className="input h-9 py-0" name="note" minLength={10} placeholder="Reason and evidence" required /><SubmitButton className="btn btn-ghost btn-sm" name="status" value="DISPUTED" pendingLabel="Saving…">Dispute</SubmitButton>{item.status !== "SUBMITTED" ? <SubmitButton className="btn btn-ghost btn-sm" name="status" value="CANCELLED" pendingLabel="Cancelling…">Cancel batch</SubmitButton> : null}</form></details> : null}
            {item.transactionHash ? <p className="w-full break-all font-mono text-[10px] text-slate-500">External reference: {item.transactionHash}</p> : null}
          </div></article>)}</div> : <div className="p-5"><EmptyState title="No settlement batches" body="Create one from the completed-order groups above." /></div>}
      </section>
    </>
  );
}
