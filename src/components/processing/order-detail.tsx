import type { Prisma } from "@prisma/client";
import {
  cancelProcessingOrder,
  companyConfirmPayout,
  companyMarkPayInPaid,
  partnerConfirmPayIn,
  partnerSubmitPayout,
  raiseProcessingDispute,
  releaseProcessingOrder,
  resolveProcessingDispute,
} from "@/app/actions/processing";
import { SubmitButton } from "@/components/submit-button";
import { BackLink, Field, KV, PageHeader, SectionTitle, StatusBadge } from "@/components/ui";
import { Flash } from "@/components/workspace/flash";
import { decryptProcessingData, type ProcessingPaymentData } from "@/lib/processing-data";
import { bpsLabel, inr, paymentRailLabel, processingStatusHint, processingSteps, processingTypeLabel } from "@/lib/processing";
import { cn, fmtDateTime, statusLabel } from "@/lib/format";

export type ProcessingOrderDetail = Prisma.ProcessingOrderGetPayload<{
  include: { company: true; partner: true; rail: true; settlement: true; events: true };
}>;

function reveal(ciphertext: string | null | undefined): ProcessingPaymentData | null {
  if (!ciphertext) return null;
  try {
    return decryptProcessingData(ciphertext);
  } catch {
    return null;
  }
}

function SensitiveData({ data }: { data: ProcessingPaymentData | null }) {
  if (!data) return <p className="text-xs text-rose-600">Secure details are unavailable. Check the processing encryption key.</p>;
  const rows = [
    ["Account holder", data.accountHolder],
    ["Payer name", data.payerName],
    ["Payer reference", data.payerReference],
    ["Beneficiary", data.beneficiaryName],
    ["UPI ID", data.upiId],
    ["Bank", data.bankName],
    ["Account number", data.accountNumber],
    ["IFSC", data.ifsc],
  ].filter((row): row is [string, string] => Boolean(row[1]));
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {rows.map(([label, value]) => <KV key={label} label={label}><span className="select-all font-medium">{value}</span></KV>)}
    </dl>
  );
}

function OrderProgress({ order }: { order: ProcessingOrderDetail }) {
  const steps: readonly string[] = processingSteps(order.type);
  const current = steps.indexOf(order.status);
  return (
    <div className="grid grid-cols-4 overflow-hidden rounded-xl border border-black/[0.07] bg-white">
      {steps.map((step, index) => (
        <div key={step} className={cn("relative px-2 py-3 text-center", index > 0 && "border-l border-black/[0.06]", index <= current && order.status !== "DISPUTED" && "bg-leaf-50/60")}>
          <span className={cn("mx-auto block h-1.5 w-1.5 rounded-full", index <= current && order.status !== "DISPUTED" ? "bg-leaf-500" : "bg-slate-300")} />
          <span className="mt-1.5 block text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">{statusLabel(step)}</span>
        </div>
      ))}
    </div>
  );
}

