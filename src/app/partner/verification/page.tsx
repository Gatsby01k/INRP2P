import { startVerification } from "@/app/actions/network-os";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { Flash } from "@/components/workspace/flash";
import { PartnerEvidenceChecklist } from "@/components/workspace/partner-evidence-checklist";
import { requireVerifiedRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";

export default async function PartnerVerificationPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const [user, flash] = await Promise.all([requireVerifiedRole("PARTNER"), searchParams]);
  const item = user.partner ? await db.verificationCase.findFirst({ where: { partnerId: user.partner.id }, include: { checks: true, evidence: { orderBy: { createdAt: "desc" } } }, orderBy: { createdAt: "desc" } }) : null;

  return <>
    <PageHeader title="Verification" sub="Complete the identity and operating checks required before your partner workspace can receive live orders." />
    <Flash {...flash} />
    {!item ? <div className="card p-6">
      <EmptyState title="Start your partner verification" body="Prepare an identity document, bank proof, reserve evidence and a short verification video. You can return if anything is missing." />
      <form action={startVerification} className="mt-4 text-center"><input type="hidden" name="subject" value="partner" /><button className="btn btn-gold">Start secure verification</button></form>
    </div> : <div className="space-y-5">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3"><span className="font-mono text-xs text-gold-700">{item.reference}</span><StatusBadge status={item.status} />{item.expiresAt ? <span className="ml-auto text-xs text-slate-400">Valid to {fmtDate(item.expiresAt)}</span> : null}</div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{item.checks.map((check) => <div className="rounded-xl border border-black/[0.08] bg-white p-3" key={check.id}><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">{check.type.replaceAll("_", " ")}</p><div className="mt-2"><StatusBadge status={check.status} /></div>{check.summary ? <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{check.summary}</p> : null}</div>)}</div>
      </div>
      <div className="card p-3 min-[390px]:p-4 sm:p-6"><PartnerEvidenceChecklist caseId={item.id} caseStatus={item.status} evidence={item.evidence.map(({ id, title, kind, status, mimeType, byteSize }) => ({ id, title, kind, status, mimeType, byteSize }))} /></div>
    </div>}
  </>;
}
