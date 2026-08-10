import { DIRECTION_OPTIONS, REQUEST_TYPE_OPTIONS, REVENUE_TYPE_OPTIONS } from "./options";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** SUBMITTED → Submitted, IN_REVIEW → In Review */
export function statusLabel(s: string) {
  return s
    .toLowerCase()
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function directionLabel(d: string) {
  return DIRECTION_OPTIONS.find((o) => o.value === d)?.label ?? d;
}

export function requestTypeLabel(t: string) {
  return REQUEST_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? d(t);
}

export function revenueTypeLabel(t: string) {
  return REVENUE_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? d(t);
}

function d(v: string) {
  return statusLabel(v);
}

export function fmtDate(d: Date) {
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fmtDateTime(d: Date) {
  return (
    d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }) + " UTC"
  );
}

/** Human-readable label for an audit event. */
export function auditLabel(action: string, meta?: unknown): string {
  const m = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>;
  const from = m.from ? statusLabel(String(m.from)) : "";
  const to = m.to ? statusLabel(String(m.to)) : "";
  switch (action) {
    case "request.submitted":
      return "Request submitted";
    case "request.status_changed":
      return `Request status: ${from} → ${to}`;
    case "partner.applied":
      return "Partner application submitted";
    case "partner.status_changed":
      return `Partner status: ${from} → ${to}`;
    case "partner.profile_updated":
      return "Partner updated operational profile";
    case "partner.activation_started":
      return `Partner activation started${m.programLevel ? ` — ${statusLabel(String(m.programLevel))}` : ""}${m.sourceOrder ? ` · ${String(m.sourceOrder)}` : ""}`;
    case "match.created":
      return `Match created${m.partnerName ? ` — ${String(m.partnerName)}` : ""}`;
    case "match.status_changed":
      return `Match ${from} → ${to}${m.partnerName ? ` — ${String(m.partnerName)}` : ""}`;
    case "match.release_changed":
      return m.released
        ? `Introduction released to ${String(m.side)}`
        : `Introduction release revoked (${String(m.side)})`;
    case "introduction.created":
      return `Introduction recorded${m.channel ? ` via ${String(m.channel).toLowerCase()}` : ""}`;
    case "introduction.status_changed":
      return `Introduction ${from} → ${to}`;
    case "introduction.outcome_updated":
      return "Introduction outcome / follow-up updated";
    case "match.decision_updated":
      return "Match decision-support notes updated";
    case "revenue.created":
      return `Revenue recorded${m.amount ? ` — ${String(m.amount)} ${String(m.currency ?? "")}` : ""}`;
    case "revenue.status_changed":
      return `Revenue ${from} → ${to}`;
    case "note.added":
      return "Note added";
    case "document.added":
      return "Document added";
    case "deposit.intent_created":
      return "USDT reserve instructions created";
    case "deposit.transaction_submitted":
      return "USDT reserve transaction submitted";
    case "deposit.manually_confirmed":
      return "USDT reserve confirmed by operator";
    case "deposit.provider_status_changed":
      return `Deposit ${from} → ${to}`;
    case "deposit.refunded":
      return "USDT reserve refunded";
    case "deposit.rejected":
      return "USDT reserve deposit rejected";
    default:
      return statusLabel(action.replace(/\./g, "_"));
  }
}

export function money(amount: number | string, currency: string) {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return `${amount} ${currency}`;
  if (currency === "INR")
    return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " " + currency;
}