function ProcessingActions({ order, viewer }: { order: ProcessingOrderDetail; viewer: "admin" | "company" | "partner" }) {
  const active = ["ASSIGNED", "PAYMENT_MARKED", "PAYOUT_SENT"].includes(order.status);
  return (
    <div className="space-y-4">
      {viewer === "company" && order.type === "PAY_IN" && order.status === "ASSIGNED" ? (
        <form action={companyMarkPayInPaid} className="space-y-3">
          <input type="hidden" name="orderId" value={order.id} />
          <SectionTitle title="Payer transfer sent" />
          <Field label="UTR / payment reference" hint="Enter the reference exactly as shown by the bank or UPI app."><input className="input" name="paymentReference" maxLength={120} required /></Field>
          <SubmitButton className="btn btn-gold w-full" pendingLabel="Recording…">Mark payment sent</SubmitButton>
        </form>
      ) : null}

      {viewer === "partner" && order.type === "PAY_IN" && order.status === "PAYMENT_MARKED" ? (
        <form action={partnerConfirmPayIn} className="space-y-3">
          <input type="hidden" name="orderId" value={order.id} />
          <SectionTitle title="Confirm bank receipt" />
          <p className="text-xs leading-relaxed text-slate-500">Confirm only after the exact amount is visible in your bank or UPI account. A screenshot or payer message alone is not enough.</p>
          <Field label="Reconciliation note"><textarea className="input min-h-20" name="note" maxLength={500} placeholder="Optional bank ledger note" /></Field>
          <SubmitButton className="btn btn-gold w-full" pendingLabel="Confirming…">Confirm INR received</SubmitButton>
        </form>
      ) : null}

      {viewer === "partner" && order.type === "PAY_OUT" && order.status === "ASSIGNED" ? (
        <form action={partnerSubmitPayout} className="space-y-3">
          <input type="hidden" name="orderId" value={order.id} />
          <SectionTitle title="Record payout" />
          <Field label="UTR / payment reference" hint="Required before the payout can move to merchant confirmation."><input className="input" name="paymentReference" maxLength={120} required /></Field>
          <Field label="Transfer note"><textarea className="input min-h-20" name="note" maxLength={500} placeholder="Bank, rail or reconciliation context" /></Field>
          <SubmitButton className="btn btn-gold w-full" pendingLabel="Recording…">Payout sent</SubmitButton>
        </form>
      ) : null}

      {viewer === "company" && order.type === "PAY_OUT" && order.status === "PAYOUT_SENT" ? (
        <form action={companyConfirmPayout} className="space-y-3">
          <input type="hidden" name="orderId" value={order.id} />
          <SectionTitle title="Confirm beneficiary receipt" />
          <p className="text-xs leading-relaxed text-slate-500">Check the recorded UTR and your beneficiary confirmation before closing the order.</p>
          <Field label="Confirmation note"><textarea className="input min-h-20" name="note" maxLength={500} placeholder="Optional reconciliation note" /></Field>
          <SubmitButton className="btn btn-gold w-full" pendingLabel="Confirming…">Confirm payout received</SubmitButton>
        </form>
      ) : null}

      {viewer === "partner" && order.status === "ASSIGNED" ? (
        <form action={releaseProcessingOrder} className="border-t border-black/[0.07] pt-4">
          <input type="hidden" name="orderId" value={order.id} />
          <SubmitButton className="btn btn-ghost btn-sm w-full" pendingLabel="Releasing…">Release untouched order</SubmitButton>
        </form>
      ) : null}

      {viewer === "company" && order.status === "AVAILABLE" ? (
        <form action={cancelProcessingOrder} className="border-t border-black/[0.07] pt-4">
          <input type="hidden" name="orderId" value={order.id} />
          <SubmitButton className="btn btn-ghost btn-sm w-full" pendingLabel="Cancelling…">Cancel unassigned order</SubmitButton>
        </form>
      ) : null}

      {(viewer === "company" || viewer === "partner") && active ? (
        <details className="border-t border-black/[0.07] pt-4">
          <summary className="cursor-pointer text-xs font-semibold text-rose-600">Open a dispute</summary>
          <form action={raiseProcessingDispute} className="mt-3 space-y-3">
            <input type="hidden" name="orderId" value={order.id} />
            <input type="hidden" name="side" value={viewer} />
            <Field label="What does not match?"><textarea className="input min-h-24" name="reason" minLength={10} maxLength={1000} required /></Field>
            <SubmitButton className="btn btn-ghost btn-sm w-full" pendingLabel="Opening…">Open dispute and lock exposure</SubmitButton>
          </form>
        </details>
      ) : null}

      {viewer === "admin" && order.status === "DISPUTED" ? (
        <form action={resolveProcessingDispute} className="space-y-3">
          <input type="hidden" name="orderId" value={order.id} />
          <SectionTitle title="Operator resolution" />
          <Field label="Evidence and decision note"><textarea className="input min-h-28" name="note" minLength={10} maxLength={1500} required /></Field>
          <div className="grid grid-cols-2 gap-2">
            <SubmitButton className="btn btn-gold btn-sm" name="resolution" value="COMPLETED" pendingLabel="Resolving…">Resolve completed</SubmitButton>
            <SubmitButton className="btn btn-ghost btn-sm" name="resolution" value="FAILED" pendingLabel="Resolving…">Resolve failed</SubmitButton>
          </div>
        </form>
      ) : null}

      {!((viewer === "company" && ((order.type === "PAY_IN" && order.status === "ASSIGNED") || (order.type === "PAY_OUT" && order.status === "PAYOUT_SENT") || order.status === "AVAILABLE" || active)) || (viewer === "partner" && ((order.type === "PAY_IN" && order.status === "PAYMENT_MARKED") || (order.type === "PAY_OUT" && order.status === "ASSIGNED") || order.status === "ASSIGNED" || active)) || (viewer === "admin" && order.status === "DISPUTED")) ? (
        <p className="text-xs leading-relaxed text-slate-500">No action is required from this workspace at the current stage.</p>
      ) : null}
    </div>
  );
}

