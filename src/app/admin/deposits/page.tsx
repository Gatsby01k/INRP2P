import type { Metadata } from "next";
import Link from "next/link";
import type { DepositStatus, Prisma } from "@prisma/client";
import { reviewPartnerDeposit } from "@/app/actions/deposits";
import { SubmitButton } from "@/components/submit-button";
import { EmptyState, Field, PageHeader, SectionTitle, Stat, StatusBadge } from "@/components/ui";
import { Flash } from "@/components/workspace/flash";
import { tronAddressUrl, tronTransactionUrl } from "@/lib/deposit-wallet";
import { ensurePartnerDepositLedger } from "@/lib/deposit-ledger";
import { db } from "@/lib/db";
import { logError } from "@/lib/error-log";
import { cn, fmtDateTime, statusLabel } from "@/lib/format";

export const metadata: Metadata = { title: "USDT deposits" };
export const dynamic = "force-dynamic";
export const revalidate = 0;
type DepositWithPartner = Prisma.PartnerDepositGetPayload<{ include: { partner: true } }>;

const STATUSES = ["AWAITING_PAYMENT", "CONFIRMING", "CONFIRMED", "REJECTED", "REFUNDED", "EXPIRED"] as const;

function number(value: { toString(): string } | null | undefined) {
  return Number(value?.toString() ?? 0);
}

