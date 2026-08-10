"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { beginPartnerActivation } from "@/app/actions/deposits";
import { SubmitButton } from "@/components/submit-button";
import { inr } from "@/lib/processing";
import {
  PARTNER_PROGRAM_LEVELS,
  partnerOrderCommission,
  type PartnerProgramLevel,
} from "@/lib/partner-program";
import {
  PARTNER_PREVIEW_RAIL_NOTES,
  initialPartnerPreviewOrders,
  partnerPreviewCountdown,
  tickPartnerPreviewOrders,
  type PartnerPreviewOrder,
} from "@/lib/partner-order-preview";

const markerClass: Record<PartnerProgramLevel["marker"], string> = {
  emerald: "bg-emerald-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  slate: "bg-slate-950",
};

type ActivationState = "NOT_STARTED" | "AWAITING_PAYMENT" | "UNDER_REVIEW";

export function PartnerOrderPreview({
  selectedLevel,
  activationState,
  confirmedReserveUsdt,
}: {
  selectedLevel: PartnerProgramLevel;
  activationState: ActivationState;
  confirmedReserveUsdt: number;
}) {
  const [orders, setOrders] = useState<PartnerPreviewOrder[]>(initialPartnerPreviewOrders);
  const activationInProgress = activationState !== "NOT_STARTED";
  const requiredReserveUsdt = selectedLevel.activationReserveUsdt;
  const reserveProgress = Math.min(100, Math.round((confirmedReserveUsdt / requiredReserveUsdt) * 100));

  useEffect(() => {
    const interval = window.setInterval(() => {
      setOrders(tickPartnerPreviewOrders);
    }, 1_000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <>
      <section className="mb-5 overflow-hidden rounded-2xl border border-[#07152e]/10 bg-[#07152e] text-white shadow-[0_24px_60px_-36px_rgba(7,21,46,.8)]">
        <div className="grid gap-8 px-5 py-7 sm:px-7 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)] lg:items-end lg:px-9 lg:py-9">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-gold-400/25 bg-gold-400/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-gold-300">Order desk preview</span>
              <span className="text-[10px] font-medium text-white/45">
                {activationState === "UNDER_REVIEW"
                  ? "Reserve under review"
                  : activationState === "AWAITING_PAYMENT"
                    ? "Reserve instruction ready"
                    : "No reserve required to explore"}
              </span>
            </div>
            <h1 className="mt-4 max-w-2xl text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">See the work before you activate.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
              Review realistic INR pay-in and pay-out ticket structures, select your operating level and activate one clear path to live work.
            </p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/45">
              <span>Audited reserve ledger</span>
              <span>Official wallet only</span>
              <span>No customer data in preview</span>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${markerClass[selectedLevel.marker]}`} />
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">{selectedLevel.name}</p>
              </div>
              <Link href="#levels" className="text-[10px] font-semibold text-gold-300 hover:text-gold-200">Change level</Link>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div>
                <p className="text-[9px] uppercase tracking-[0.14em] text-white/40">Monthly base</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{selectedLevel.monthlyBaseUsdt.toLocaleString("en-US")} <span className="text-[10px] text-white/45">USDT</span></p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-[0.14em] text-white/40">Reserve</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-gold-300">{requiredReserveUsdt.toLocaleString("en-US")} <span className="text-[10px] text-white/45">USDT</span></p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-[0.14em] text-white/40">Commission</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-300">{selectedLevel.commissionRate}%</p>
              </div>
            </div>
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-[9px] font-medium text-white/45">
                <span>Confirmed reserve</span>
                <span className="tabular-nums">{confirmedReserveUsdt.toLocaleString("en-US")} / {requiredReserveUsdt.toLocaleString("en-US")} USDT</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gold-400 transition-[width] duration-500" style={{ width: `${reserveProgress}%` }} />
              </div>
            </div>
            <form action={beginPartnerActivation} className="mt-4">
              <input type="hidden" name="programLevel" value={selectedLevel.code} />
              <input type="hidden" name="sourceOrder" value={orders[0].reference} />
              <SubmitButton className="btn btn-gold btn-sm w-full justify-center" pendingLabel="Opening activation…">
                {activationInProgress
                  ? "Continue activation →"
                  : `Activate ${selectedLevel.name} · ${requiredReserveUsdt.toLocaleString("en-US")} USDT →`}
              </SubmitButton>
            </form>
          </div>
        </div>
        <div className="grid border-t border-white/10 sm:grid-cols-3 sm:divide-x sm:divide-white/10">
          <div className="px-5 py-4 sm:px-7"><p className="text-[9px] uppercase tracking-[0.14em] text-white/35">Typical monthly range</p><p className="mt-1 text-sm font-semibold">{selectedLevel.volumeRange}</p></div>
          <div className="border-t border-white/10 px-5 py-4 sm:border-t-0 sm:px-7"><p className="text-[9px] uppercase tracking-[0.14em] text-white/35">Commission potential</p><p className="mt-1 text-sm font-semibold">{selectedLevel.commissionPotential}</p></div>
          <div className="border-t border-white/10 px-5 py-4 sm:border-t-0 sm:px-7"><p className="text-[9px] uppercase tracking-[0.14em] text-white/35">Activation path</p><p className="mt-1 text-sm font-semibold">Reserve → review → live orders</p></div>
        </div>
      </section>

      <section id="preview-orders" className="card mb-5 scroll-mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] px-5 py-4 sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Order queue</h2>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-blue-700">Preview data</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Five rotating examples show the ticket, rail, response timer and estimated commission before activation.</p>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-medium text-slate-500"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500 motion-reduce:animate-none" /> Preview refresh running</div>
        </div>
        <div className="divide-y divide-black/[0.06]">
          {orders.map((order) => {
            const commission = partnerOrderCommission(order.amountInr, selectedLevel);
            return (
              <article
                key={`${order.slot}-${order.generation}`}
                className={`grid gap-4 px-5 py-4 transition-colors duration-500 hover:bg-[#fbf8f2] sm:px-6 lg:grid-cols-[minmax(0,1.25fr)_repeat(4,minmax(100px,.62fr))_150px] lg:items-center ${order.freshTicks > 0 ? "animate-reveal bg-emerald-50/40 motion-reduce:animate-none" : "bg-white"}`}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold text-gold-700">{order.reference}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${order.flow === "Pay-in" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>{order.flow}</span>
                    {order.freshTicks > 0 ? <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-white">New</span> : null}
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">{order.flow === "Pay-in" ? "Incoming customer payment" : "Outbound beneficiary payment"} · details protected</p>
                </div>
                <div><p className="text-[9px] uppercase tracking-[0.1em] text-slate-400">Ticket</p><p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{inr(order.amountInr)}</p></div>
                <div><p className="text-[9px] uppercase tracking-[0.1em] text-slate-400">Rail</p><p className="mt-1 text-xs font-medium text-slate-700">{order.rail}</p><p className="mt-0.5 text-[8px] leading-3 text-slate-400">{PARTNER_PREVIEW_RAIL_NOTES[order.rail]}</p></div>
                <div><p className="text-[9px] uppercase tracking-[0.1em] text-slate-400">Offer hold</p><p className={`mt-1 font-mono text-xs font-semibold tabular-nums ${order.expiresInSeconds <= 10 ? "text-red-600" : "text-slate-700"}`}>{partnerPreviewCountdown(order.expiresInSeconds)}</p></div>
                <div><p className="text-[9px] uppercase tracking-[0.1em] text-slate-400">Est. commission</p><p className="mt-1 text-sm font-semibold tabular-nums text-emerald-700">{inr(commission)}</p></div>
                <form action={beginPartnerActivation}>
                  <input type="hidden" name="programLevel" value={selectedLevel.code} />
                  <input type="hidden" name="sourceOrder" value={order.reference} />
                  <SubmitButton className="btn btn-gold btn-sm w-full justify-center" pendingLabel="Opening…">
                    {activationInProgress ? "Continue setup →" : "Activate desk →"}
                  </SubmitButton>
                </form>
              </article>
            );
          })}
        </div>
        <div className="border-t border-black/[0.06] bg-[#fbf8f2] px-5 py-3 text-[10px] leading-5 text-slate-500 sm:px-6">
          Simulated preview only — no merchant or customer instruction is shown here. Tickets follow normal UPI, IMPS and RTGS scheme guardrails; NEFT and bank-level limits can vary. Live availability starts only after the full selected reserve, account review and operator limit are confirmed.
        </div>
      </section>

      <section id="levels" className="mb-5 scroll-mt-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gold-700">Operating levels</p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-slate-900">Choose your live-order access level</h2>
          </div>
          <p className="max-w-xl text-right text-[10px] leading-5 text-slate-400">Select a level to recalculate every sample commission and the exact reserve required to activate.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PARTNER_PROGRAM_LEVELS.map((level) => {
            const selected = level.code === selectedLevel.code;
            return (
              <Link
                key={level.code}
                href={`/partner/processing?plan=${level.code}#preview-orders`}
                className={`group rounded-2xl border bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:border-gold-500/40 hover:shadow-card ${selected ? "border-gold-500 ring-2 ring-gold-500/10" : "border-black/[0.08]"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${markerClass[level.marker]}`} /><p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-900">{level.name}</p></div>
                  {selected ? <span className="rounded-full bg-gold-500/10 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-gold-700">Selected</span> : <span className="text-[9px] font-semibold text-slate-300 transition group-hover:text-gold-700">Select →</span>}
                </div>
                <p className="mt-4 text-2xl font-semibold tracking-[-0.025em] text-slate-950">{level.monthlyBaseUsdt.toLocaleString("en-US")} <span className="text-[10px] font-medium text-slate-400">USDT / month</span></p>
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-black/[0.06] pt-3">
                  <div><p className="text-[8px] uppercase tracking-[0.1em] text-slate-400">Commission</p><strong className="mt-1 block text-xs text-emerald-700">{level.commissionRate}%</strong></div>
                  <div><p className="text-[8px] uppercase tracking-[0.1em] text-slate-400">Reserve</p><strong className="mt-1 block text-xs tabular-nums text-slate-800">{level.activationReserveUsdt.toLocaleString("en-US")} USDT</strong></div>
                </div>
                <p className="mt-3 text-[10px] leading-4 text-slate-400">Typical monthly volume {level.volumeRange}</p>
              </Link>
            );
          })}
        </div>
        <p className="mt-3 text-[10px] leading-5 text-slate-400">Program ranges and sample commissions are estimates, not guaranteed traffic or income.</p>
      </section>

      <section className="grid overflow-hidden rounded-2xl border border-black/[0.08] bg-white sm:grid-cols-4 sm:divide-x sm:divide-black/[0.06]">
        {[
          ["01", "Explore first", "Review ticket sizes, rails, timers and estimated commission without depositing."],
          ["02", "Choose your level", "Your selected level fixes both the commission rate and exact activation reserve."],
          ["03", "Confirm the reserve", "Use the official wallet instruction and submit the TXID into your audit record."],
          ["04", "Open the live desk", "After review, eligible orders appear only inside your approved operating limit."],
        ].map(([step, title, body]) => (
          <div key={step} className="border-t border-black/[0.06] p-5 first:border-t-0 sm:border-t-0">
            <p className="font-mono text-[9px] font-semibold text-gold-700">{step}</p>
            <p className="mt-2 text-xs font-semibold text-slate-900">{title}</p>
            <p className="mt-1 text-[10px] leading-5 text-slate-400">{body}</p>
          </div>
        ))}
      </section>
    </>
  );
}
