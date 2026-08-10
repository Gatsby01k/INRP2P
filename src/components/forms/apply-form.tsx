"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitPartnerApplication } from "@/app/actions/public";
import { SubmitButton } from "@/components/submit-button";
import { TurnstileField } from "@/components/forms/turnstile-field";
import {
  CheckboxGrid,
  Field,
  FormError,
  FormSection,
} from "@/components/ui";
import { cn } from "@/lib/format";
import { applyFieldsToForm, partnerFormPrefill } from "@/lib/form-prefill";
import {
  BANK_OPTIONS,
  CAPACITY_BANDS,
  COMPLIANCE_FLAG_OPTIONS,
  DIRECTION_OPTIONS,
  EXPERIENCE_BANDS,
  METHOD_OPTIONS,
  RESERVE_BANDS,
} from "@/lib/options";
import type { ActionState } from "@/lib/schemas";

function Select({
  name,
  options,
  placeholder,
  required,
}: {
  name: string;
  options: readonly string[];
  placeholder: string;
  required?: boolean;
}) {
  return (
    <select name={name} required={required} className="input" defaultValue="">
      <option value="" disabled>
        {placeholder}
      </option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/* ── Steps ────────────────────────────────────────────────────
   One form, four screens. Nothing is unmounted between steps —
   values survive back-and-forth navigation for free, and the
   server still receives every field on final submit.            */

const STEPS = [
  { title: "Your desk", eta: "~4 min total" },
  { title: "Coverage & capacity", eta: "~2 min left" },
  { title: "Compliance", eta: "~1 min left" },
  { title: "Review & send", eta: "Almost done" },
] as const;

const STEP_OF_FIELD: Record<string, number> = {
  displayName: 0,
  legalName: 0,
  contactName: 0,
  telegram: 0,
  phone: 0,
  experienceBand: 0,
  email: 3,
  directions: 1,
  banks: 1,
  methods: 1,
  dailyCapacityBand: 1,
  monthlyCapacityBand: 1,
  minTicket: 1,
  maxTicket: 1,
  reserveBand: 1,
  workingHours: 1,
  operatingCountry: 1,
  jurisdictions: 1,
  settlementPreference: 1,
  complianceFlags: 2,
  complianceNotes: 2,
  references: 2,
  riskNotes: 2,
  additionalComments: 2,
};

const TEXT_FIELDS = [
  "displayName",
  "legalName",
  "contactName",
  "telegram",
  "phone",
  "experienceBand",
  "email",
  "dailyCapacityBand",
  "monthlyCapacityBand",
  "minTicket",
  "maxTicket",
  "reserveBand",
  "workingHours",
  "operatingCountry",
  "jurisdictions",
  "settlementPreference",
  "complianceNotes",
  "references",
  "riskNotes",
  "additionalComments",
] as const;

const LIST_FIELDS = ["directions", "banks", "methods", "complianceFlags"] as const;

type Snap = Record<(typeof TEXT_FIELDS)[number], string> &
  Record<(typeof LIST_FIELDS)[number], string[]>;

function emptySnap(): Snap {
  const out = {} as Snap;
  for (const k of TEXT_FIELDS) out[k] = "";
  for (const k of LIST_FIELDS) out[k] = [];
  return out;
}

function readSnap(form: HTMLFormElement | null): Snap {
  if (!form) return emptySnap();
  const fd = new FormData(form);
  const out = {} as Snap;
  for (const k of TEXT_FIELDS) out[k] = String(fd.get(k) ?? "");
  for (const k of LIST_FIELDS) out[k] = fd.getAll(k).map(String);
  return out;
}

const EMAIL_RE = /^\S+@\S+\.\S+$/;

const DRAFT_KEY = "inrp2p-apply-draft-v1";

export function ApplyForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(
    submitPartnerApplication,
    {},
  );
  const fe = state.fieldErrors ?? {};

  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [snap, setSnap] = useState<Snap>(emptySnap);
  const [draftSaved, setDraftSaved] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [turnstileEpoch, setTurnstileEpoch] = useState(0);

  const formRef = useRef<HTMLFormElement>(null);
  const stepRef0 = useRef<HTMLDivElement>(null);
  const stepRef1 = useRef<HTMLDivElement>(null);
  const stepRef2 = useRef<HTMLDivElement>(null);
  const stepRef3 = useRef<HTMLDivElement>(null);
  const stepRefs = [stepRef0, stepRef1, stepRef2, stepRef3];

  // Server rejected the submit — jump to wherever the first bad field lives
  // and unlock every tab, since the applicant already made it to the end once.
  useEffect(() => {
    if (!state.error && !Object.keys(fe).length) return;
    const hit = Object.keys(fe).map((k) => STEP_OF_FIELD[k] ?? 0);
    setStep(hit.length ? Math.min(...hit) : STEPS.length - 1);
    setMaxStep(STEPS.length - 1);
    setSnap(readSnap(formRef.current));
    setTurnstileEpoch((value) => value + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Restore a locally saved draft, then layer on any query-param prefill
  // (?experienceBand=…, ?directions=…, etc.) from a referral link or a
  // programmatic SEO corridor page — see src/lib/form-prefill.ts. Prefill
  // wins field-by-field over a stale draft. Closing the tab mid-application
  // shouldn't cost someone their 4 minutes of work either way. There's no
  // password field to worry about — the account password is generated
  // server-side on submit and never typed here at all.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    let saved: Record<string, string | string[]> = {};
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch {
      /* corrupt or unavailable storage — start clean */
    }
    let prefill: Record<string, string | string[]> = {};
    try {
      prefill = partnerFormPrefill(new URLSearchParams(window.location.search));
    } catch {
      /* malformed URL — ignore */
    }
    const touched = applyFieldsToForm(form, { ...saved, ...prefill });
    if (touched) {
      setSnap(readSnap(form));
      setDraftRestored(true);
      // They got at least this far before (or arrived with a head start) —
      // no reason to make them re-clear each step's validity gate just to
      // look at their own data.
      setMaxStep(STEPS.length - 1);
    }
  }, []);

  function persistDraft(form: HTMLFormElement) {
    try {
      const fd = new FormData(form);
      const obj: Record<string, string | string[]> = {};
      for (const k of TEXT_FIELDS) {
        const v = fd.get(k);
        if (typeof v === "string" && v) obj[k] = v;
      }
      for (const k of LIST_FIELDS) {
        const vals = fd.getAll(k).map(String);
        if (vals.length) obj[k] = vals;
      }
      localStorage.setItem(DRAFT_KEY, JSON.stringify(obj));
      setDraftSaved(true);
    } catch {
      /* storage unavailable — skip autosave */
    }
  }

  // Move focus to the first field of whichever step just became visible —
  // keyboard and fast typists shouldn't have to reach for the mouse.
  useEffect(() => {
    const el = stepRefs[step]?.current;
    const first = el?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea");
    first?.focus({ preventScroll: true });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function handleFormChange() {
    const form = formRef.current;
    setSnap(readSnap(form));
    if (form) persistDraft(form);
  }

  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== "Enter") return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "TEXTAREA" || step === STEPS.length - 1) return;
    e.preventDefault();
    if (stepValid[step]) goNext();
  }

  const stepValid = [
    snap.displayName.trim().length >= 2 &&
      snap.contactName.trim().length >= 2 &&
      snap.experienceBand !== "",
    snap.directions.length > 0 &&
      snap.banks.length > 0 &&
      snap.methods.length > 0 &&
      snap.dailyCapacityBand !== "" &&
      snap.reserveBand !== "" &&
      snap.workingHours.trim().length >= 2 &&
      snap.jurisdictions.trim().length >= 2,
    true,
    EMAIL_RE.test(snap.email),
  ];

  function goToStep(i: number) {
    if (i > maxStep) return;
    setStep(i);
  }
  function goNext() {
    if (!stepValid[step]) return;
    setStep((s) => {
      const n = Math.min(s + 1, STEPS.length - 1);
      setMaxStep((m) => Math.max(m, n));
      return n;
    });
  }
  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  return (
    <div className="fin-onboarding-flow">
      <div className="fin-step-heading">
        <span>Partner application · Step {step + 1} of {STEPS.length}</span>
        <strong>{STEPS[step].eta}</strong>
      </div>
        {/* Step tabs */}
        <div
          className="mb-5 grid grid-cols-4 gap-1 rounded-[14px] border border-[#07152e]/10 bg-white p-1.5 shadow-[0_14px_36px_-32px_rgba(7,21,46,.45)]"
        >
          {STEPS.map((s, i) => (
            <button
              key={s.title}
              type="button"
              onClick={() => goToStep(i)}
              disabled={i > maxStep}
              className={cn(
                "flex min-h-[44px] items-center justify-center rounded-[10px] px-2 py-2.5 text-center text-[10px] font-semibold leading-tight transition-colors",
                step === i
                  ? "bg-[#07152e] text-white shadow-[0_8px_18px_-12px_rgba(7,21,46,.7)]"
                  : i <= maxStep
                    ? "text-slate-600 hover:bg-black/[0.035] hover:text-slate-900"
                    : "cursor-not-allowed text-slate-400",
              )}
            >
              <span className="hidden sm:inline">
                {i + 1}. {s.title}
              </span>
              <span className="sm:hidden">{i + 1}</span>
            </button>
          ))}
        </div>

        <form
          ref={formRef}
          action={formAction}
          onChange={handleFormChange}
          onKeyDown={handleFormKeyDown}
          className="space-y-6"
        >
          <input
            type="text"
            name="website_hp"
            tabIndex={-1}
            autoComplete="off"
            className="hidden"
            aria-hidden
          />

          {/* Step 0 — Your desk */}
          <div ref={stepRef0} className={cn("space-y-6", step !== 0 && "hidden")}>
            <FormSection
              title="Identity & contact"
              sub="Your operating name is shown to companies only after an introduction is released."
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Operating name" error={fe.displayName}>
                  <input name="displayName" required minLength={2} className="input" placeholder="Desk / brand name" />
                </Field>
                <Field label="Legal entity name" error={fe.legalName} hint="Optional at application stage">
                  <input name="legalName" className="input" placeholder="Registered entity" />
                </Field>
                <Field label="Contact name" error={fe.contactName}>
                  <input name="contactName" required minLength={2} className="input" placeholder="Full name" />
                </Field>
                <Field label="Telegram" error={fe.telegram} hint="Optional">
                  <input name="telegram" className="input" placeholder="@handle" />
                </Field>
                <Field label="Phone" error={fe.phone} hint="Optional">
                  <input name="phone" className="input" placeholder="+91 …" />
                </Field>
                <Field label="Years of experience" error={fe.experienceBand}>
                  <Select name="experienceBand" options={EXPERIENCE_BANDS} placeholder="Select experience" required />
                </Field>
              </div>
            </FormSection>

            <StepFooter
              backDisabled
              nextDisabled={!stepValid[0]}
              nextLabel="Continue to coverage"
              onNext={goNext}
              hint={!stepValid[0] ? "Fill in name, contact and experience to continue." : undefined}
            />
          </div>

          {/* Step 1 — Coverage & capacity */}
          <div ref={stepRef1} className={cn(step !== 1 && "hidden")}>
            <FormSection title="Coverage & capacity" sub="Declare what you can actually run, day in, day out.">
              <Field label="Supported directions" error={fe.directions} hint={hintFor(snap.directions.length)}>
                <CheckboxGrid name="directions" options={DIRECTION_OPTIONS} cols={3} />
              </Field>
              <Field label="Supported banks" error={fe.banks} hint={hintFor(snap.banks.length)}>
                <CheckboxGrid name="banks" options={BANK_OPTIONS} cols={3} />
              </Field>
              <Field label="Methods / rails" error={fe.methods} hint={hintFor(snap.methods.length)}>
                <CheckboxGrid name="methods" options={METHOD_OPTIONS} cols={3} />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Daily capacity" error={fe.dailyCapacityBand}>
                  <Select name="dailyCapacityBand" options={CAPACITY_BANDS} placeholder="Select daily capacity" required />
                </Field>
                <Field label="Monthly capacity" error={fe.monthlyCapacityBand} hint="Optional">
                  <input name="monthlyCapacityBand" className="input" placeholder="e.g. ₹50–200 crore / month" />
                </Field>
                <Field label="Minimum ticket" error={fe.minTicket} hint="Optional">
                  <input name="minTicket" className="input" placeholder="e.g. ₹5 lakh" />
                </Field>
                <Field label="Maximum ticket" error={fe.maxTicket} hint="Optional">
                  <input name="maxTicket" className="input" placeholder="e.g. ₹5 crore" />
                </Field>
                <Field label="Reserve available" error={fe.reserveBand}>
                  <Select name="reserveBand" options={RESERVE_BANDS} placeholder="Select reserve band" required />
                </Field>
                <Field label="Working hours" error={fe.workingHours} hint="e.g. 09:00–23:00 IST, 7 days">
                  <input name="workingHours" required minLength={2} className="input" placeholder="Hours + days + timezone" />
                </Field>
                <Field label="Operating country" error={fe.operatingCountry} hint="Optional">
                  <input name="operatingCountry" className="input" placeholder="e.g. India" />
                </Field>
                <Field label="Jurisdictions covered" error={fe.jurisdictions}>
                  <input name="jurisdictions" required minLength={2} className="input" placeholder="e.g. India nationwide" />
                </Field>
                <Field
                  label="Settlement preference"
                  error={fe.settlementPreference}
                  hint="Optional — how you prefer to settle"
                  className="sm:col-span-2"
                >
                  <input
                    name="settlementPreference"
                    className="input"
                    placeholder="e.g. same-day bank transfer after confirmation"
                  />
                </Field>
              </div>
            </FormSection>

            <StepFooter
              nextDisabled={!stepValid[1]}
              nextLabel="Continue to compliance"
              onBack={goBack}
              onNext={goNext}
              hint={!stepValid[1] ? "Pick at least one direction, bank and rail, then set capacity and hours." : undefined}
            />
          </div>

          {/* Step 2 — Compliance */}
          <div ref={stepRef2} className={cn(step !== 2 && "hidden")}>
            <FormSection
              title="Compliance readiness"
              sub="Verification depends on this. Overstating it wastes everyone's time."
            >
              <Field label="What you can evidence today" error={fe.complianceFlags} hint="Optional, but the closer to complete, the faster verification goes">
                <CheckboxGrid name="complianceFlags" options={COMPLIANCE_FLAG_OPTIONS} cols={2} />
              </Field>
              <Field label="Compliance notes" error={fe.complianceNotes} hint="Optional — structure, policies, references">
                <textarea name="complianceNotes" rows={3} className="input" placeholder="Anything relevant to verification" />
              </Field>
              <Field label="References" error={fe.references} hint="Optional — companies or partners who can vouch for you">
                <textarea name="references" rows={2} className="input" placeholder="Name, company, contact (optional)" />
              </Field>
              <Field label="Risk notes" error={fe.riskNotes} hint="Optional — anything we should know upfront">
                <textarea name="riskNotes" rows={2} className="input" placeholder="Prior issues, limitations, disclosures" />
              </Field>
              <Field label="Additional comments" error={fe.additionalComments} hint="Optional">
                <textarea name="additionalComments" rows={2} className="input" placeholder="Anything else" />
              </Field>
            </FormSection>

            <StepFooter nextLabel="Review application" onBack={goBack} onNext={goNext} />
          </div>

          {/* Step 3 — Review */}
          <div ref={stepRef3} className={cn(step !== 3 && "hidden")}>
            <FormSection
              title="Create your workspace"
              sub="This creates your partner login so you can watch verification and matches land — no password to invent, you'll be signed in immediately after you submit below."
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Email" error={fe.email}>
                  <input name="email" type="email" required className="input" placeholder="you@desk.com" />
                </Field>
              </div>
            </FormSection>

            <FormSection
              title="Review before you send it"
              sub="This is exactly what operations will see. Fix anything now — editing later means re-review."
            >
              <ReviewSection title="Your desk" onEdit={() => goToStep(0)}>
                <ReviewRow label="Operating name" value={snap.displayName} />
                <ReviewRow label="Legal entity" value={snap.legalName} />
                <ReviewRow label="Contact" value={snap.contactName} />
                <ReviewRow label="Telegram" value={snap.telegram} />
                <ReviewRow label="Phone" value={snap.phone} />
                <ReviewRow label="Experience" value={snap.experienceBand} />
              </ReviewSection>

              <ReviewSection title="Coverage & capacity" onEdit={() => goToStep(1)}>
                <ReviewRow label="Directions" value={snap.directions.join(", ")} />
                <ReviewRow label="Banks" value={snap.banks.join(", ")} />
                <ReviewRow label="Methods / rails" value={snap.methods.join(", ")} />
                <ReviewRow label="Daily capacity" value={snap.dailyCapacityBand} />
                <ReviewRow label="Monthly capacity" value={snap.monthlyCapacityBand} />
                <ReviewRow
                  label="Ticket range"
                  value={snap.minTicket || snap.maxTicket ? `${snap.minTicket || "—"} to ${snap.maxTicket || "—"}` : ""}
                />
                <ReviewRow label="Reserve available" value={snap.reserveBand} />
                <ReviewRow label="Working hours" value={snap.workingHours} />
                <ReviewRow label="Operating country" value={snap.operatingCountry} />
                <ReviewRow label="Jurisdictions" value={snap.jurisdictions} />
                <ReviewRow label="Settlement preference" value={snap.settlementPreference} />
              </ReviewSection>

              <ReviewSection title="Compliance" onEdit={() => goToStep(2)}>
                <ReviewRow
                  label="Evidenced today"
                  value={snap.complianceFlags.length ? snap.complianceFlags.join(", ") : "None yet — can be added during verification"}
                />
                <ReviewRow label="Compliance notes" value={snap.complianceNotes} />
                <ReviewRow label="References" value={snap.references} />
                <ReviewRow label="Risk notes" value={snap.riskNotes} />
                <ReviewRow label="Additional comments" value={snap.additionalComments} />
              </ReviewSection>
            </FormSection>

            {step === STEPS.length - 1 ? <TurnstileField resetKey={turnstileEpoch} /> : null}
            <FormError message={state.error} />

            <div className="mt-5 flex flex-col-reverse items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-sm text-xs leading-relaxed text-slate-400">
                Applications are reviewed manually. Verification may require documents
                and a call before any introduction is made.
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={goBack} className="btn btn-ghost btn-sm">
                  Back
                </button>
                <SubmitButton pendingLabel="Sending…">Apply to join</SubmitButton>
              </div>
            </div>
          </div>
        </form>
      {draftRestored || draftSaved ? (
        <p className="mt-4 text-[10px] text-slate-400">
          {draftRestored && !draftSaved ? "Draft restored from this device" : "Draft saved on this device"}
        </p>
      ) : null}
    </div>
  );
}

function hintFor(count: number) {
  return count > 0 ? `${count} selected` : "Select at least one";
}

function StepFooter({
  onBack,
  onNext,
  backDisabled,
  nextDisabled,
  nextLabel,
  hint,
}: {
  onBack?: () => void;
  onNext: () => void;
  backDisabled?: boolean;
  nextDisabled?: boolean;
  nextLabel: string;
  hint?: string;
}) {
  return (
    <div className="mt-5 flex flex-col-reverse items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="max-w-sm text-[11.5px] leading-relaxed text-slate-400">{hint ?? ""}</p>
      <div className="flex items-center gap-2">
        {!backDisabled && onBack ? (
          <button type="button" onClick={onBack} className="btn btn-ghost btn-sm">
            Back
          </button>
        ) : null}
        <button type="button" onClick={onNext} disabled={nextDisabled} className="btn btn-gold btn-sm">
          {nextLabel} →
        </button>
      </div>
    </div>
  );
}

function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-black/[0.07] pt-5 first:border-t-0 first:pt-0">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>
        <button type="button" onClick={onEdit} className="text-[11.5px] font-medium text-gold-700 hover:underline">
          Edit
        </button>
      </div>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-[13px] leading-snug text-slate-800">{value || "—"}</dd>
    </div>
  );
}
