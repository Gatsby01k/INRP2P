import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createProcessingOrder } from "@/app/actions/processing";
import { SubmitButton } from "@/components/submit-button";
import { EmptyState, Field, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { Flash } from "@/components/workspace/flash";
import { requireVerifiedRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { inr, paymentRailLabel, processingStatusHint, processingTypeLabel } from "@/lib/processing";

export const metadata: Metadata = { title: "Merchant processing" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

const RAIL_OPTIONS = ["UPI", "IMPS", "NEFT", "RTGS", "BANK_TRANSFER"] as const;

export default async function CompanyProcessingPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const user = await requireVerifiedRole("COMPANY");
  if (!user.company) redirect("/login");
  const query = await searchParams;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const [orders, settlements, enabledPartners] = await Promise.all([
    db.processingOrder.findMany({ where: { companyId: user.company.id }, include: { partner: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.processingSettlement.findMany({ where: { companyId: user.company.id }, include: { partner: true, _count: { select: { orders: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.partnerProcessingAccount.count({ where: { enabled: true, partner: { status: { in: ["VERIFIED", "LIMITED"] } } } }),
  ]);
  const active = orders.filter((order) => ["AVAILABLE", "ASSIGNED", "PAYMENT_MARKED", "PAYOUT_SENT", "DISPUTED"].includes(order.status));
  const completedToday = orders.filter((order) => order.status === "COMPLETED" && order.completedAt && order.completedAt >= today);
  const volumeToday = completedToday.reduce((sum, order) => sum + Number(order.amountInr), 0);
  const disputes = orders.filter((order) => order.status === "DISPUTED").length;

  return (
    <>
      <PageHeader title="Merchant processing" sub="Release controlled INR pay-in and pay-out orders to enabled processing partners and reconcile every status change." />
      <Flash notice={query.notice} error={query.error} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active orders" value={active.length} tone={active.length ? "gold" : "default"} />
        <Stat label="Completed today" value={completedToday.length} tone="emerald" />
        <Stat label="Processed today" value={inr(volumeToday)} />
        <Stat label="Open disputes" value={disputes} tone={disputes ? "gold" : "default"} />
      </div>

      {enabledPartners === 0 ? <div className="mb-5 rounded-xl border border-gold-500/25 bg-gold-500/[0.07] px-4 py-3 text-xs leading-relaxed text-gold-800">No partner is currently enabled for live processing. You may prepare orders, but assignment begins only after operations enables a verified trader with reserve and exposure capacity.</div> : null}

      <div className="mb-6 grid gap-5 xl:grid-cols-2">
        <details className="card overflow-hidden" open={!orders.length}>
          <summary className="cursor-pointer border-b border-black/[0.06] px-5 py-4"><span className="text-sm font-semibold text-slate-900">Create pay-in order</span><span className="mt-0.5 block text-[11px] text-slate-500">Collect INR through a trader-owned payment rail.</span></summary>
          <form action={createProcessingOrder} className="space-y-4 p-5">
            <input type="hidden" name="type" value="PAY_IN" />
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Merchant order ID"><input className="input" name="externalReference" maxLength={100} required placeholder="PI-2026-0001" /></Field><Field label="INR amount"><input className="input" name="amountInr" type="number" min="1" max="100000000" step="0.01" required /></Field></div>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Requested rail"><select className="input" name="requestedRail" defaultValue="UPI">{RAIL_OPTIONS.map((rail) => <option key={rail} value={rail}>{paymentRailLabel(rail)}</option>)}</select></Field><Field label="Queue expiry"><select className="input" name="expiryMinutes" defaultValue="30"><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">60 minutes</option><option value="120">2 hours</option></select></Field></div>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Payer name"><input className="input" name="payerName" maxLength={120} required /></Field><Field label="Player / payer reference"><input className="input" name="payerReference" maxLength={120} placeholder="Internal user ID" /></Field></div>
            <Field label="Trader instruction"><textarea className="input min-h-20" name="companyNote" maxLength={500} placeholder="Only information needed to reconcile this order" /></Field>
            <SubmitButton className="btn btn-gold w-full" pendingLabel="Releasing…">Release pay-in to queue</SubmitButton>
          </form>
        </details>

        <details className="card overflow-hidden" open={!orders.length}>
          <summary className="cursor-pointer border-b border-black/[0.06] px-5 py-4"><span className="text-sm font-semibold text-slate-900">Create pay-out order</span><span className="mt-0.5 block text-[11px] text-slate-500">Assign an INR transfer to a verified trader.</span></summary>
          <form action={createProcessingOrder} className="space-y-4 p-5">
            <input type="hidden" name="type" value="PAY_OUT" />
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Merchant order ID"><input className="input" name="externalReference" maxLength={100} required placeholder="PO-2026-0001" /></Field><Field label="INR amount"><input className="input" name="amountInr" type="number" min="1" max="100000000" step="0.01" required /></Field></div>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Payout rail"><select className="input" name="requestedRail" defaultValue="UPI">{RAIL_OPTIONS.map((rail) => <option key={rail} value={rail}>{paymentRailLabel(rail)}</option>)}</select></Field><Field label="Queue expiry"><select className="input" name="expiryMinutes" defaultValue="30"><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">60 minutes</option><option value="120">2 hours</option></select></Field></div>
            <Field label="Beneficiary name"><input className="input" name="beneficiaryName" maxLength={120} required /></Field>
            <Field label="Beneficiary UPI ID" hint="Required when payout rail is UPI."><input className="input" name="upiId" maxLength={120} placeholder="name@bank" /></Field>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Bank name"><input className="input" name="bankName" maxLength={120} /></Field><Field label="Account number"><input className="input" name="accountNumber" maxLength={40} /></Field></div>
            <Field label="IFSC" hint="Account number and IFSC are required for non-UPI payouts."><input className="input uppercase" name="ifsc" maxLength={20} /></Field>
            <Field label="Trader instruction"><textarea className="input min-h-20" name="companyNote" maxLength={500} placeholder="Only information needed to complete this payout" /></Field>
            <SubmitButton className="btn btn-gold w-full" pendingLabel="Releasing…">Release pay-out to queue</SubmitButton>
          </form>
        </details>
      </div>

      <section className="card mb-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-900">Order ledger</h2><p className="mt-0.5 text-[11px] text-slate-500">No silent changes: each order has its own immutable event history.</p></div><span className="chip border-black/[0.08] bg-black/[0.03] text-slate-600">{orders.length}</span></div>
        {orders.length ? <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Order</th><th>Merchant ref</th><th>Flow</th><th>Amount</th><th>Rail</th><th>Partner</th><th>Status</th><th>Next state</th><th></th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td className="font-mono text-xs font-semibold text-gold-700">{order.reference}</td><td className="text-xs">{order.externalReference}</td><td>{processingTypeLabel(order.type)}</td><td className="font-semibold tabular-nums">{inr(order.amountInr)}</td><td>{paymentRailLabel(order.requestedRail)}</td><td>{order.partner?.displayName ?? "Queue"}</td><td><StatusBadge status={order.status} /></td><td className="max-w-[260px] text-xs text-slate-500">{processingStatusHint(order.type, order.status)}</td><td><Link href={`/company/processing/${order.id}`} className="text-xs font-semibold text-gold-700 hover:underline">Open →</Link></td></tr>)}</tbody></table></div> : <div className="p-5"><EmptyState title="No processing orders" body="Create a pay-in or pay-out above when you have a real merchant instruction ready for processing." /></div>}
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-black/[0.06] px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Settlement ledger</h2><p className="mt-0.5 text-[11px] text-slate-500">Reconciliation batches created from completed orders only.</p></div>
        {settlements.length ? <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Settlement</th><th>Partner</th><th>Orders</th><th>Pay-in</th><th>Pay-out</th><th>Partner fee</th><th>Net position</th><th>Status</th><th>Reference</th></tr></thead><tbody>{settlements.map((item) => <tr key={item.id}><td className="font-mono text-xs font-semibold text-gold-700">{item.reference}</td><td>{item.partner.displayName}</td><td>{item._count.orders}</td><td>{inr(item.grossPayInInr)}</td><td>{inr(item.grossPayOutInr)}</td><td>{inr(item.partnerFeeInr)}</td><td className="font-semibold">{inr(item.netPositionInr)}</td><td><StatusBadge status={item.status} /></td><td className="font-mono text-xs">{item.transactionHash || "—"}</td></tr>)}</tbody></table></div> : <div className="p-5"><EmptyState title="No settlement batches" body="Operations creates a batch after completed orders are ready for reconciliation." /></div>}
      </section>
    </>
  );
}
