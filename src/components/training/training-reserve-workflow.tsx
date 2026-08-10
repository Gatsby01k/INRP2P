import type { PartnerDeposit } from "@prisma/client";
import Link from "next/link";
import { createTrainingReserveInstruction, submitTrainingReserveInstruction } from "@/app/actions/training";
import { SubmitButton } from "@/components/submit-button";
import { PageHeader, StatusBadge } from "@/components/ui";
import { Flash } from "@/components/workspace/flash";
import type { PartnerProgramLevel } from "@/lib/partner-program";

function usdt(value: { toString(): string } | null | undefined) {
  return Number(value?.toString() ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

export function TrainingReserveWorkflow({
  selectedLevel,
  deposits,
  notice,
  error,
}: {
  selectedLevel: PartnerProgramLevel;
  deposits: PartnerDeposit[];
  notice?: string;
  error?: string;
}) {
  const confirmed = deposits.filter((item) => item.status === "CONFIRMED");
  const reserve = confirmed.reduce((sum, item) => sum + Number((item.actualAmount ?? item.amount).toString()), 0);
  const current = deposits.find((item) => ["AWAITING_PAYMENT", "CONFIRMING"].includes(item.status)) ?? deposits[0] ?? null;
  const activated = reserve >= selectedLevel.activationReserveUsdt;

  return (
    <>
      <PageHeader
        title={activated ? "Reserve confirmed" : "Activate your demo desk"}
        sub="Walk through the reserve instruction and review states without a wallet, blockchain transaction or real funds."
        actions={<span className="chip border-sky-200 bg-sky-50 text-sky-700"><span className="h-1.5 w-1.5 rounded-full bg-sky-500" />Demo data</span>}
      />
      <Flash notice={notice} error={error} />

      <section className="mb-5 overflow-hidden rounded-2xl border border-[#07152e]/10 bg-[#07152e] text-white shadow-card">
        <div className="grid gap-6 px-5 py-6 sm:px-7 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-sky-300">Isolated demo ledger</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">{selectedLevel.name} · {selectedLevel.activationReserveUsdt.toLocaleString("en-US")} USDT</h2>
            <p className="mt-2 max-w-2xl text-xs leading-6 text-white/55">
              The account follows the same instruction, submission and operator-review states used by the product. The destination wallet is intentionally disabled.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10">
            <div className="bg-[#07152e] p-4"><p className="text-[9px] uppercase tracking-[0.12em] text-white/35">Recorded reserve</p><p className="mt-2 text-xl font-semibold tabular-nums">{reserve.toLocaleString("en-US")} <span className="text-[9px] text-white/40">USDT</span></p></div>
            <div className="bg-[#07152e] p-4"><p className="text-[9px] uppercase tracking-[0.12em] text-white/35">Commission plan</p><p className="mt-2 text-xl font-semibold text-emerald-300">{selectedLevel.commissionRate}%</p></div>
          </div>
        </div>
        <div className="grid gap-px border-t border-white/10 bg-white/10 sm:grid-cols-3">
          {[
            ["01", "Create instruction", "Record the exact demo amount."],
            ["02", "Submit reference", "Generate a non-financial demo reference."],
            ["03", "Operator confirms", "Demo Operations enables the order limit."],
          ].map(([step, title, body]) => (
            <div className="bg-[#07152e] px-5 py-4" key={step}><p className="font-mono text-[9px] text-sky-300">{step}</p><p className="mt-1 text-xs font-semibold">{title}</p><p className="mt-1 text-[9px] leading-4 text-white/40">{body}</p></div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <section className="card overflow-hidden">
          <div className="border-b border-black/[0.06] px-5 py-4 sm:px-6">
            <h2 className="text-sm font-semibold text-slate-900">Reserve instruction</h2>
            <p className="mt-1 text-[11px] text-slate-500">Every state is stored in the audit ledger, but no payment destination is created.</p>
          </div>
          <div className="p-5 sm:p-6">
            {!current ? (
              <form action={createTrainingReserveInstruction}>
                <input type="hidden" name="programLevel" value={selectedLevel.code} />
                <div className="rounded-xl border border-dashed border-black/[0.12] bg-black/[0.015] p-5">
                  <p className="text-xs font-semibold text-slate-900">Ready to create a demo instruction</p>
                  <p className="mt-1 text-[10px] leading-5 text-slate-500">The instruction records {selectedLevel.activationReserveUsdt.toLocaleString("en-US")} demo USDT and cannot receive funds.</p>
                  <SubmitButton className="btn btn-gold mt-4" pendingLabel="Creating…">Create reserve instruction →</SubmitButton>
                </div>
              </form>
            ) : (
              <div>
                <div className="flex flex-col gap-4 rounded-xl border border-black/[0.08] bg-[#fbfaf8] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[10px] font-semibold text-gold-700">{current.reference}</span><StatusBadge status={current.status} /></div>
                    <p className="mt-2 text-xl font-semibold tabular-nums text-slate-900">{usdt(current.actualAmount ?? current.amount)} <span className="text-[10px] text-slate-400">demo USDT</span></p>
                    <p className="mt-1 text-[9px] text-slate-400">DEMO LEDGER · no destination wallet</p>
                  </div>
                  {current.status === "AWAITING_PAYMENT" ? (
                    <form action={submitTrainingReserveInstruction}>
                      <input type="hidden" name="depositId" value={current.id} />
                      <SubmitButton className="btn btn-gold btn-sm" pendingLabel="Submitting…">Submit demo reference →</SubmitButton>
                    </form>
                  ) : current.status === "CONFIRMING" ? (
                    <div className="max-w-[230px] rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] leading-4 text-sky-700">Submission recorded. Load “Live shift” from Demo Operations to confirm the desk.</div>
                  ) : (
                    <Link href="/partner/processing" className="btn btn-gold btn-sm">Open orders →</Link>
                  )}
                </div>
                {current.reviewNote ? <p className="mt-3 text-[10px] leading-5 text-slate-500">{current.reviewNote}</p> : null}
              </div>
            )}
          </div>
        </section>

        <aside className="card h-fit p-5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-sky-700">Demo boundary</p>
          <ul className="mt-4 space-y-3 text-[10px] leading-5 text-slate-500">
            <li><strong className="text-slate-800">No wallet:</strong> there is nowhere to send tokens.</li>
            <li><strong className="text-slate-800">No blockchain:</strong> the reference is generated locally.</li>
            <li><strong className="text-slate-800">No live activation:</strong> only Demo Operations can enable this desk.</li>
          </ul>
        </aside>
      </div>
    </>
  );
}
