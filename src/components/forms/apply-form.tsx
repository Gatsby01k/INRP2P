"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitPartnerApplication } from "@/app/actions/public";
import { TurnstileField } from "@/components/forms/turnstile-field";
import { SubmitButton } from "@/components/submit-button";
import { CheckboxGrid, Field, FormError, FormSection } from "@/components/ui";
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

const DRAFT_KEY = "inrp2p-apply-draft-v1";

const TEXT_FIELDS = [
  "displayName",
  "legalName",
  "contactName",
  "email",
  "telegram",
  "phone",
  "experienceBand",
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

function Select({
  name,
  options,
  placeholder,
  required,
  error,
}: {
  name: string;
  options: readonly string[];
  placeholder: string;
  required?: boolean;
  error?: string;
}) {
  return (
    <select
      name={name}
      required={required}
      className="input"
      defaultValue=""
      aria-invalid={Boolean(error)}
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

export function ApplyForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(
    submitPartnerApplication,
    {},
  );
  const fe = state.fieldErrors ?? {};
  const formRef = useRef<HTMLFormElement>(null);
  const [draftState, setDraftState] = useState<"" | "restored" | "saved">("");
  const [turnstileEpoch, setTurnstileEpoch] = useState(0);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    let saved: Record<string, string | string[]> = {};
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) saved = JSON.parse(raw) as Record<string, string | string[]>;
    } catch {
      // A missing or corrupt local draft should never block an application.
    }

    let prefill: Record<string, string | string[]> = {};
    try {
      prefill = partnerFormPrefill(new URLSearchParams(window.location.search));
    } catch {
      // Ignore malformed query parameters and keep the form usable.
    }

    if (applyFieldsToForm(form, { ...saved, ...prefill })) setDraftState("restored");
  }, []);

  useEffect(() => {
    if (!state.error && !Object.keys(state.fieldErrors ?? {}).length) return;
    setTurnstileEpoch((value) => value + 1);
    window.requestAnimationFrame(() => {
      const firstInvalid = formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']");
      firstInvalid?.focus({ preventScroll: true });
      firstInvalid?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [state]);

  function saveDraft() {
    const form = formRef.current;
    if (!form) return;
    try {
      const data = new FormData(form);
      const draft: Record<string, string | string[]> = {};
      for (const field of TEXT_FIELDS) {
        const value = data.get(field);
        if (typeof value === "string" && value) draft[field] = value;
      }
      for (const field of LIST_FIELDS) {
        const values = data.getAll(field).map(String);
        if (values.length) draft[field] = values;
      }
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      setDraftState("saved");
    } catch {
      // Local storage is an enhancement, not a submission dependency.
    }
  }

  return (
    <div className="fin-onboarding-flow">
      <div className="fin-apply-intro">
        <div>
          <span>Partner access</span>
          <strong>One application · no four-step setup</strong>
        </div>
        <p>Your workspace opens after email verification. Operations completes approval inside the workspace.</p>
      </div>

      <form
        ref={formRef}
        action={formAction}
        onChange={saveDraft}
        className="space-y-5"
      >
        <input
          type="text"
          name="website_hp"
          tabIndex={-1}
          autoComplete="off"
          className="hidden"
          aria-hidden
        />

        <FormError message={state.error} />

        <FormSection
          title="Create your workspace"
          sub="Use the details of the person who will operate the desk. These details are private and reviewed by INRP2P operations."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Desk or operating name" error={fe.displayName}>
              <input
                name="displayName"
                required
                minLength={2}
                className="input"
                placeholder="Your desk name"
                autoComplete="organization"
                aria-invalid={Boolean(fe.displayName)}
              />
            </Field>
            <Field label="Your name" error={fe.contactName}>
              <input
                name="contactName"
                required
                minLength={2}
                className="input"
                placeholder="Full name"
                autoComplete="name"
                aria-invalid={Boolean(fe.contactName)}
              />
            </Field>
            <Field
              label="Work email"
              error={fe.email}
              hint="Use an address not already linked to another INRP2P account."
            >
              <input
                name="email"
                type="email"
                required
                className="input"
                placeholder="you@company.com"
                autoComplete="email"
                aria-invalid={Boolean(fe.email)}
              />
            </Field>
            <Field label="Telegram" error={fe.telegram} hint="Recommended for order alerts">
              <input
                name="telegram"
                className="input"
                placeholder="@username"
                autoComplete="off"
                aria-invalid={Boolean(fe.telegram)}
              />
            </Field>
            <Field label="Phone / WhatsApp" error={fe.phone} hint="Optional">
              <input
                name="phone"
                className="input"
                placeholder="+91 …"
                autoComplete="tel"
                aria-invalid={Boolean(fe.phone)}
              />
            </Field>
            <Field label="Processing experience" error={fe.experienceBand}>
              <Select
                name="experienceBand"
                options={EXPERIENCE_BANDS}
                placeholder="Select experience"
                required
                error={fe.experienceBand}
              />
            </Field>
          </div>
        </FormSection>

        <FormSection
          title="What can you process?"
          sub="Give us a realistic operating snapshot. You can update capacity later from your workspace."
        >
          <Field label="Supported flows" error={fe.directions} hint="Select every flow you can run today">
            <CheckboxGrid name="directions" options={DIRECTION_OPTIONS} cols={3} />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Daily INR capacity" error={fe.dailyCapacityBand}>
              <Select
                name="dailyCapacityBand"
                options={CAPACITY_BANDS}
                placeholder="Select daily capacity"
                required
                error={fe.dailyCapacityBand}
              />
            </Field>
            <Field label="Operating reserve available" error={fe.reserveBand}>
              <Select
                name="reserveBand"
                options={RESERVE_BANDS}
                placeholder="Select reserve band"
                required
                error={fe.reserveBand}
              />
            </Field>
          </div>

          <Field label="Banks you can use" error={fe.banks} hint="Select at least one">
            <CheckboxGrid name="banks" options={BANK_OPTIONS} cols={3} />
          </Field>

          <Field label="Payment rails" error={fe.methods} hint="Select at least one">
            <CheckboxGrid name="methods" options={METHOD_OPTIONS} cols={3} />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Working hours" error={fe.workingHours} hint="Include timezone">
              <input
                name="workingHours"
                required
                minLength={2}
                className="input"
                placeholder="09:00–23:00 IST, daily"
                aria-invalid={Boolean(fe.workingHours)}
              />
            </Field>
            <Field label="Coverage" error={fe.jurisdictions}>
              <input
                name="jurisdictions"
                required
                minLength={2}
                className="input"
                defaultValue="India"
                placeholder="India nationwide"
                aria-invalid={Boolean(fe.jurisdictions)}
              />
            </Field>
          </div>
        </FormSection>

        <details className="fin-optional-panel">
          <summary>
            <span>
              <strong>Add verification details</strong>
              <small>Optional now · useful for a faster review</small>
            </span>
            <i aria-hidden>+</i>
          </summary>
          <div className="fin-optional-panel-body">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Legal entity name" error={fe.legalName} hint="If registered">
                <input name="legalName" className="input" placeholder="Registered entity" />
              </Field>
              <Field label="Operating country" error={fe.operatingCountry}>
                <input name="operatingCountry" className="input" defaultValue="India" />
              </Field>
              <Field label="Monthly capacity" error={fe.monthlyCapacityBand} hint="Optional">
                <input name="monthlyCapacityBand" className="input" placeholder="e.g. ₹50 crore / month" />
              </Field>
              <Field label="Preferred settlement" error={fe.settlementPreference} hint="Optional">
                <input name="settlementPreference" className="input" placeholder="e.g. same-day reconciliation" />
              </Field>
              <Field label="Minimum ticket" error={fe.minTicket} hint="Optional">
                <input name="minTicket" className="input" placeholder="e.g. ₹25,000" />
              </Field>
              <Field label="Maximum ticket" error={fe.maxTicket} hint="Optional">
                <input name="maxTicket" className="input" placeholder="e.g. ₹5,00,000" />
              </Field>
            </div>

            <Field
              label="Evidence available"
              error={fe.complianceFlags}
              hint="Select only documents or controls you can provide during review"
            >
              <CheckboxGrid name="complianceFlags" options={COMPLIANCE_FLAG_OPTIONS} cols={2} />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Verification notes" error={fe.complianceNotes} hint="Optional">
                <textarea name="complianceNotes" rows={3} className="input" placeholder="Entity, policies or documentation details" />
              </Field>
              <Field label="References" error={fe.references} hint="Optional">
                <textarea name="references" rows={3} className="input" placeholder="Companies or operators who can reference your work" />
              </Field>
              <Field label="Risk disclosures" error={fe.riskNotes} hint="Optional">
                <textarea name="riskNotes" rows={3} className="input" placeholder="Relevant limitations or prior issues" />
              </Field>
              <Field label="Anything else" error={fe.additionalComments} hint="Optional">
                <textarea name="additionalComments" rows={3} className="input" placeholder="Additional operating context" />
              </Field>
            </div>
          </div>
        </details>

        <div className="fin-apply-submit">
          <div>
            <p><span>1</span> Submit profile</p>
            <p><span>2</span> Verify email</p>
            <p><span>3</span> Enter workspace</p>
          </div>
          <p>
            Submitting creates a private workspace; it does not guarantee approval or order access.
            Operations enables processing only after review and activation.
          </p>
          <TurnstileField resetKey={turnstileEpoch} />
          <SubmitButton className="btn btn-gold min-h-12 w-full sm:w-auto" pendingLabel="Creating workspace…">
            Create partner workspace →
          </SubmitButton>
        </div>
      </form>

      {draftState ? (
        <p className="mt-4 text-[10px] text-slate-400">
          {draftState === "restored" ? "Draft restored on this device" : "Draft saved on this device"}
        </p>
      ) : null}
    </div>
  );
}
