export const TRAINING_EMAIL_SUFFIX = "@inrp2p.demo";

export const TRAINING_SCENARIOS = [
  {
    code: "NEW",
    step: "01",
    label: "Application received",
    description: "The partner has signed in for the first time and sees the exact activation path.",
    outcome: "Applied",
    detail: "No reserve · no order access",
  },
  {
    code: "VERIFICATION",
    step: "02",
    label: "Review in progress",
    description: "Identity and screening are complete; bank ownership and references still need review.",
    outcome: "2 passed · 3 open",
    detail: "Operator review queue",
  },
  {
    code: "RESERVE",
    step: "03",
    label: "Activation ready",
    description: "Review is approved and the partner can walk through the reserve instruction flow.",
    outcome: "400 USDT",
    detail: "Demo reserve workflow",
  },
  {
    code: "ACTIVE",
    step: "04",
    label: "Live shift",
    description: "Reserve, payment rails and operating limit are active with an eligible order queue.",
    outcome: "6 eligible orders",
    detail: "₹7.5 lakh approved limit",
  },
  {
    code: "HISTORY",
    step: "05",
    label: "Month-to-date desk",
    description: "A full operating view with completed work, exceptions, commission and settlement.",
    outcome: "24 completed",
    detail: "₹19.96 lakh processed",
  },
] as const;

export type TrainingScenario = (typeof TRAINING_SCENARIOS)[number]["code"];

export function isTrainingModeEnabled() {
  return process.env.TRAINING_MODE_ENABLED?.trim().toLowerCase() === "true";
}

export function isTrainingAccountEmail(email?: string | null) {
  return Boolean(email?.trim().toLowerCase().endsWith(TRAINING_EMAIL_SUFFIX));
}

export function trainingPartnerEmail() {
  return (process.env.TRAINING_PARTNER_EMAIL?.trim().toLowerCase() || `video-trader${TRAINING_EMAIL_SUFFIX}`);
}

export function isTrainingScenario(value: string): value is TrainingScenario {
  return TRAINING_SCENARIOS.some((scenario) => scenario.code === value);
}

export function trainingScenario(value?: string | null) {
  return TRAINING_SCENARIOS.find((scenario) => scenario.code === value) ?? TRAINING_SCENARIOS[0];
}

export function assertTrainingMode() {
  if (!isTrainingModeEnabled()) {
    throw new Error("Training Mode is disabled. Set TRAINING_MODE_ENABLED=true only on an isolated staging deployment.");
  }
  const email = trainingPartnerEmail();
  if (!isTrainingAccountEmail(email)) {
    throw new Error(`TRAINING_PARTNER_EMAIL must use the ${TRAINING_EMAIL_SUFFIX} domain.`);
  }
}
