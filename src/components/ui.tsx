import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { Counter } from "@/components/motion";
import { cn, statusLabel } from "@/lib/format";

/* ── Status badge ─────────────────────────────────────────────
   Gold = brand · Emerald = verification · Blue = information ·
   Red = risk · Gray = structure                                */

const TONE_CLASS = {
  sky: { chip: "border-sky-200 bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  blue: { chip: "border-blue-200 bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  gold: { chip: "border-gold-500/35 bg-gold-500/[0.09] text-gold-700", dot: "bg-gold-500" },
  emerald: {
    chip: "border-leaf-200 bg-leaf-50 text-leaf-700",
    dot: "bg-leaf-500",
  },
  rose: { chip: "border-rose-200 bg-rose-50 text-rose-600", dot: "bg-rose-500" },
  slate: { chip: "border-black/[0.09] bg-black/[0.03] text-slate-500", dot: "bg-slate-400" },
} as const;

const STATUS_TONE: Record<string, keyof typeof TONE_CLASS> = {
  // Request
  SUBMITTED: "sky",
  IN_REVIEW: "blue",
  MATCHING: "gold",
  INTRODUCED: "gold",
  CLOSED: "emerald",
  REJECTED: "rose",
  // Partner
  APPLIED: "sky",
  UNDER_REVIEW: "blue",
  VERIFIED: "emerald",
  LIMITED: "gold",
  SUSPENDED: "rose",
  // Match
  SUGGESTED: "sky",
  SHORTLISTED: "blue",
  ACCEPTED: "emerald",
  DECLINED: "rose",
  // Introduction
  PENDING: "slate",
  SENT: "sky",
  RESPONDED: "blue",
  SUCCESSFUL: "emerald",
  FAILED: "rose",
  // Urgency
  STANDARD: "slate",
  URGENT: "gold",
  CRITICAL: "rose",
  // Revenue
  POTENTIAL: "sky",
  QUOTED: "blue",
  AGREED: "gold",
  INVOICED: "gold",
  PAID: "emerald",
  CANCELLED: "rose",
  LOST: "rose",
  WAIVED: "slate",
  // Partner reserve deposits
  AWAITING_PAYMENT: "gold",
  CONFIRMING: "blue",
  CONFIRMED: "emerald",
  REFUNDED: "slate",
  EXPIRED: "rose",
  // Live processing
  AVAILABLE: "emerald",
  ASSIGNED: "blue",
  PAYMENT_MARKED: "gold",
  PAYOUT_SENT: "gold",
  COMPLETED: "emerald",
  DISPUTED: "rose",
  ACTIVE: "emerald",
  PAUSED: "gold",
  PENDING_REVIEW: "gold",
  DISABLED: "slate",
  OPEN: "sky",
  READY: "gold",
  // Error monitoring
  WARNING: "gold",
  ERROR: "rose",
  FATAL: "rose",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = TONE_CLASS[STATUS_TONE[status] ?? "slate"];
  return (
    <span className={cn("chip", tone.chip, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {statusLabel(status)}
    </span>
  );
}

/* ── Layout primitives ────────────────────────────────────────── */

export function PageHeader({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="workspace-page-header mb-5 flex flex-col items-stretch gap-4 animate-reveal sm:mb-6 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-[-0.01em] text-slate-900">{title}</h1>
        {sub ? <p className="mt-1 max-w-2xl break-words text-[13px] leading-relaxed text-slate-500">{sub}</p> : null}
      </div>
      {actions ? <div className="workspace-page-actions [&_.btn]:w-full sm:[&_.btn]:w-auto">{actions}</div> : null}
    </div>
  );
}

export function SectionTitle({
  title,
  action,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-center justify-between gap-3", className)}>
      <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {title}
      </h2>
      {action}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-black/[0.07] bg-black/[0.015] px-6 py-10 text-center animate-reveal">
      <BrandMark size={26} className="animate-float opacity-50" />
      <p className="mt-3 text-[13px] font-medium text-slate-700">{title}</p>
      {body ? <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">{body}</p> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "default" | "gold" | "emerald";
}) {
  return (
    <div className="card px-4 py-3" data-hoverable="true">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-500">
        {label}
      </p>
      <p
        className={cn(
          "tnum mt-1.5 text-[22px] font-semibold leading-none tracking-[-0.01em]",
          tone === "gold" && "text-gold-700",
          tone === "emerald" && "text-leaf-600",
          tone === "default" && "text-slate-900",
        )}
      >
        {typeof value === "number" ? <Counter value={value} /> : value}
      </p>
      {sub ? <p className="mt-1.5 text-[11px] text-slate-500">{sub}</p> : null}
    </div>
  );
}

export function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-[13px] leading-snug text-slate-800">{children}</dd>
    </div>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-gold-700"
    >
      <span aria-hidden className="text-[13px] leading-none">
        ←
      </span>
      {label}
    </Link>
  );
}

/* ── Form primitives ──────────────────────────────────────────── */

export function Field({
  label,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="lbl">{label}</span>
      {children}
      {hint && !error ? (
        <span className="mt-1.5 block text-[11.5px] text-slate-500">{hint}</span>
      ) : null}
      {error ? <span className="mt-1.5 block text-[11.5px] text-rose-600">{error}</span> : null}
    </label>
  );
}

export function CheckboxGrid({
  name,
  options,
  defaultChecked = [],
  cols = 2,
}: {
  name: string;
  options: readonly (string | { value: string; label: string })[];
  defaultChecked?: readonly string[];
  cols?: 2 | 3;
}) {
  const items = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : { value: o.value, label: o.label },
  );
  return (
    <div
      className={cn(
        "grid gap-2",
        cols === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2",
      )}
    >
      {items.map((o) => (
        <label
          key={o.value}
          className="fin-choice flex cursor-pointer items-center gap-2.5 rounded-xl border border-black/[0.1] bg-white px-3 py-2.5 text-[13px] text-slate-700 transition-colors duration-150 hover:border-black/25 hover:bg-[#FCFAF5] has-[:checked]:border-[#07152e]/50 has-[:checked]:bg-[#07152e]/[.035] has-[:checked]:text-slate-900"
        >
          <input
            type="checkbox"
            name={name}
            value={o.value}
            defaultChecked={defaultChecked.includes(o.value)}
            className="h-3.5 w-3.5 accent-[#07152E]"
          />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

export function RadioCards({
  name,
  options,
  defaultValue,
}: {
  name: string;
  options: readonly { value: string; label: string; hint?: string }[];
  defaultValue?: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {options.map((o) => (
        <label
          key={o.value}
          className="fin-choice flex cursor-pointer flex-col gap-0.5 rounded-xl border border-black/[0.1] bg-white px-3.5 py-3.5 transition-colors duration-150 hover:border-black/25 hover:bg-[#FCFAF5] has-[:checked]:border-[#07152e]/50 has-[:checked]:bg-[#07152e]/[.035]"
        >
          <span className="flex items-center gap-2.5">
            <input
              type="radio"
              name={name}
              value={o.value}
              defaultChecked={defaultValue === o.value}
              className="h-3.5 w-3.5 accent-[#07152E]"
            />
            <span className="text-[13px] font-semibold text-slate-800">{o.label}</span>
          </span>
          {o.hint ? <span className="ml-6 text-xs text-slate-500">{o.hint}</span> : null}
        </label>
      ))}
    </div>
  );
}

export function FormSection({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="fin-form-section">
      <div className="fin-form-section-head">
        <h2>{title}</h2>
        {sub ? <p>{sub}</p> : null}
      </div>
      <div className="fin-form-section-body">{children}</div>
    </section>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
      <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
      {message}
    </div>
  );
}
