import Link from "next/link";
import { indiaDateTime, indiaMonthLabel, type PartnerPerformanceSummary } from "@/lib/partner-performance";
import { inr, paymentRailLabel, processingTypeLabel } from "@/lib/processing";

export type RecentCompletedOrder = {
  id: string;
  reference: string;
  type: string;
  requestedRail: string;
  companyName: string;
  amountInr: number;
  feeInr: number;
  completedAt: Date;
};

function PeriodCard({
  label,
  fee,
  orders,
  volume,
  featured = false,
}: {
  label: string;
  fee: number;
  orders: number;
  volume: number;
  featured?: boolean;
}) {
  return (
    <article className={featured ? "bg-[#07152e] px-5 py-5 text-white sm:px-6" : "bg-white px-5 py-5 sm:px-6"}>
      <div className="flex items-center justify-between gap-3">
        <p className={featured ? "text-[9px] font-semibold uppercase tracking-[0.14em] text-gold-400" : "text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400"}>
          {label}
        </p>
        {featured ? <span className="h-1.5 w-1.5 rounded-full bg-leaf-400 shadow-[0_0_0_4px_rgba(47,190,109,.1)]" /> : null}
      </div>
      <p className={featured ? "mt-3 text-[26px] font-semibold tracking-[-0.035em] text-white tabular-nums" : "mt-3 text-[26px] font-semibold tracking-[-0.035em] text-slate-950 tabular-nums"}>
        {inr(fee)}
      </p>
      <p className={featured ? "mt-1.5 text-[10px] text-white/48" : "mt-1.5 text-[10px] text-slate-400"}>
        {orders.toLocaleString("en-IN")} completed {orders === 1 ? "order" : "orders"} · {inr(volume)} processed
      </p>
    </article>
  );
}

export function PartnerPerformanceLedger({
  summary,
  recentOrders,
  now,
  processingEnabled,
  dataAvailable,
}: {
  summary: PartnerPerformanceSummary;
  recentOrders: RecentCompletedOrder[];
  now: Date;
  processingEnabled: boolean;
  dataAvailable: boolean;
}) {
  return (
    <section className="card mb-5 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-black/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Commission & activity</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-leaf-500/20 bg-leaf-500/[0.06] px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-leaf-700">
              <span className="h-1.5 w-1.5 rounded-full bg-leaf-500" /> Recorded ledger
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Only completed orders are counted. Failed, cancelled and disputed orders never increase these totals.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[9px] font-medium uppercase tracking-[0.09em] text-slate-400">
          <span>Asia/Kolkata · IST</span>
          <Link href="/partner/processing" className="text-gold-700 transition-colors hover:text-gold-600">All orders →</Link>
        </div>
      </div>

      {dataAvailable ? (
        <>
          <div className="grid gap-px bg-black/[0.07] sm:grid-cols-3">
            <PeriodCard label="Today" fee={summary.today.feeInr} orders={summary.today.orders} volume={summary.today.volumeInr} />
            <PeriodCard label="Last 7 days" fee={summary.sevenDays.feeInr} orders={summary.sevenDays.orders} volume={summary.sevenDays.volumeInr} />
            <PeriodCard label={indiaMonthLabel(now)} fee={summary.month.feeInr} orders={summary.month.orders} volume={summary.month.volumeInr} featured />
          </div>

          <div className="grid gap-px border-y border-black/[0.06] bg-black/[0.06] sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-[#fbfaf8] px-5 py-4"><p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-400">Month volume</p><p className="mt-1.5 text-sm font-semibold text-slate-900 tabular-nums">{inr(summary.month.volumeInr)}</p></div>
            <div className="bg-[#fbfaf8] px-5 py-4"><p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-400">Average ticket</p><p className="mt-1.5 text-sm font-semibold text-slate-900 tabular-nums">{inr(summary.averageTicketInr)}</p></div>
            <div className="bg-[#fbfaf8] px-5 py-4"><p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-400">Pay-in completed</p><p className="mt-1.5 text-sm font-semibold text-slate-900 tabular-nums">{summary.payIn.orders} <span className="font-normal text-slate-400">· {inr(summary.payIn.volumeInr)}</span></p></div>
            <div className="bg-[#fbfaf8] px-5 py-4"><p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-400">Pay-out completed</p><p className="mt-1.5 text-sm font-semibold text-slate-900 tabular-nums">{summary.payOut.orders} <span className="font-normal text-slate-400">· {inr(summary.payOut.volumeInr)}</span></p></div>
          </div>

          <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4 sm:px-6">
            <div>
              <h3 className="text-[11px] font-semibold text-slate-800">Recent completed orders</h3>
              <p className="mt-0.5 text-[9px] text-slate-400">Amount and commission recorded at completion.</p>
            </div>
            {recentOrders.length ? <span className="text-[9px] font-medium text-slate-400">Latest {recentOrders.length}</span> : null}
          </div>

          {recentOrders.length ? (
            <div className="overflow-x-auto">
              <table className="tbl min-w-[760px]">
                <thead><tr><th>Order</th><th>Merchant</th><th>Flow</th><th>Completed</th><th>Amount</th><th>Commission</th><th></th></tr></thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td className="font-mono text-xs font-semibold text-gold-700">{order.reference}</td>
                      <td className="font-medium text-slate-700">{order.companyName}</td>
                      <td><span className="text-xs text-slate-700">{processingTypeLabel(order.type)}</span><span className="mt-0.5 block text-[9px] text-slate-400">{paymentRailLabel(order.requestedRail)}</span></td>
                      <td className="whitespace-nowrap text-[10px] text-slate-500">{indiaDateTime(order.completedAt)}</td>
                      <td className="font-semibold tabular-nums text-slate-800">{inr(order.amountInr)}</td>
                      <td className="font-semibold tabular-nums text-leaf-700">+{inr(order.feeInr)}</td>
                      <td><Link href={`/partner/processing/${order.id}`} className="text-[10px] font-semibold text-gold-700 hover:underline">Open →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mx-5 mb-5 mt-2 flex flex-col justify-between gap-4 rounded-xl border border-dashed border-black/[0.1] bg-black/[0.015] px-5 py-5 sm:mx-6 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-semibold text-slate-800">No completed orders yet</p>
                <p className="mt-1 max-w-xl text-[10px] leading-relaxed text-slate-500">
                  {processingEnabled
                    ? "Your first completed live order will appear here automatically with its amount, completion time and recorded commission."
                    : "Performance starts after live order access is enabled. Preview orders do not affect your totals."}
                </p>
              </div>
              <Link href="/partner/processing" className="btn btn-ghost btn-sm shrink-0">{processingEnabled ? "Open order queue" : "View activation"}</Link>
            </div>
          )}
        </>
      ) : (
        <div className="px-5 py-6 sm:px-6">
          <p className="text-xs font-semibold text-slate-800">Performance data is temporarily unavailable</p>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">Your orders and account were not changed. Retry the workspace to restore the recorded totals.</p>
        </div>
      )}
    </section>
  );
}
