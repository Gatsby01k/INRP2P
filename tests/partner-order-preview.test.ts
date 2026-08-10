import assert from "node:assert/strict";
import test from "node:test";
import {
  PARTNER_PREVIEW_SCENARIOS,
  createPartnerPreviewOrder,
  initialPartnerPreviewOrders,
  tickPartnerPreviewOrders,
} from "../src/lib/partner-order-preview";

test("preview amounts stay inside published payment-rail bands", () => {
  for (const scenario of PARTNER_PREVIEW_SCENARIOS) {
    if (scenario.rail === "UPI") assert.ok(scenario.amountInr <= 100_000);
    if (scenario.rail === "IMPS") assert.ok(scenario.amountInr <= 500_000);
    if (scenario.rail === "RTGS") assert.ok(scenario.amountInr >= 200_000);
    assert.ok(scenario.amountInr > 0);
  }
});

test("initial queue opens with five practical INR tickets", () => {
  assert.deepEqual(
    initialPartnerPreviewOrders().map(({ flow, rail, amountInr }) => ({ flow, rail, amountInr })),
    [
      { flow: "Pay-in", rail: "UPI", amountInr: 8_750 },
      { flow: "Pay-out", rail: "UPI", amountInr: 18_400 },
      { flow: "Pay-in", rail: "UPI", amountInr: 32_650 },
      { flow: "Pay-out", rail: "IMPS", amountInr: 54_900 },
      { flow: "Pay-in", rail: "IMPS", amountInr: 76_500 },
    ],
  );
});

test("expired preview tickets rotate to a new valid order", () => {
  const expiring = { ...createPartnerPreviewOrder(0, 0), expiresInSeconds: 1 };
  const [replacement] = tickPartnerPreviewOrders([expiring]);
  assert.equal(replacement.generation, 1);
  assert.notEqual(replacement.reference, expiring.reference);
  assert.match(replacement.reference, /^PX-(?:IN|OUT)-\d{4,8}$/);
  assert.equal(replacement.freshTicks, 4);
});
