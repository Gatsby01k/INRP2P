export const TRAINING_EMAIL_SUFFIX = "@inrp2p.demo";

export const TRAINING_SCENARIOS = [
  {
    code: "NEW",
    step: "01",
    label: "New trader",
    description: "Fresh application with no verification, reserve or order history.",
  },
  {
    code: "VERIFICATION",
    step: "02",
    label: "Verification in progress",
    description: "A live review checklist with mixed completed and pending checks.",
  },
  {
    code: "RESERVE",
    step: "03",
    label: "Ready to activate",
    description: "Verification approved; the trader can create a simulated reserve instruction.",
  },
  {
    code: "ACTIVE",
    step: "04",
    label: "Order desk ready",
    description: "Training reserve, payment rails, operating limit and order queue enabled.",
  },
  {
    code: "HISTORY",
    step: "05",
    label: "Established desk",
    description: "Completed order history, commission ledger, active work and settlement record.",
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
