"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitCompanyRequest } from "@/app/actions/public";
import { SubmitButton } from "@/components/submit-button";
import { CheckboxGrid, Field, FormError, RadioCards } from "@/components/ui";
import { TurnstileField } from "@/components/forms/turnstile-field";
import { applyFieldsToForm, requestFormPrefill } from "@/lib/form-prefill";
import { cn } from "@/lib/format";
import {
  BANK_OPTIONS,
  DAILY_VOLUME_BANDS,
  KYC_READINESS_OPTIONS,
  METHOD_OPTIONS,
  MONTHLY_VOLUME_BANDS,
  SPEED_OPTIONS,
  URGENCY_OPTIONS,
} from "@/lib/options";
import type { ActionState } from "@/lib/schemas";

const DRAFT_KEY = "inrp2p-request-draft-v2";

const REQUEST_TYPE_CHOICES = [
  { value: "INR_PAYOUTS", label: "INR payouts", hint: "Recurring INR payouts in India" },
  { value: "INR_LIQUIDITY", label: "INR liquidity", hint: "General INR liquidity need" },
  { value: "INR_TO_USDT", label: "INR → USDT", hint: "You hold INR and need USDT" },
  { value: "USDT_TO_INR", label: "USDT → INR", hint: "You hold USDT and need INR" },
  { value: "PARTNER_SOURCING", label: "Partner sourcing", hint: "Looking to be introduced to partners directly" },
  { value: "OTHER", label: "Other", hint: "Describe it in the notes below" },
];

/** Field names validated on each step. */
function stepFields(loggedIn: boolean): string[][] {
  const steps = [
    ["requestType", "dailyVolumeBand", "monthlyVolumeBand", "requiredSpeed"],
    ["banks", "methods", "jurisdiction"],
    ["kycReadiness"],
  ];
  if (!loggedIn) {
    steps.push(["companyName", "companyJurisdiction", "contactName", "email"]);
  }
  return steps;
}

const STEP_LABELS_FULL = ["Requirement", "Coverage", "Compliance", "Company & access"];

const REQUIRED_MESSAGES: Record<string, string> = {
  requestType: "Select a request type",
  dailyVolumeBand: "Select daily volume",
  monthlyVolumeBand: "Select monthly volume",
  requiredSpeed: "Select settlement speed",
  banks: "Select at least one bank",
  methods: "Select at least one method",
  jurisdiction: "Operating jurisdiction is required",
  kycReadiness: "Select KYC/KYB readiness",
  companyName: "Company name is required",
  companyJurisdiction: "Registration jurisdiction is required",
  contactName: "Contact name is required",
  email: "A valid email is required",
};

function validateFields(fields: string[], fd: FormData): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const name of fields) {
    if (name === "banks" || name === "methods") {
      if (fd.getAll(name).length === 0) errors[name] = REQUIRED_MESSAGES[name];
      continue;
    }
    const v = fd.get(name);
    const s = typeof v === "string" ? v.trim() : "";
    if (name === "email") {
      if (!/^\S+@\S+\.\S+$/.test(s)) errors[name] = REQUIRED_MESSAGES[name];
      continue;
    }
    if (!s) errors[name] = REQUIRED_MESSAGES[name];
  }
  return errors;
}