export function OrderDetailView({
  order,
  viewer,
  notice,
  error,
}: {
  order: ProcessingOrderDetail;
  viewer: "admin" | "company" | "partner";
  notice?: string;
  error?: string;
}) {
  const customerData = reveal(order.encryptedPaymentData);
  const railData = reveal(order.rail?.encryptedDetails);
  const back = viewer === "admin" ? "/admin/processing" : viewer === "company" ? "/company/processing" : "/partner/processing";
  const currentStatusHint = processingStatusHint(order.type, order.status);

  return (
    <>
      <div className="mb-4"><BackLink href={back} label="Back to processing desk" /></div>
      <PageHeader
        title={order.reference}
        sub={`${processingTypeLabel(order.type)} · merchant ref ${order.externalReference}`}
        actions={<StatusBadge status={order.status} />}
      />
      <Flash notice={notice} error={error} />

      <div className="mb-5"><OrderProgress order={order} /></div>
      <div className={cn("mb-5 rounded-xl border px-4 py-3 text-xs leading-relaxed", order.status === "DISPUTED" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-sky-200 bg-sky-50 text-sky-700")}>
        {currentStatusHint}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <section className="card p-5 sm:p-6">
            <SectionTitle title="Order economics" />
            <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <KV label="Amount"><span className="text-xl font-semibold tabular-nums">{inr(order.amountInr)}</span></KV>
              <KV label="Flow">{processingTypeLabel(order.type)}</KV>
              <KV label="Requested rail">{paymentRailLabel(order.requestedRail)}</KV>
              <KV label="Partner fee">{bpsLabel(order.partnerFeeBps)} · {inr(order.partnerFeeInr)}</KV>
            </dl>
          </section>

          <section className="card p-5 sm:p-6">
            <SectionTitle title={order.type === "PAY_IN" ? "Payer data" : "Beneficiary data"} />
            <SensitiveData data={customerData} />
            {order.companyNote ? <p className="mt-4 rounded-lg bg-black/[0.025] px-3 py-2 text-xs leading-relaxed text-slate-600"><strong>Merchant note:</strong> {order.companyNote}</p> : null}
          </section>

          {order.type === "PAY_IN" ? (
            <section className="card p-5 sm:p-6">
              <SectionTitle title="Assigned collection rail" />
              {order.rail ? (
                <div>
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-gold-700">{order.rail.reference}</span>
                    <span className="chip border-black/[0.08] bg-black/[0.03] text-slate-600">{paymentRailLabel(order.rail.type)}</span>
                    <span className="text-xs text-slate-500">{order.rail.label}</span>
                  </div>
                  <SensitiveData data={railData} />
                </div>
              ) : <p className="text-xs text-slate-500">Payment destination appears after a trader takes the order.</p>}
            </section>
          ) : null}

          <section className="card p-5 sm:p-6">
            <SectionTitle title="Order history" />
            <div className="space-y-0">
              {[...order.events].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((event, index) => (
                <div key={event.id} className="grid grid-cols-[14px_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
                  <div className="relative flex justify-center"><span className="mt-1.5 h-2 w-2 rounded-full bg-gold-500" />{index < order.events.length - 1 ? <span className="absolute top-4 h-[calc(100%-8px)] w-px bg-black/[0.08]" /> : null}</div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><StatusBadge status={event.toStatus} /><span className="text-xs font-medium text-slate-700">{event.actorLabel}</span></div>
                    {event.note ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{event.note}</p> : null}
                    <p className="mt-1 text-[10px] text-slate-400">{fmtDateTime(event.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <section className="card p-5">
            <SectionTitle title="Next action" />
            <ProcessingActions order={order} viewer={viewer} />
          </section>
          <section className="card p-5">
            <SectionTitle title="Control record" />
            <dl className="space-y-4">
              <KV label="Merchant">{order.company.companyName}</KV>
              <KV label="Processing partner">{order.partner?.displayName ?? "Not assigned"}</KV>
              <KV label="Created">{fmtDateTime(order.createdAt)}</KV>
              <KV label="Order expiry">{fmtDateTime(order.expiresAt)}</KV>
              <KV label="Payment reference">{order.paymentReference ? <span className="select-all font-mono">{order.paymentReference}</span> : "Not recorded"}</KV>
              <KV label="Settlement">{order.settlement?.reference ?? "Not batched"}</KV>
            </dl>
          </section>
          {order.disputeReason ? <section className="rounded-xl border border-rose-200 bg-rose-50 p-5"><SectionTitle title="Dispute record" /><p className="text-xs leading-relaxed text-rose-700">{order.disputeReason}</p></section> : null}
        </aside>
      </div>
    </>
  );
}
