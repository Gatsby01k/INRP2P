import type { Metadata } from "next";
import Link from "next/link";
import { ClearDraft } from "@/components/forms/clear-draft";
import { FormShell } from "@/components/site/form-shell";
import { CONTACT_EMAIL } from "@/lib/options";

export const metadata: Metadata = { title: "Partner workspace created" };

const NEXT_STEPS = [
  {
    title: "Verify your email",
    body: "Open the single-use link we sent. This protects your workspace and lets you set a private password.",
  },
  {
    title: "Complete partner review",
    body: "Inside the workspace, follow one checklist for identity, operating evidence and the review call.",
  },
  {
    title: "Activate your desk",
    body: "After approval, confirm the operating reserve and add a UPI or bank account for review.",
  },
  {
    title: "Receive eligible orders",
    body: "Operations enables an INR order limit. Only orders matching your active merchant connections and rails appear.",
  },
] as const;

export default async function ApplySubmittedPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;

  return (
    <FormShell
      eyebrow="Workspace created"
      title="Verify your email to enter."
      sub="Your partner profile is saved. One email confirmation now takes you into the private workspace where review and activation continue."
      facts={["Profile saved", "Email verification", "Private workspace"]}
    >
      <div className="space-y-5">
        <ClearDraft draftKey="inrp2p-apply-draft-v1" />

        <section className="overflow-hidden rounded-[18px] border border-[#07152e]/10 bg-[#07152e] text-white shadow-card">
          <div className="p-6 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[9px] font-semibold uppercase tracking-[.16em] text-gold-400">
                Next action
              </p>
              {ref && ref !== "received" ? (
                <span className="font-mono text-[10px] text-white/50">{ref}</span>
              ) : null}
            </div>
            <h2 className="mt-4 text-xl font-semibold tracking-[-.02em]">Confirm your work email</h2>
            <p className="mt-2 max-w-xl text-[13px] leading-6 text-slate-400">
              Check your inbox and spam folder for the INRP2P verification message. The link is single-use and time limited.
            </p>
            <Link href="/verify-email?status=pending" className="btn btn-gold mt-5 min-h-11">
              Verify email and open workspace →
            </Link>
          </div>
        </section>

        <section className="card p-6 sm:p-7">
          <div className="mb-5">
            <p className="eyebrow">Your activation path</p>
            <h2 className="mt-2 text-base font-semibold text-slate-900">Four clear checkpoints — all visible in your workspace</h2>
          </div>
          <ol className="grid gap-4 sm:grid-cols-2">
            {NEXT_STEPS.map((step, index) => (
              <li key={step.title} className="rounded-xl border border-black/[0.07] bg-black/[0.015] p-4">
                <span className="font-mono text-[9px] font-semibold text-gold-700">0{index + 1}</span>
                <p className="mt-3 text-[13px] font-semibold text-slate-900">{step.title}</p>
                <p className="mt-1.5 text-[11.5px] leading-5 text-slate-500">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <p className="text-xs leading-relaxed text-slate-400">
          Did not receive the message? Contact{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-gold-700 hover:underline">
            {CONTACT_EMAIL}
          </a>{" "}
          and include your reference. Approval and order access are not automatic or guaranteed.
        </p>
      </div>
    </FormShell>
  );
}