function usdt(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

export default async function AdminDepositsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; notice?: string; error?: string }>;
}) {
  const query = await searchParams;
  const status = (STATUSES as readonly string[]).includes(query.status ?? "") ? query.status as DepositStatus : undefined;
  const where: Prisma.PartnerDepositWhereInput = {
    provider: { not: "TRAINING_SIMULATOR" },
    ...(status ? { status } : {}),
    ...(query.q ? { OR: [
      { reference: { contains: query.q, mode: "insensitive" } },
      { providerInvoiceId: { contains: query.q, mode: "insensitive" } },
      { transactionHash: { contains: query.q, mode: "insensitive" } },
      { destinationAddress: { contains: query.q, mode: "insensitive" } },
      { partner: { displayName: { contains: query.q, mode: "insensitive" } } },
      { partner: { reference: { contains: query.q, mode: "insensitive" } } },
    ] } : {}),
  };
  let deposits: DepositWithPartner[] = [];
  let allConfirmed: Array<{ amount: Prisma.Decimal; actualAmount: Prisma.Decimal | null }> = [];
  let pendingCount = 0;
  let ledgerUnavailable = false;
  try {
    await ensurePartnerDepositLedger();
    [deposits, allConfirmed, pendingCount] = await Promise.all([
      db.partnerDeposit.findMany({ where, include: { partner: true }, orderBy: { createdAt: "desc" }, take: 200 }),
      db.partnerDeposit.findMany({ where: { status: "CONFIRMED", provider: { not: "TRAINING_SIMULATOR" } }, select: { amount: true, actualAmount: true } }),
      db.partnerDeposit.count({ where: { status: { in: ["AWAITING_PAYMENT", "CONFIRMING"] }, provider: { not: "TRAINING_SIMULATOR" } } }),
    ]);
  } catch (error) {
    ledgerUnavailable = true;
    await logError({ error, source: "page:/admin/deposits", severity: "FATAL", url: "/admin/deposits" });
  }
  const heldReserve = allConfirmed.reduce((sum, item) => sum + number(item.actualAmount ?? item.amount), 0);

  return (
    <>
      <PageHeader title="USDT deposits" sub="Company-wallet transfers, partner-submitted TXIDs, operator confirmation and refunds." />
      <Flash notice={query.notice} error={query.error} />
      {ledgerUnavailable ? <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Deposit ledger unavailable. The real database error has been captured in Errors and Vercel logs.</div> : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Confirmed reserve" value={`${usdt(heldReserve)} USDT`} tone="emerald" />
        <Stat label="Awaiting confirmation" value={pendingCount} tone="gold" />
        <Stat label="Ledger entries" value={deposits.length} sub={status || query.q ? "Current filtered view" : "Latest 200"} />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href="/admin/deposits" className={cn("pill", !status && "pill-active")}>All</Link>
        {STATUSES.map((item) => <Link key={item} href={`/admin/deposits?status=${item}`} className={cn("pill", status === item && "pill-active")}>{statusLabel(item)}</Link>)}
        <form action="/admin/deposits" className="mt-1 flex w-full gap-2 sm:ml-auto sm:mt-0 sm:w-auto">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <input className="input h-10 w-full py-0 sm:h-9 sm:w-72" name="q" defaultValue={query.q ?? ""} placeholder="Search partner, deposit or TXID…" />
        </form>
      </div>

      {deposits.length ? <div className="space-y-4">
        {deposits.map((item) => {
          const displayedAmount = number(item.actualAmount ?? item.amount);
          const pending = ["AWAITING_PAYMENT", "CONFIRMING", "EXPIRED"].includes(item.status);
          return (
            <article key={item.id} className="card overflow-hidden">
              <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(240px,.8fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-gold-700">{item.reference}</span>
                    <StatusBadge status={item.status} />
                    <span className="text-[10px] uppercase tracking-[0.1em] text-slate-400">USDT · {item.network}</span>
                  </div>
                  <Link href={`/admin/partners/${item.partnerId}`} className="mt-2 block w-fit text-base font-semibold text-slate-900 hover:text-gold-700">{item.partner.displayName}</Link>
                  <p className="mt-1 text-xs text-slate-500">{item.partner.reference} · created {fmtDateTime(item.createdAt)}</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums text-slate-900">{usdt(displayedAmount)} <span className="text-sm text-slate-400">USDT</span></p>
                  <p className="mt-1 break-all text-[11px] text-slate-400">{item.submittedAt ? `TX submitted ${fmtDateTime(item.submittedAt)}` : "Waiting for partner transfer"}</p>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {item.destinationAddress ? <a className="btn btn-ghost btn-sm" href={tronAddressUrl(item.destinationAddress)} target="_blank" rel="noreferrer">Company wallet</a> : null}
                  {item.transactionHash ? <a className="btn btn-ghost btn-sm" href={tronTransactionUrl(item.transactionHash)} target="_blank" rel="noreferrer">Verify TXID</a> : null}
                  <details className="group relative w-full lg:w-auto">
                    <summary className="btn btn-ghost btn-sm cursor-pointer list-none">Operator action</summary>
                    <div className="mt-3 rounded-xl border border-black/[0.08] bg-[#FBF8F2] p-4 lg:absolute lg:right-0 lg:z-20 lg:w-[440px] lg:shadow-xl">
                      {item.status === "CONFIRMING" ? <form action={reviewPartnerDeposit} className="space-y-3">
                        <input type="hidden" name="depositId" value={item.id} />
                        <SectionTitle title="Verify on-chain transfer" />
                        <p className="text-[11px] leading-relaxed text-slate-500">Before confirming, open the TXID and verify: successful USDT token transfer, TRC20 network, exact destination wallet, received amount and sufficient confirmations.</p>
                        <div className="rounded-lg border border-black/[0.06] bg-white/80 p-3 text-[11px] leading-relaxed text-slate-500">
                          <p><strong className="text-slate-700">TXID:</strong> <span className="break-all font-mono">{item.transactionHash}</span></p>
                          <p className="mt-1"><strong className="text-slate-700">Destination:</strong> <span className="break-all font-mono">{item.destinationAddress}</span></p>
                        </div>
                        <Field label="Actually received"><input className="input h-10" name="actualAmount" type="number" min="10" max="1000000" step="0.000001" defaultValue={item.amount.toString()} required /></Field>
                        <Field label="Operator note"><textarea className="input min-h-20" name="note" placeholder="What you verified on-chain" required /></Field>
                        <div className="grid grid-cols-2 gap-2">
                          <SubmitButton className="btn btn-gold btn-sm" name="decision" value="confirm" pendingLabel="Saving…">Confirm manually</SubmitButton>
                          <SubmitButton className="btn btn-ghost btn-sm" name="decision" value="reject" pendingLabel="Saving…">Reject</SubmitButton>
                        </div>
                      </form> : pending ? <form action={reviewPartnerDeposit} className="space-y-3">
                        <input type="hidden" name="depositId" value={item.id} />
                        <SectionTitle title="No TXID submitted" />
                        <p className="text-[11px] leading-relaxed text-slate-500">This intent cannot be confirmed until the partner submits a transaction hash.</p>
                        <Field label="Rejection note"><textarea className="input min-h-20" name="note" placeholder="Reason for closing this instruction" required /></Field>
                        <SubmitButton className="btn btn-ghost btn-sm w-full" name="decision" value="reject" pendingLabel="Closing…">Reject instruction</SubmitButton>
                      </form> : item.status === "CONFIRMED" ? <form action={reviewPartnerDeposit} className="space-y-3">
                        <input type="hidden" name="depositId" value={item.id} />
                        <SectionTitle title="Record full refund" />
                        <p className="text-[11px] leading-relaxed text-slate-500">Send the refund outside this application, verify it on-chain, then record the immutable TXID here.</p>
                        <Field label="Refund transaction hash"><input className="input h-10 font-mono text-xs" name="refundTransactionHash" placeholder="64-character TXID" /></Field>
                        <Field label="Refund note"><textarea className="input min-h-20" name="note" placeholder="Reason and recipient verification" required /></Field>
                        <SubmitButton className="btn btn-ghost btn-sm w-full" name="decision" value="refund" pendingLabel="Recording…">Mark fully refunded</SubmitButton>
                      </form> : <div><SectionTitle title="Final ledger entry" /><p className="text-xs leading-relaxed text-slate-500">No further action is available for this status.</p></div>}
                    </div>
                  </details>
                </div>
              </div>
              {item.reviewNote ? <div className="border-t border-black/[0.06] bg-black/[0.015] px-4 py-3 text-xs leading-relaxed text-slate-500 sm:px-5"><strong className="text-slate-700">Operator note:</strong> {item.reviewNote}</div> : null}
            </article>
          );
        })}
      </div> : <div className="card p-5"><EmptyState title="No deposits found" body={status || query.q ? "Clear the filters or search for another partner." : "Partner reserve instructions will appear here as soon as they are created."} /></div>}
    </>
  );
}
