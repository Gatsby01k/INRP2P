import { publishCapacityPulse } from "@/app/actions/network-os";
import { EmptyState, Field, PageHeader, StatusBadge } from "@/components/ui";
import { Flash } from "@/components/workspace/flash";
import { requireVerifiedRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { directionLabel, fmtDateTime } from "@/lib/format";

export default async function PartnerCapacityPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const [user, flash] = await Promise.all([requireVerifiedRole("PARTNER"), searchParams]);
  const pulses = user.partner
    ? await db.capacityPulse.findMany({
        where: { partnerId: user.partner.id },
        orderBy: { confirmedAt: "desc" },
        take: 10,
      })
    : [];
  const now = new Date();
  const current = pulses.find((pulse) => pulse.availableUntil > now) ?? null;

  return (
    <>
      <PageHeader
        title="Availability"
        sub="Tell operations when your desk can take new work. Every update expires automatically, so merchants never see stale capacity."
      />
      <Flash {...flash} />

      {current ? (
        <section className="mb-5 flex flex-col gap-4 rounded-2xl border border-leaf-400/25 bg-leaf-50/70 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={current.status} />
              <span className="text-xs font-semibold text-slate-800">{directionLabel(current.direction)}</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-900">{current.availableBand}</p>
            <p className="mt-1 text-[11px] text-slate-500">Visible until {fmtDateTime(current.availableUntil)}</p>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[.12em] text-leaf-700">Current availability</span>
        </section>
      ) : (
        <div className="mb-5 rounded-xl border border-gold-500/25 bg-gold-500/[0.07] px-4 py-3 text-xs leading-relaxed text-gold-800">
          Your desk is not currently marked available. Publish a short availability window when you are ready for new orders.
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="card p-5 sm:p-6">
          <div className="mb-5 border-b border-black/[0.06] pb-4">
            <h2 className="text-sm font-semibold text-slate-900">Publish availability</h2>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">A new update replaces the previous operating signal for the selected flow.</p>
          </div>
          <form action={publishCapacityPulse} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Desk status">
                <select className="input" name="status" defaultValue="AVAILABLE">
                  <option value="AVAILABLE">Available — taking new work</option>
                  <option value="LIMITED">Limited — confirm before routing</option>
                  <option value="PAUSED">Paused — finish active work only</option>
                  <option value="OFFLINE">Offline — not operating</option>
                </select>
              </Field>
              <Field label="Flow">
                <select className="input" name="direction" defaultValue="INR_PAYOUTS">
                  <option value="INR_PAYOUTS">INR pay-in / payouts</option>
                  <option value="INR_TO_USDT">INR → USDT</option>
                  <option value="USDT_TO_INR">USDT → INR</option>
                </select>
              </Field>
              <Field label="Capacity available now" hint="Use a realistic INR band">
                <input className="input" name="availableBand" placeholder="e.g. ₹10–25 lakh" required />
              </Field>
              <Field label="Keep this active for">
                <select className="input" name="hours" defaultValue="8">
                  <option value="2">2 hours</option>
                  <option value="4">4 hours</option>
                  <option value="8">8 hours</option>
                  <option value="12">12 hours</option>
                  <option value="24">24 hours</option>
                </select>
              </Field>
            </div>

            <details className="rounded-xl border border-black/[0.08] bg-black/[0.015]">
              <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-slate-700">Add ticket or rail limits</summary>
              <div className="grid gap-4 border-t border-black/[0.06] p-4 sm:grid-cols-2">
                <Field label="Minimum ticket" hint="Optional"><input className="input" name="minTicket" placeholder="e.g. ₹25,000" /></Field>
                <Field label="Maximum ticket" hint="Optional"><input className="input" name="maxTicket" placeholder="e.g. ₹5,00,000" /></Field>
                <Field label="Bank" hint="Optional"><input className="input" name="banks" placeholder="e.g. HDFC" /></Field>
                <Field label="Rail" hint="Optional"><input className="input" name="methods" placeholder="e.g. UPI / IMPS" /></Field>
              </div>
            </details>

            <div className="flex flex-col gap-3 border-t border-black/[0.06] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-md text-[11px] leading-5 text-slate-500">This signal controls routing only. It does not guarantee that an order will appear.</p>
              <button className="btn btn-gold">Publish availability →</button>
            </div>
          </form>
        </section>

        <section className="card h-fit overflow-hidden">
          <div className="border-b border-black/[0.06] px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Recent updates</h2>
          </div>
          {pulses.length ? (
            <div className="divide-y divide-black/[0.06]">
              {pulses.map((pulse) => (
                <div className="p-4" key={pulse.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={pulse.availableUntil <= now ? "EXPIRED" : pulse.status} />
                    <span className="text-xs font-semibold text-slate-700">{directionLabel(pulse.direction)}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-600">{pulse.availableBand}</p>
                  <p className="mt-1 text-[10px] text-slate-400">Until {fmtDateTime(pulse.availableUntil)}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-5">
              <EmptyState title="No availability updates yet" body="Publish a window only when your desk is ready for new work." />
            </div>
          )}
        </section>
      </div>
    </>
  );
}
