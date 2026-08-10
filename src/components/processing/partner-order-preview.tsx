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

type PreviewOrder = {
  slot: number;
  generation: number;
  reference: string;
  flow: "Pay-in" | "Pay-out";
  rail: string;
  amountInr: number;
  expiresInSeconds: number;
  freshTicks: number;
};

const ORDER_AMOUNTS = [68_500, 125_000, 242_500, 49_000, 380_000, 92_000, 175_000, 56_750, 310_000, 84_250] as const;
const ORDER_RAILS = ["UPI", "IMPS", "Bank transfer", "UPI", "RTGS", "NEFT"] as const;
const INITIAL_EXPIRIES = [8, 21, 34, 47, 59] as const;

function createPreviewOrder(slot: number, generation: number, initial = false): PreviewOrder {
  const flow: PreviewOrder["flow"] = (slot + generation) % 2 === 0 ? "Pay-in" : "Pay-out";
  const prefix = flow === "Pay-in" ? "PX-IN" : "PX-OUT";
  const sequence = 1048 + (slot * 17) + (generation * 43);

  return {
    slot,
    generation,
    reference: `${prefix}-${sequence}`,
    flow,
    rail: ORDER_RAILS[(slot + generation * 2) % ORDER_RAILS.length],
    amountInr: ORDER_AMOUNTS[(slot * 2 + generation * 3) % ORDER_AMOUNTS.length],
    expiresInSeconds: initial ? INITIAL_EXPIRIES[slot] : 38 + ((slot * 19 + generation * 13) % 52),
    freshTicks: initial ? 0 : 4,
  };
}

function initialPreviewOrders() {
  return INITIAL_EXPIRIES.map((_, slot) => createPreviewOrder(slot, 0, true));
}

function countdown(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainingSeconds = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

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
  const [orders, setOrders] = useState<PreviewOrder[]>(initialPreviewOrders);
  const activationInProgress = activationState !== "NOT_STARTED";
  const requiredReserveUsdt = selectedLevel.activationReserveUsdt;
  const reserveProgress = Math.min(100, Math.round((confirmedReserveUsdt / requiredReserveUsdt) * 100));

  useEffect(() => {
    const interval = window.setInterval(() => {
      setOrders((current) => current.map((order) => {
        if (order.expiresInSeconds <= 1) {
          return createPreviewOrder(order.slot, order.generation + 1);
        }
        return {
          ...order,
          expiresInSeconds: order.expiresInSeconds - 1,
          freshTicks: Math.max(0, order.freshTicks - 1),
        };
      }));
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
              Review typical pay-in and pay-out order structures, choose your operating level and start activation from any order below.
            </p>
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
          </div>
        </div>
        <div className="grid border-t border-white/10 sm:grid-cols-3 sm:divide-x sm:divide-white/10">
          <div className="px-5 py-4 sm:px-7"><p className="text-[9px] uppercase tracking-[0.14em] text-white/35">Typical monthly range</p><p className="mt-1 text-sm font-semibold">{selectedLevel.volumeRange}</p></div>
          <div className="border-t border-white/10 px-5 py-4 sm:border-t-0 sm:px-7"><p className="text-[9px] uppercase tracking-[0.14em] text-white/35">Commission potential</p><p className="mt-1 text-sm font-semibold">{selectedLevel.commissionPotential}</p></div>
          <div className="border-t border-white/10 px-5 py-4 sm:border-t-0 sm:px-7"><p className="text-[9px] uppercase tracking-[0.14em] text-white/35">Activation path</p><p className="mt-1 text-sm font-semibold">Reserve → review → live orders</p></div>
        </div>
      </section>

      <section id="levels" className="mb-5 scroll-mt-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gold-700">Operating levels</p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-slate-900">Choose how you want to start</h2>
          </div>
          <p className="max-w-xl text-right text-[10px] leading-5 text-slate-400">Ranges are program estimates, not guaranteed traffic or income.</p>
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
                  {selected ? <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-gold-700">Selected</span> : null}
                </div>
                <p className="mt-4 text-2xl font-semibold tracking-[-0.025em] text-slate-950">{level.monthlyBaseUsdt.toLocaleString("en-US")} <span className="text-[10px] font-medium text-slate-400">USDT base</span></p>
                <div className="mt-3 flex items-center justify-between border-t border-black/[0.06] pt-3 text-xs"><span className="text-slate-500">Commission</span><strong className="text-emerald-700">{level.commissionRate}%</strong></div>
                <div className="mt-2 flex items-center justify-between text-[10px]"><span className="text-slate-400">Reserve to activate</span><strong className="tabular-nums text-slate-700">{level.activationReserveUsdt.toLocaleString("en-US")} USDT</strong></div>
                <p className="mt-2 text-[10px] leading-4 text-slate-400">Typical range {level.volumeRange}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section id="preview-orders" className="card mb-5 scroll-mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] px-5 py-4 sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Order queue</h2>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-blue-700">Preview data</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Choose any sample order to begin your real account activation.</p>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-medium text-slate-500"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500 motion-reduce:animate-none" /> Queue refreshes automatically</div>
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
                  <p className="mt-1 text-[10px] text-slate-400">Merchant details open after activation</p>
                </div>
                <div><p className="text-[9px] uppercase tracking-[0.1em] text-slate-400">Amount</p><p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{inr(order.amountInr)}</p></div>
                <div><p className="text-[9px] uppercase tracking-[0.1em] text-slate-400">Rail</p><p className="mt-1 text-xs font-medium text-slate-700">{order.rail}</p></div>
                <div><p className="text-[9px] uppercase tracking-[0.1em] text-slate-400">Expires in</p><p className={`mt-1 font-mono text-xs font-semibold tabular-nums ${order.expiresInSeconds <= 10 ? "text-red-600" : "text-slate-700"}`}>{countdown(order.expiresInSeconds)}</p></div>
                <div><p className="text-[9px] uppercase tracking-[0.1em] text-slate-400">Your commission</p><p className="mt-1 text-sm font-semibold tabular-nums text-emerald-700">{inr(commission)}</p></div>
                <form action={beginPartnerActivation}>
                  <input type="hidden" name="programLevel" value={selectedLevel.code} />
                  <input type="hidden" name="sourceOrder" value={order.reference} />
                  <SubmitButton className="btn btn-gold btn-sm w-full justify-center" pendingLabel="Opening…">
                    {activationInProgress ? "Continue activation →" : "Take order →"}
                  </SubmitButton>
                </form>
              </article>
            );
          })}
        </div>
        <div className="border-t border-black/[0.06] bg-[#fbf8f2] px-5 py-3 text-[10px] leading-5 text-slate-500 sm:px-6">
          Preview orders rotate automatically to demonstrate timing and queue behaviour. They are not live merchant instructions. Live availability begins only after the full selected reserve is confirmed, account review is complete and operator limits are assigned.
        </div>
      </section>

      <section className="grid overflow-hidden rounded-2xl border border-black/[0.08] bg-white sm:grid-cols-4 sm:divide-x sm:divide-black/[0.06]">
        {[
          ["01", "Choose an order", "See the amount, rail, response window and estimated commission."],
          ["02", "Confirm reserve", "Create the official reserve instruction and submit your TXID."],
          ["03", "Complete review", "Operations checks your reserve, identity and payment accounts."],
          ["04", "Receive live work", "Eligible orders appear inside your approved operating limit."],
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
