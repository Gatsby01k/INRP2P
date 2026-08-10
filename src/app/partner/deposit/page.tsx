import type { Metadata } from "next";
import type { PartnerDeposit } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createPartnerDeposit, submitPartnerDepositTransaction } from "@/app/actions/deposits";
import { SubmitButton } from "@/components/submit-button";
import { Field, PageHeader, StatusBadge } from "@/components/ui";
import { CopyWalletAddress } from "@/components/workspace/copy-wallet-address";
import { Flash } from "@/components/workspace/flash";
import { requireRole } from "@/lib/auth";
import { companyUsdtTrc20Address, tronAddressUrl, tronTransactionUrl } from "@/lib/deposit-wallet";
import { ensurePartnerDepositLedger } from "@/lib/deposit-ledger";
import { db } from "@/lib/db";
import { logError } from "@/lib/error-log";
import { fmtDateTime } from "@/lib/format";
import { PARTNER_PROGRAM_LEVELS, partnerProgramLevel } from "@/lib/partner-program";

export const metadata: Metadata = { title: "Activate order desk" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

function amount(value: { toString(): string } | null | undefined) {
  return Number(value?.toString() ?? 0);
}

function usdt(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

function TransferAction({ item }: { item: PartnerDeposit }) {
  const canSubmit = ["AWAITING_PAYMENT", "CONFIRMING", "EXPIRED"].includes(item.status) && item.destinationAddress;
  if (!canSubmit) {
    return item.transactionHash ? (
      <a className="btn btn-ghost btn-sm" href={tronTransactionUrl(item.transactionHash)} target="_blank" rel="noreferrer">
        View transaction
      </a>
    ) : null;
  }

  return (
    <details className="group rounded-xl border border-[#07152e]/10 bg-[#fbf8f2]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-xs font-semibold text-[#07152e] marker:content-none">
        <span>{item.status === "CONFIRMING" ? "Submitted transfer" : item.status === "EXPIRED" ? "Report a late transfer" : "Open transfer instructions"}</span>
        <span className="text-base font-normal text-gold-700 transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="border-t border-[#07152e]/10 p-4">
        <div className="flex flex-col gap-3 rounded-xl border border-gold-500/20 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Official company wallet</p>
            <p className="mt-1 break-all font-mono text-[11px] font-semibold leading-relaxed text-slate-900">{item.destinationAddress}</p>
          </div>
          <CopyWalletAddress address={item.destinationAddress!} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-[#07152e] p-3 text-white">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/50">Send exactly</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">{usdt(amount(item.amount))} USDT</p>
          </div>
          <div className="rounded-xl border border-[#07152e]/10 bg-white p-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">Network</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">TRON · TRC20</p>
          </div>
        </div>
        <form action={submitPartnerDepositTransaction} className="mt-4 space-y-3">
          <input type="hidden" name="depositId" value={item.id} />
          <Field label="Transaction hash (TXID)" hint="Paste the 64-character TXID after your wallet broadcasts the transfer.">
            <input className="input font-mono text-xs" name="transactionHash" defaultValue={item.transactionHash ?? ""} placeholder="64-character TRON TXID" required />
          </Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <SubmitButton className="btn min-h-10 rounded-xl border border-[#07152e] bg-[#07152e] text-white hover:bg-[#10284c]" pendingLabel="Submitting…">
              {item.transactionHash ? "Update submitted TXID" : "Submit TXID for review"}
            </SubmitButton>
            <a className="btn btn-ghost min-h-10 rounded-xl" href={tronAddressUrl(item.destinationAddress!)} target="_blank" rel="noreferrer">
              Verify wallet on TRONSCAN
            </a>
          </div>
        </form>
      </div>
    </details>
  );
}

export default async function PartnerDepositPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string; plan?: string; order?: string }>;
}) {
  const [user, flash] = await Promise.all([requireRole("PARTNER"), searchParams]);
  if (!user.partner) redirect("/login");
  const selectedLevel = partnerProgramLevel(flash.plan ?? user.partner.programLevel);
  const sourceOrder = /^PX-(?:IN|OUT)-\d{4,8}$/.test(flash.order ?? "") ? flash.order : null;

  let deposits: PartnerDeposit[] = [];
  let ledgerUnavailable = false;
  try {
    await ensurePartnerDepositLedger();
    deposits = await db.partnerDeposit.findMany({ where: { partnerId: user.partner.id }, orderBy: { createdAt: "desc" } });
  } catch (error) {
    ledgerUnavailable = true;
    await logError({ error, source: "page:/partner/deposit", severity: "FATAL", userId: user.id, url: "/partner/deposit" });
  }

  const confirmed = deposits.filter((item) => item.status === "CONFIRMED");
  const reserve = confirmed.reduce((sum, item) => sum + amount(item.actualAmount ?? item.amount), 0);
  const awaiting = deposits.filter((item) => ["AWAITING_PAYMENT", "CONFIRMING"].includes(item.status));
  const walletAddress = companyUsdtTrc20Address();
  const requiredReserve = selectedLevel.activationReserveUsdt;
  const amountDue = Math.max(requiredReserve - reserve, 0);
  const activationComplete = amountDue <= 0;

  return (
    <>
      <PageHeader
        title={activationComplete ? "Operating reserve" : "Activate your order desk"}
        sub={activationComplete
          ? "Review your confirmed reserve and transfer history."
          : `Confirm the ${requiredReserve.toLocaleString("en-US")} USDT reserve required for ${selectedLevel.name}.`}
      />
      <Flash notice={flash.notice} error={flash.error} />

      {!activationComplete ? (
        <section className="mb-4 overflow-hidden rounded-2xl border border-[#07152e]/10 bg-white shadow-card">
          <div className="grid gap-5 bg-[#07152e] px-5 py-5 text-white sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-gold-400/25 bg-gold-400/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-gold-300">Step 1 · Reserve activation</span>
                {sourceOrder ? <span className="font-mono text-[10px] text-white/45">From sample order {sourceOrder}</span> : null}
              </div>
              <h2 className="mt-3 text-xl font-semibold tracking-[-0.025em]">Activate {selectedLevel.name}</h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-white/55">Transfer the exact amount due below. After the full reserve is confirmed, operations completes account review and assigns your live INR order limit.</p>
            </div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 lg:min-w-[310px]">
              <div className="bg-[#07152e] px-4 py-3"><p className="text-[9px] uppercase tracking-[0.12em] text-white/35">Reserve required</p><p className="mt-1 text-lg font-semibold">{requiredReserve.toLocaleString("en-US")} <span className="text-[9px] text-white/40">USDT</span></p></div>
              <div className="bg-[#07152e] px-4 py-3"><p className="text-[9px] uppercase tracking-[0.12em] text-white/35">Commission</p><p className="mt-1 text-lg font-semibold text-emerald-300">{selectedLevel.commissionRate}%</p></div>
            </div>
          </div>
          <div className="grid gap-px bg-black/[0.06] sm:grid-cols-4">
            {PARTNER_PROGRAM_LEVELS.map((level) => (
              <Link
                key={level.code}
                href={`/partner/deposit?plan=${level.code}${sourceOrder ? `&order=${sourceOrder}` : ""}`}
                className={`flex items-center justify-between gap-3 bg-white px-4 py-3 transition hover:bg-[#fbf8f2] ${level.code === selectedLevel.code ? "shadow-[inset_0_-2px_0_#efa12f]" : ""}`}
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-800">{level.name}</span>
                <span className="text-[10px] font-semibold tabular-nums text-slate-500">{level.activationReserveUsdt.toLocaleString("en-US")} USDT</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {ledgerUnavailable ? (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
          <p><strong>Reserve ledger is updating.</strong> Refresh this page in a moment. Do not transfer funds until your instruction is visible below.</p>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <section className="card overflow-hidden">
            <div className="bg-[#07152e] px-4 py-5 text-white sm:px-6 sm:py-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-400">Official company wallet</p>
                    <span className="rounded-full border border-white/15 bg-white/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/75">USDT</span>
                    <span className="rounded-full border border-white/15 bg-white/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/75">TRC20</span>
                  </div>
                  {walletAddress ? (
                    <p className="mt-3 break-all font-mono text-xs font-semibold leading-relaxed text-white sm:text-sm">{walletAddress}</p>
                  ) : (
                    <p className="mt-3 text-sm font-semibold text-rose-200">Wallet is not configured. Do not send funds.</p>
                  )}
                </div>
                {walletAddress ? <CopyWalletAddress address={walletAddress} /> : null}
              </div>
              <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4 text-[11px] leading-relaxed text-white/60 sm:flex-row sm:items-center sm:justify-between">
                <p>Match every character. Never use an address received in chat.</p>
                {walletAddress ? (
                  <a className="shrink-0 font-semibold text-gold-300 hover:text-gold-200" href={tronAddressUrl(walletAddress)} target="_blank" rel="noreferrer">
                    Verify on TRONSCAN ↗
                  </a>
                ) : null}
              </div>
            </div>

            <div className="p-4 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold-500/30 bg-gold-500/[0.08] font-mono text-[10px] font-semibold text-gold-700">01</span>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Create a transfer instruction</h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">We lock the exact amount and official wallet into a unique audit record before you pay.</p>
                </div>
              </div>
              <form action={createPartnerDeposit} className="mt-5">
                <input type="hidden" name="programLevel" value={selectedLevel.code} />
                {sourceOrder ? <input type="hidden" name="sourceOrder" value={sourceOrder} /> : null}
                <label className="lbl" htmlFor="deposit-amount">{activationComplete ? "Top-up amount" : `Exact amount due for ${selectedLevel.name}`}</label>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_230px] sm:items-stretch">
                  <div className="relative">
                    <input
                      id="deposit-amount"
                      className={`input h-12 pr-16 text-base tabular-nums ${activationComplete ? "" : "cursor-not-allowed bg-slate-50 font-semibold"}`}
                      name="amount"
                      type="number"
                      min="10"
                      max="1000000"
                      step="0.000001"
                      defaultValue={activationComplete ? 300 : amountDue}
                      readOnly={!activationComplete}
                      required
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">USDT</span>
                  </div>
                  <SubmitButton
                    className="btn h-12 w-full rounded-xl border border-[#07152e] bg-[#07152e] px-5 text-white shadow-[0_12px_24px_-16px_rgba(7,21,46,.75)] hover:-translate-y-px hover:bg-[#10284c]"
                    pendingLabel="Creating…"
                    disabled={!walletAddress}
                  >
                    {activationComplete ? "Create top-up instruction →" : `Deposit ${amountDue.toLocaleString("en-US")} USDT →`}
                  </SubmitButton>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">{activationComplete ? "Top-ups: 10–1,000,000 USDT." : `Fixed by your selected ${selectedLevel.name} level. Confirmed so far: ${usdt(reserve)} USDT.`}</p>
              </form>
              {!walletAddress ? (
                <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">Deposits are unavailable until the official company wallet is configured.</p>
              ) : null}
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-4 sm:px-6">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Deposit history</h2>
                <p className="mt-0.5 text-[11px] text-slate-400">Every instruction and operator decision stays recorded.</p>
              </div>
              <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-[10px] font-semibold tabular-nums text-slate-500">{deposits.length}</span>
            </div>
            {deposits.length ? (
              <div className="divide-y divide-black/[0.06]">
                {deposits.map((item) => (
                  <article key={item.id} className="p-4 sm:p-5">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[11px] font-semibold text-gold-700">{item.reference}</span>
                          <StatusBadge status={item.status} />
                        </div>
                        <p className="mt-2 text-lg font-semibold tabular-nums text-slate-900">{usdt(amount(item.actualAmount ?? item.amount))} <span className="text-xs text-slate-400">USDT</span></p>
                        <p className="mt-1 text-[11px] text-slate-400">TRON · TRC20 · {fmtDateTime(item.createdAt)}</p>
                      </div>
                      {item.transactionHash ? (
                        <a className="w-fit max-w-full truncate font-mono text-[10px] font-semibold text-gold-700 hover:text-gold-600" href={tronTransactionUrl(item.transactionHash)} target="_blank" rel="noreferrer" title={item.transactionHash}>
                          {item.transactionHash.slice(0, 10)}…{item.transactionHash.slice(-8)} ↗
                        </a>
                      ) : null}
                    </div>
                    <div className="mt-3"><TransferAction item={item} /></div>
                    {item.reviewNote ? <p className="mt-3 rounded-lg bg-black/[0.025] px-3 py-2 text-xs leading-relaxed text-slate-500"><strong className="text-slate-700">Operator note:</strong> {item.reviewNote}</p> : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-6 sm:px-6">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-500/[0.08] text-gold-700">↗</span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">No instructions yet</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">Create one only when you are ready to transfer the exact amount.</p>
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <section className="overflow-hidden rounded-2xl bg-[#07152e] text-white shadow-card">
            <div className="border-b border-white/10 p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-400">Reserve passport</p>
              <p className="mt-3 text-3xl font-semibold tabular-nums">{usdt(reserve)} <span className="text-sm text-white/35">/ {requiredReserve.toLocaleString("en-US")}</span></p>
              <p className="mt-1 text-xs text-white/50">Confirmed / required USDT · {selectedLevel.name}</p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, (reserve / requiredReserve) * 100)}%` }} /></div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-white/10">
              <div className="p-4">
                <p className="text-lg font-semibold tabular-nums">{awaiting.length}</p>
                <p className="mt-1 text-[10px] leading-relaxed text-white/45">Awaiting payment or review</p>
              </div>
              <div className="p-4">
                <p className="text-lg font-semibold">TRC20</p>
                <p className="mt-1 text-[10px] leading-relaxed text-white/45">Only supported network</p>
              </div>
            </div>
          </section>

          <section className="card p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-700">How it works</p>
            <ol className="mt-4 space-y-4 text-xs leading-relaxed text-slate-600">
              <li className="flex gap-3">
                <span className="w-7 shrink-0 whitespace-nowrap font-mono text-[10px] font-semibold text-gold-700">01</span>
                <span><strong className="block text-slate-900">Create the instruction</strong>Confirm the exact amount and official wallet before sending.</span>
              </li>
              <li className="flex gap-3">
                <span className="w-7 shrink-0 whitespace-nowrap font-mono text-[10px] font-semibold text-gold-700">02</span>
                <span><strong className="block text-slate-900">Transfer USDT on TRON</strong>Other tokens or networks may be unrecoverable.</span>
              </li>
              <li className="flex gap-3">
                <span className="w-7 shrink-0 whitespace-nowrap font-mono text-[10px] font-semibold text-gold-700">03</span>
                <span><strong className="block text-slate-900">Submit the TXID</strong>Operations verifies the token, destination, amount and confirmations.</span>
              </li>
            </ol>
          </section>

          <p className="px-1 text-[10px] leading-relaxed text-slate-400">
            For an agreed partner operating reserve only. Never use this flow for customer funds or an INR↔USDT settlement. A reserve does not guarantee traffic, income or verification.
          </p>
        </aside>
      </div>
    </>
  );
}
