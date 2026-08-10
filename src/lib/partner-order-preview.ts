export type PartnerPreviewOrder = {
  slot: number;
  generation: number;
  reference: string;
  flow: "Pay-in" | "Pay-out";
  rail: "UPI" | "IMPS" | "NEFT" | "RTGS";
  amountInr: number;
  expiresInSeconds: number;
  freshTicks: number;
};

type PreviewOrderScenario = Pick<PartnerPreviewOrder, "flow" | "rail" | "amountInr"> & {
  holdSeconds: number;
};

// Curated preview tickets keep each amount inside the published scheme-level
// rail limits. Actual bank and merchant limits can be lower.
export const PARTNER_PREVIEW_SCENARIOS: readonly PreviewOrderScenario[] = [
  { flow: "Pay-in", rail: "UPI", amountInr: 8_750, holdSeconds: 58 },
  { flow: "Pay-out", rail: "UPI", amountInr: 18_400, holdSeconds: 64 },
  { flow: "Pay-in", rail: "UPI", amountInr: 32_650, holdSeconds: 72 },
  { flow: "Pay-out", rail: "IMPS", amountInr: 54_900, holdSeconds: 80 },
  { flow: "Pay-in", rail: "IMPS", amountInr: 76_500, holdSeconds: 86 },
  { flow: "Pay-out", rail: "UPI", amountInr: 12_250, holdSeconds: 62 },
  { flow: "Pay-in", rail: "IMPS", amountInr: 108_400, holdSeconds: 88 },
  { flow: "Pay-out", rail: "IMPS", amountInr: 146_750, holdSeconds: 94 },
  { flow: "Pay-in", rail: "NEFT", amountInr: 182_500, holdSeconds: 102 },
  { flow: "Pay-out", rail: "RTGS", amountInr: 275_000, holdSeconds: 110 },
  { flow: "Pay-in", rail: "RTGS", amountInr: 360_000, holdSeconds: 118 },
  { flow: "Pay-out", rail: "NEFT", amountInr: 425_000, holdSeconds: 124 },
] as const;

const INITIAL_EXPIRIES = [14, 29, 43, 58, 74] as const;

export function createPartnerPreviewOrder(
  slot: number,
  generation: number,
  initial = false,
): PartnerPreviewOrder {
  const scenarioIndex = (slot + generation * INITIAL_EXPIRIES.length) % PARTNER_PREVIEW_SCENARIOS.length;
  const scenario = PARTNER_PREVIEW_SCENARIOS[scenarioIndex];
  const prefix = scenario.flow === "Pay-in" ? "PX-IN" : "PX-OUT";
  const sequence = 482_731 + (slot * 1_817) + (generation * 7_919);
  const referenceNumber = (sequence % 100_000_000).toString().padStart(6, "0");

  return {
    slot,
    generation,
    reference: `${prefix}-${referenceNumber}`,
    flow: scenario.flow,
    rail: scenario.rail,
    amountInr: scenario.amountInr,
    expiresInSeconds: initial
      ? INITIAL_EXPIRIES[slot]
      : scenario.holdSeconds + ((slot + generation) % 3) * 7,
    freshTicks: initial ? 0 : 4,
  };
}

export function initialPartnerPreviewOrders() {
  return INITIAL_EXPIRIES.map((_, slot) => createPartnerPreviewOrder(slot, 0, true));
}

export function tickPartnerPreviewOrders(orders: readonly PartnerPreviewOrder[]) {
  return orders.map((order) => {
    if (order.expiresInSeconds <= 1) {
      return createPartnerPreviewOrder(order.slot, order.generation + 1);
    }
    return {
      ...order,
      expiresInSeconds: order.expiresInSeconds - 1,
      freshTicks: Math.max(0, order.freshTicks - 1),
    };
  });
}

export function partnerPreviewCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainingSeconds = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}