function Select({
  name,
  options,
  placeholder,
}: {
  name: string;
  options: readonly string[];
  placeholder: string;
}) {
  return (
    <select name={name} className="input" defaultValue="">
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

export function RequestForm({ loggedInCompany }: { loggedInCompany?: string }) {
  const loggedIn = Boolean(loggedInCompany);
  const [state, formAction] = useActionState<ActionState, FormData>(submitCompanyRequest, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [draftSaved, setDraftSaved] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [turnstileEpoch, setTurnstileEpoch] = useState(0);

  const fields = stepFields(loggedIn);
  const labels = STEP_LABELS_FULL.slice(0, fields.length);
  const lastStep = fields.length - 1;
  const fe = { ...(state.fieldErrors ?? {}), ...localErrors };

  /* Restore a locally saved draft, then layer on any query-param prefill
     (?requestType=…, ?dailyVolumeBand=…, etc.) from a referral link, the AI
     concierge chat, or a programmatic SEO corridor page — see
     src/lib/form-prefill.ts. Prefill wins field-by-field over a stale
     draft, since clicking a link like that is a fresher, more specific
     signal of intent than whatever was typed in a previous visit. */
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
      prefill = requestFormPrefill(new URLSearchParams(window.location.search));
    } catch {
      /* malformed URL — ignore */
    }
    const touched = applyFieldsToForm(form, { ...saved, ...prefill });
    if (touched) {
      setDraftRestored(true);
    }
  }, []);

  /* Jump to the first step that has a server-side error. */
  useEffect(() => {
    const errs = state.fieldErrors;
    if (!errs || Object.keys(errs).length === 0) return;
    const idx = fields.findIndex((names) => names.some((n) => errs[n]));
    if (idx >= 0) setStep(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    if (state.error) setTurnstileEpoch((value) => value + 1);
  }, [state]);

  function persistDraft(fd: FormData) {
    try {
      const obj: Record<string, string | string[]> = {};
      for (const name of [
        "requestType",
        "dailyVolumeBand",
        "monthlyVolumeBand",
        "ticketSize",
        "urgency",
        "countriesInvolved",
        "requiredSpeed",
        "jurisdiction",
        "kycReadiness",
        "kycNotes",
        "partnerRequirements",
        "notes",
        "companyName",
        "website",
        "companyJurisdiction",
        "contactName",
        "contactRole",
        "telegram",
        "phone",
        "email",
      ]) {
        const v = fd.get(name);
        if (typeof v === "string" && v) obj[name] = v;
      }
      const banks = fd.getAll("banks").filter((b): b is string => typeof b === "string");
      const methods = fd.getAll("methods").filter((m): m is string => typeof m === "string");
      if (banks.length) obj.banks = banks;
      if (methods.length) obj.methods = methods;
      localStorage.setItem(DRAFT_KEY, JSON.stringify(obj));
      setDraftSaved(true);
    } catch {
      /* storage unavailable — skip autosave */
    }
  }

  function handleFormChange() {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    if (Object.keys(localErrors).length) setLocalErrors({});
    persistDraft(fd);
  }

  function goTo(next: number) {
    setStep(next);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function handleNext() {
    const form = formRef.current;
    if (!form) return;
    const errors = validateFields(fields[step], new FormData(form));
    if (Object.keys(errors).length) {
      setLocalErrors(errors);
      return;
    }
    setLocalErrors({});
    goTo(step + 1);
  }

  return (
    <div className="fin-onboarding-flow">
      <form
        ref={formRef}
        action={formAction}
        onChange={handleFormChange}
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            step < lastStep &&
            (e.target as HTMLElement).tagName !== "TEXTAREA"
          ) {
            e.preventDefault();
            handleNext();
          }
        }}
        className="card scroll-mt-24 overflow-hidden"
      >
        {/* Honeypot — humans never see or fill this */}
        <input
          type="text"
          name="website_hp"
          tabIndex={-1}
          autoComplete="off"
          className="hidden"
          aria-hidden
        />

        {/* Progress */}
        <div className="border-b border-black/[0.07] bg-white px-6 py-5 sm:px-7">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              Step {step + 1} of {labels.length}
              <span className="ml-2 normal-case tracking-normal text-slate-400">
                · {labels[step]}
              </span>
            </p>
            {loggedIn ? (
              <p className="text-[11px] text-slate-400">Submitting as {loggedInCompany}</p>
            ) : null}
          </div>
          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-black/[0.06]">
            <div
              className="h-full rounded-full bg-[#07152e] transition-all duration-300"
              style={{ width: `${((step + 1) / labels.length) * 100}%` }}
            />
          </div>
          <div className="mt-2.5 hidden gap-1 sm:flex">
            {labels.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => i < step && goTo(i)}
                disabled={i > step}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                  i === step && "bg-[#07152e] text-white",
                  i < step && "text-slate-500 hover:bg-black/[0.04] hover:text-slate-800",
                  i > step && "cursor-default text-slate-400",
                )}
              >
                {i < step ? "✓ " : ""}
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-5 p-6 sm:p-7">
          {/* ── Step 1 — Requirement ── */}
          <div className={step === 0 ? "space-y-5" : "hidden"}>
            <Field label="Request type" error={fe.requestType}>
              <RadioCards name="requestType" options={REQUEST_TYPE_CHOICES} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Daily volume" error={fe.dailyVolumeBand}>
                <Select
                  name="dailyVolumeBand"
                  options={DAILY_VOLUME_BANDS}
                  placeholder="Select daily volume"
                />
              </Field>
              <Field label="Monthly volume" error={fe.monthlyVolumeBand}>
                <Select
                  name="monthlyVolumeBand"
                  options={MONTHLY_VOLUME_BANDS}
                  placeholder="Select monthly volume"
                />
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Expected ticket size"
                error={fe.ticketSize}
                hint="Optional — typical size per transaction"
              >
                <input
                  name="ticketSize"
                  className="input"
                  placeholder="e.g. ₹20–50 lakh per ticket"
                  autoComplete="off"
                />
              </Field>
              <Field
                label="Required settlement speed"
                error={fe.requiredSpeed}
                hint="How fast each leg needs to clear once terms are agreed"
              >
                <Select
                  name="requiredSpeed"
                  options={SPEED_OPTIONS}
                  placeholder="Select settlement speed"
                />
              </Field>
            </div>
            <Field label="Urgency" error={fe.urgency}>
              <RadioCards name="urgency" options={URGENCY_OPTIONS} defaultValue="STANDARD" />
            </Field>
          </div>

          {/* ── Step 2 — Coverage ── */}
          <div className={step === 1 ? "space-y-5" : "hidden"}>
            <Field label="Banks where you need coverage" error={fe.banks}>
              <CheckboxGrid name="banks" options={BANK_OPTIONS} cols={3} />
            </Field>
            <Field label="Methods / rails" error={fe.methods}>
              <CheckboxGrid name="methods" options={METHOD_OPTIONS} cols={3} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Operating jurisdiction(s)" error={fe.jurisdiction}>
                <input
                  name="jurisdiction"
                  className="input"
                  placeholder="e.g. India + UAE"
                  autoComplete="off"
                />
              </Field>
              <Field
                label="Countries involved"
                error={fe.countriesInvolved}
                hint="Optional — every country funds will move through"
              >
                <input
                  name="countriesInvolved"
                  className="input"
                  placeholder="e.g. India, UAE, Singapore"
                  autoComplete="off"
                />
              </Field>
            </div>
          </div>

          {/* ── Step 3 — Compliance ── */}
          <div className={step === 2 ? "space-y-5" : "hidden"}>
            <Field label="KYC / KYB readiness" error={fe.kycReadiness}>
              <Select
                name="kycReadiness"
                options={KYC_READINESS_OPTIONS}
                placeholder="Select readiness"
              />
            </Field>
            <Field
              label="Compliance / licensing notes"
              error={fe.kycNotes}
              hint="Optional — licences, registrations, existing audits"
            >
              <textarea
                name="kycNotes"
                rows={3}
                className="input"
                placeholder="Anything that speeds up review"
              />
            </Field>
            <Field
              label="Preferred partner requirements"
              error={fe.partnerRequirements}
              hint="Optional — anything you need from a partner specifically"
            >
              <textarea
                name="partnerRequirements"
                rows={3}
                className="input"
                placeholder="e.g. must support UPI, must have UAE entity"
              />
            </Field>
            <Field label="Anything else" error={fe.notes} hint="Optional">
              <textarea
                name="notes"
                rows={3}
                className="input"
                placeholder="Context, constraints, timelines"
              />
            </Field>
          </div>

          {/* ── Step 4 — Company & access (only when logged out) ── */}
          {!loggedIn ? (
            <div className={step === 3 ? "space-y-5" : "hidden"}>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Company name" error={fe.companyName}>
                  <input
                    name="companyName"
                    className="input"
                    placeholder="Acme Payments Ltd"
                    autoComplete="organization"
                  />
                </Field>
                <Field label="Website" error={fe.website} hint="Optional">
                  <input name="website" className="input" placeholder="https://" autoComplete="url" />
                </Field>
                <Field label="Registration jurisdiction" error={fe.companyJurisdiction}>
                  <input
                    name="companyJurisdiction"
                    className="input"
                    placeholder="e.g. UAE, Singapore, UK"
                  />
                </Field>
                <Field label="Contact name" error={fe.contactName}>
                  <input
                    name="contactName"
                    className="input"
                    placeholder="Full name"
                    autoComplete="name"
                  />
                </Field>
                <Field label="Role" error={fe.contactRole} hint="Optional">
                  <input name="contactRole" className="input" placeholder="e.g. Head of Treasury" />
                </Field>
                <Field label="Telegram" error={fe.telegram} hint="Optional">
                  <input name="telegram" className="input" placeholder="@handle" />
                </Field>
                <Field label="Phone" error={fe.phone} hint="Optional" className="sm:col-span-2">
                  <input
                    name="phone"
                    className="input"
                    placeholder="+971 …"
                    autoComplete="tel"
                    inputMode="tel"
                  />
                </Field>
              </div>
              <div className="rounded-lg border border-black/[0.07] bg-black/[0.015] p-4">
                <p className="text-xs font-semibold text-slate-700">Workspace access</p>
                <p className="mt-0.5 text-[11.5px] text-slate-500">
                  Creates your company workspace to track status and introductions — no
                  password to invent, you&apos;ll be signed in immediately after submitting.
                </p>
                <div className="mt-3">
                  <Field label="Work email" error={fe.email}>
                    <input
                      name="email"
                      type="email"
                      className="input"
                      placeholder="you@company.com"
                      autoComplete="email"
                    />
                  </Field>
                </div>
              </div>
            </div>
          ) : null}

          {step === lastStep ? <TurnstileField resetKey={turnstileEpoch} /> : null}
          <FormError message={state.error} />

          {/* Navigation */}
          <div className="flex items-center justify-between gap-4 border-t border-black/[0.07] pt-5">
            <div className="flex items-center gap-3">
              {step > 0 ? (
                <button type="button" onClick={() => goTo(step - 1)} className="btn btn-ghost">
                  ← Back
                </button>
              ) : null}
              <p className="hidden text-[11px] text-slate-400 sm:block">
                {draftRestored && !draftSaved
                  ? "Draft restored"
                  : draftSaved
                    ? "Draft saved on this device"
                    : ""}
              </p>
            </div>
            {step < lastStep ? (
              <button type="button" onClick={handleNext} className="btn btn-gold px-6">
                Continue →
              </button>
            ) : (
              <SubmitButton className="btn btn-gold px-6" pendingLabel="Submitting…">
                Submit request
              </SubmitButton>
            )}
          </div>

          {step === lastStep ? (
            <p className="text-[11px] leading-relaxed text-slate-400">
              By submitting you confirm the information is accurate and that you act for the
              company named above. Your details are visible to network operations only.
            </p>
          ) : null}
        </div>
      </form>

    </div>
  );
}
