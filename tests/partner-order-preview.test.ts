import assert from "node:assert/strict";
import test from "node:test";
import {
  PARTNER_PREVIEW_RAIL_NOTES,
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
      { flow: "Pay-in", rail: "UPI", amountInr: 5_000 },
      { flow: "Pay-out", rail: "UPI", amountInr: 12_500 },
      { flow: "Pay-in", rail: "IMPS", amountInr: 48_000 },
      { flow: "Pay-out", rail: "NEFT", amountInr: 165_000 },
      { flow: "Pay-in", rail: "RTGS", amountInr: 250_000 },
    ],
  );
});

test("every preview rail explains its operating band", () => {
  assert.match(PARTNER_PREVIEW_RAIL_NOTES.UPI, /₹1 lakh/);
  assert.match(PARTNER_PREVIEW_RAIL_NOTES.IMPS, /₹5 lakh/);
  assert.match(PARTNER_PREVIEW_RAIL_NOTES.RTGS, /₹2 lakh minimum/);
  assert.match(PARTNER_PREVIEW_RAIL_NOTES.NEFT, /larger tickets/);
});

test("expired preview tickets rotate to a new valid order", () => {
  const expiring = { ...createPartnerPreviewOrder(0, 0), expiresInSeconds: 1 };
  const [replacement] = tickPartnerPreviewOrders([expiring]);
  assert.equal(replacement.generation, 1);
  assert.notEqual(replacement.reference, expiring.reference);
  assert.match(replacement.reference, /^PX-(?:IN|OUT)-\d{4,8}$/);
  assert.equal(replacement.freshTicks, 4);
});
