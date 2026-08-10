import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setTrainingScenario } from "@/app/actions/training";
import { SubmitButton } from "@/components/submit-button";
import { PageHeader, StatusBadge } from "@/components/ui";
import { Flash } from "@/components/workspace/flash";
import { inr } from "@/lib/processing";
import { isTrainingModeEnabled, TRAINING_SCENARIOS, trainingScenario } from "@/lib/training";
import { getTrainingWorkspaceSummary } from "@/lib/training-workspace";

export const metadata: Metadata = { title: "Training Studio" };
export const dynamic = "force-dynamic";

export default async function TrainingStudioPage({
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
        title="Training Studio"
        sub="Prepare one deterministic trader journey for product walkthroughs, onboarding training and screen recording."
        actions={<span className="chip border-sky-200 bg-sky-50 text-sky-700"><span className="h-1.5 w-1.5 rounded-full bg-sky-500" />Isolated simulation</span>}
      />
      <Flash notice={flash.notice} error={flash.error} />

      <section className="mb-5 overflow-hidden rounded-2xl border border-[#07152e]/10 bg-[#07152e] text-white shadow-card">
        <div className="grid gap-7 px-5 py-6 sm:px-7 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)] lg:items-center">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-sky-300">Deterministic product simulation</p>
            <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">One account. Five controlled states. Zero live financial impact.</h2>
            <p className="mt-3 max-w-2xl text-xs leading-6 text-white/55">Each scenario rebuilds verification, reserve, rails, orders, events, settlement and commission from the same source records. It does not generate public traction or contact external payment systems.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.055] p-4">
            <p className="text-[9px] uppercase tracking-[0.12em] text-white/35">Video trader login</p>
            <p className="mt-2 break-all font-mono text-xs font-semibold text-white">{summary.email}</p>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
              <span className="text-[9px] text-white/40">Password from environment</span>
              <span className={summary.passwordReady ? "text-[9px] font-semibold text-emerald-300" : "text-[9px] font-semibold text-rose-300"}>{summary.passwordReady ? "Configured" : "Missing"}</span>
            </div>
          </div>
        </div>
        <div className="grid gap-px border-t border-white/10 bg-white/10 sm:grid-cols-3">
          <div className="bg-[#07152e] px-5 py-4"><p className="text-[8px] uppercase tracking-[0.12em] text-white/35">Current state</p><p className="mt-1 text-sm font-semibold">{current?.label ?? "Not initialized"}</p></div>
          <div className="bg-[#07152e] px-5 py-4"><p className="text-[8px] uppercase tracking-[0.12em] text-white/35">External money</p><p className="mt-1 text-sm font-semibold text-emerald-300">Disabled</p></div>
          <div className="bg-[#07152e] px-5 py-4"><p className="text-[8px] uppercase tracking-[0.12em] text-white/35">Scenario engine</p><p className="mt-1 text-sm font-semibold">Rule-based · no AI</p></div>
        </div>
      </section>

      <section className="card mb-5 overflow-hidden">
        <div className="border-b border-black/[0.06] px-5 py-4 sm:px-6">
          <h2 className="text-sm font-semibold text-slate-900">Recording scenarios</h2>
          <p className="mt-1 text-[11px] text-slate-500">Applying a scenario resets only the reserved training identities. Live companies and partners are never selected.</p>
        </div>
        <div className="grid gap-px bg-black/[0.06] lg:grid-cols-5">
          {TRAINING_SCENARIOS.map((scenario) => {
            const active = summary.scenario === scenario.code;
            return (
              <article key={scenario.code} className={active ? "flex min-h-[210px] flex-col bg-[#fffaf0] p-5 shadow-[inset_0_3px_0_#ef9412]" : "flex min-h-[210px] flex-col bg-white p-5"}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[9px] font-semibold text-gold-700">{scenario.step}</span>
                  {active ? <span className="rounded-full bg-gold-500/10 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-gold-700">Current</span> : null}
                </div>
                <h3 className="mt-4 text-sm font-semibold text-slate-900">{scenario.label}</h3>
                <p className="mt-2 text-[10px] leading-5 text-slate-500">{scenario.description}</p>
                <form action={setTrainingScenario} className="mt-auto pt-5">
                  <input type="hidden" name="scenario" value={scenario.code} />
                  <SubmitButton className={active ? "btn btn-ghost btn-sm w-full" : "btn btn-gold btn-sm w-full"} pendingLabel="Preparing…" disabled={!summary.passwordReady}>
                    {active ? "Reset this state" : `Prepare ${scenario.step}`}
                  </SubmitButton>
                </form>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <div className="partner-stat"><span>Verification</span><strong>{summary.verificationStatus ? <StatusBadge status={summary.verificationStatus} /> : "—"}</strong><small>Training case only</small></div>
        <div className="partner-stat"><span>Reserve</span><strong>{summary.reserveUsdt.toLocaleString("en-US")} USDT</strong><small>Simulated ledger</small></div>
        <div className="partner-stat"><span>Queue</span><strong>{summary.queueOrders}</strong><small>Available orders</small></div>
        <div className="partner-stat"><span>In progress</span><strong>{summary.activeOrders}</strong><small>Needs trader action</small></div>
        <div className="partner-stat"><span>Completed</span><strong>{summary.completedOrders}</strong><small>{inr(summary.completedVolumeInr)} processed</small></div>
        <div className="partner-stat"><span>Commission</span><strong>{inr(summary.commissionInr)}</strong><small>Calculated from completed orders</small></div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-slate-900">Recommended recording sequence</h2>
          <ol className="mt-5 grid gap-4 sm:grid-cols-2">
            {[
              ["01", "Application", "Prepare New trader and record the first workspace entry."],
              ["02", "Review", "Move to Verification and show the mixed check states."],
              ["03", "Reserve", "Open the partner account, create the instruction and simulate submission."],
              ["04", "First order", "Prepare Order desk ready, take one eligible order and open its timeline."],
              ["05", "Daily work", "Prepare Established desk and complete the order waiting for receipt confirmation."],
              ["06", "Performance", "Show the commission ledger, recent orders and settlement history."],
            ].map(([step, title, body]) => (
              <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-3" key={step}><span className="flex h-7 w-7 items-center justify-center rounded-full border border-gold-500/25 bg-gold-500/[0.07] font-mono text-[9px] font-semibold text-gold-700">{step}</span><div><p className="text-xs font-semibold text-slate-800">{title}</p><p className="mt-1 text-[10px] leading-5 text-slate-500">{body}</p></div></li>
            ))}
          </ol>
        </section>
        <aside className="card h-fit p-5 sm:p-6">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-sky-700">Non-negotiable boundary</p>
          <ul className="mt-4 space-y-3 text-[10px] leading-5 text-slate-500">
            <li>Use a separate staging database and deployment.</li>
            <li>Keep the Training Mode banner visible in published walkthroughs.</li>
            <li>Never enter production bank, wallet or customer details.</li>
            <li>Describe commission as simulated product output, not historical trader income.</li>
            <li>Reset the scenario before every recording session.</li>
          </ul>
        </aside>
      </div>
    </>
  );
}
