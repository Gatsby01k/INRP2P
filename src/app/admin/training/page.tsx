import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setTrainingScenario } from "@/app/actions/training";
import { SubmitButton } from "@/components/submit-button";
import { PageHeader, StatusBadge } from "@/components/ui";
import { Flash } from "@/components/workspace/flash";
import { inr } from "@/lib/processing";
import { isTrainingModeEnabled, TRAINING_SCENARIOS, trainingScenario } from "@/lib/training";
import { getTrainingWorkspaceSummary } from "@/lib/training-workspace";

export const metadata: Metadata = { title: "Demo Operations" };
export const dynamic = "force-dynamic";

const partnerLoginUrl = "https://inrp2p-training.vercel.app/login";

export default async function DemoOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  if (!isTrainingModeEnabled()) notFound();
  const [summary, flash] = await Promise.all([getTrainingWorkspaceSummary(), searchParams]);
  const current = summary.scenario ? trainingScenario(summary.scenario) : null;

  return (
    <>
      <PageHeader
        title="Demo Operations"
        sub="Load a realistic operating state into the isolated partner account, then refresh the partner window."
        actions={<span className="chip border-sky-200 bg-sky-50 text-sky-700"><span className="h-1.5 w-1.5 rounded-full bg-sky-500" />Isolated demo database</span>}
      />
      <Flash notice={flash.notice} error={flash.error} />

      <section className="mb-5 overflow-hidden rounded-2xl border border-[#07152e]/10 bg-[#07152e] text-white shadow-card">
        <div className="grid gap-px bg-white/10 lg:grid-cols-[minmax(0,1.25fr)_minmax(310px,.75fr)]">
          <div className="bg-[#07152e] px-5 py-6 sm:px-7 sm:py-7">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-sky-300">Demo account controller</p>
            <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Run the account like an INR processing desk.</h2>
            <p className="mt-3 max-w-2xl text-xs leading-6 text-white/55">
              Every state rebuilds the same demo partner with consistent verification, reserve, bank rails, orders, exceptions, commission and settlement records.
            </p>
            <div className="mt-6 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-3">
              <div className="bg-[#07152e] p-4"><p className="text-[8px] uppercase tracking-[0.12em] text-white/35">Current state</p><p className="mt-1 text-sm font-semibold">{current?.label ?? "Not initialized"}</p></div>
              <div className="bg-[#07152e] p-4"><p className="text-[8px] uppercase tracking-[0.12em] text-white/35">Partner result</p><p className="mt-1 text-sm font-semibold text-emerald-300">{current?.outcome ?? "—"}</p></div>
              <div className="bg-[#07152e] p-4"><p className="text-[8px] uppercase tracking-[0.12em] text-white/35">External money</p><p className="mt-1 text-sm font-semibold text-emerald-300">Disabled</p></div>
            </div>
          </div>

          <aside className="bg-[#0a1933] px-5 py-6 sm:px-6">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-gold-400">Open the partner view</p>
            <ol className="mt-4 space-y-4">
              {[
                ["01", "Keep this page open", "Use this browser for the admin controller."],
                ["02", "Open a private window", "Sign in with the demo partner account below."],
                ["03", "Load a state and refresh", "The partner window updates after every state change."],
              ].map(([step, title, body]) => (
                <li className="grid grid-cols-[24px_minmax(0,1fr)] gap-3" key={step}>
                  <span className="font-mono text-[9px] font-semibold text-gold-400">{step}</span>
                  <div><p className="text-xs font-semibold">{title}</p><p className="mt-1 text-[9px] leading-4 text-white/40">{body}</p></div>
                </li>
              ))}
            </ol>
            <div className="mt-5 border-t border-white/10 pt-4">
              <p className="text-[8px] uppercase tracking-[0.12em] text-white/35">Partner login</p>
              <p className="mt-1 break-all font-mono text-[10px] font-semibold">{summary.email}</p>
              <p className="mt-2 break-all text-[9px] text-white/40">{partnerLoginUrl}</p>
              <p className={summary.passwordReady ? "mt-3 text-[9px] font-semibold text-emerald-300" : "mt-3 text-[9px] font-semibold text-rose-300"}>{summary.passwordReady ? "Password configured" : "Password missing"}</p>
            </div>
          </aside>
        </div>
      </section>

      <section className="card mb-5 overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black/[0.06] px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Choose the partner state</h2>
            <p className="mt-1 text-[11px] text-slate-500">Loading a state changes only the reserved demo identities. Refresh the partner window when it finishes.</p>
          </div>
          <span className="text-[9px] font-medium text-slate-400">Same login · consistent data · repeatable result</span>
        </div>
        <div className="grid gap-px bg-black/[0.06] lg:grid-cols-5">
          {TRAINING_SCENARIOS.map((scenario) => {
            const active = summary.scenario === scenario.code;
            return (
              <article key={scenario.code} className={active ? "flex min-h-[250px] flex-col bg-[#fffaf0] p-5 shadow-[inset_0_3px_0_#ef9412]" : "flex min-h-[250px] flex-col bg-white p-5"}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[9px] font-semibold text-gold-700">{scenario.step}</span>
                  {active ? <span className="rounded-full bg-gold-500/10 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-gold-700">Loaded</span> : null}
                </div>
                <h3 className="mt-4 text-sm font-semibold text-slate-900">{scenario.label}</h3>
                <p className="mt-2 text-[10px] leading-5 text-slate-500">{scenario.description}</p>
                <div className="mt-4 border-t border-black/[0.06] pt-3">
                  <p className="text-sm font-semibold tabular-nums text-slate-900">{scenario.outcome}</p>
                  <p className="mt-1 text-[9px] text-slate-400">{scenario.detail}</p>
                </div>
                <form action={setTrainingScenario} className="mt-auto pt-5">
                  <input type="hidden" name="scenario" value={scenario.code} />
                  <SubmitButton className={active ? "btn btn-ghost btn-sm w-full" : "btn btn-gold btn-sm w-full"} pendingLabel="Loading…" disabled={!summary.passwordReady}>
                    {active ? "Reload state" : "Load state"}
                  </SubmitButton>
                </form>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <div className="partner-stat"><span>Verification</span><strong>{summary.verificationStatus ? <StatusBadge status={summary.verificationStatus} /> : "—"}</strong><small>Partner account state</small></div>
        <div className="partner-stat"><span>Reserve</span><strong>{summary.reserveUsdt.toLocaleString("en-US")} USDT</strong><small>Demo ledger only</small></div>
        <div className="partner-stat"><span>Queue</span><strong>{summary.queueOrders}</strong><small>{inr(summary.queueVolumeInr)} eligible</small></div>
        <div className="partner-stat"><span>In progress</span><strong>{summary.activeOrders}</strong><small>{inr(summary.activeVolumeInr)} locked</small></div>
        <div className="partner-stat"><span>Completed</span><strong>{summary.completedOrders}</strong><small>{inr(summary.completedVolumeInr)} processed</small></div>
        <div className="partner-stat"><span>Commission</span><strong>{inr(summary.commissionInr)}</strong><small>Completed orders only</small></div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card overflow-hidden">
          <div className="border-b border-black/[0.06] px-5 py-4 sm:px-6">
            <h2 className="text-sm font-semibold text-slate-900">Current operating snapshot</h2>
            <p className="mt-1 text-[11px] text-slate-500">Figures are calculated from the orders currently loaded into the demo account.</p>
          </div>
          <div className="grid gap-px bg-black/[0.06] sm:grid-cols-2">
            <div className="bg-white p-5 sm:p-6">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">Today · IST</p>
              <p className="mt-3 text-2xl font-semibold tabular-nums text-slate-900">{inr(summary.todayVolumeInr)}</p>
              <p className="mt-1 text-[10px] text-slate-500">{summary.todayOrders} completed · {inr(summary.todayCommissionInr)} commission</p>
            </div>
            <div className="bg-white p-5 sm:p-6">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">Month to date</p>
              <p className="mt-3 text-2xl font-semibold tabular-nums text-slate-900">{inr(summary.completedVolumeInr)}</p>
              <p className="mt-1 text-[10px] text-slate-500">{summary.completedOrders} completed · {summary.exceptionOrders} exceptions</p>
            </div>
          </div>
          <div className="grid gap-px border-t border-black/[0.06] bg-black/[0.06] sm:grid-cols-3">
            <div className="bg-[#fbfaf8] p-4"><p className="text-[9px] text-slate-400">Pay-in completed</p><p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{inr(summary.payInVolumeInr)}</p></div>
            <div className="bg-[#fbfaf8] p-4"><p className="text-[9px] text-slate-400">Pay-out completed</p><p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{inr(summary.payOutVolumeInr)}</p></div>
            <div className="bg-[#fbfaf8] p-4"><p className="text-[9px] text-slate-400">Settlement position</p><p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{summary.settlementStatus ? inr(summary.settlementNetInr) : "—"}</p><p className="mt-0.5 text-[8px] text-slate-400">{summary.settlementStatus ?? "Not created"}</p></div>
          </div>
        </section>

        <aside className="card h-fit p-5 sm:p-6">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-sky-700">Demo boundary</p>
          <h2 className="mt-2 text-sm font-semibold text-slate-900">Real workflow. Simulated records.</h2>
          <ul className="mt-4 space-y-3 text-[10px] leading-5 text-slate-500">
            <li>Order amounts respect normal UPI, IMPS and RTGS transaction bands.</li>
            <li>Failed and cancelled orders are excluded from volume and commission.</li>
            <li>Bank details, UTRs, counterparties and reserve are demo-only records.</li>
            <li>No wallet, blockchain payment or customer instruction is created.</li>
            <li>Keep the Demo data banner visible in external walkthroughs.</li>
          </ul>
        </aside>
      </div>
    </>
  );
}
