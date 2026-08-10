import assert from "node:assert/strict";
import test from "node:test";
import {
  TRAINING_SCENARIOS,
  isTrainingAccountEmail,
  isTrainingModeEnabled,
  isTrainingScenario,
  trainingPartnerEmail,
} from "../src/lib/training";
import { TRAINING_HISTORY_ORDERS, TRAINING_QUEUE_ORDERS, trainingOrderFitsRail } from "../src/lib/training-orders";

test("training identities are restricted to the reserved demo domain", () => {
  assert.equal(isTrainingAccountEmail("video-trader@inrp2p.demo"), true);
  assert.equal(isTrainingAccountEmail("VIDEO-TRADER@INRP2P.DEMO"), true);
  assert.equal(isTrainingAccountEmail("partner@example.com"), false);
  assert.equal(isTrainingAccountEmail(null), false);
});

test("training mode requires an explicit environment gate", () => {
  const previous = process.env.TRAINING_MODE_ENABLED;
  process.env.TRAINING_MODE_ENABLED = "true";
  assert.equal(isTrainingModeEnabled(), true);
  process.env.TRAINING_MODE_ENABLED = "false";
  assert.equal(isTrainingModeEnabled(), false);
  if (previous === undefined) delete process.env.TRAINING_MODE_ENABLED;
  else process.env.TRAINING_MODE_ENABLED = previous;
});

test("training journey has deterministic ordered scenarios", () => {
  assert.deepEqual(TRAINING_SCENARIOS.map((scenario) => scenario.code), [
    "NEW",
    "VERIFICATION",
    "RESERVE",
    "ACTIVE",
    "HISTORY",
  ]);
  assert.equal(isTrainingScenario("ACTIVE"), true);
  assert.equal(isTrainingScenario("LIVE"), false);
});

test("training partner defaults to the reserved video identity", () => {
  const previous = process.env.TRAINING_PARTNER_EMAIL;
  delete process.env.TRAINING_PARTNER_EMAIL;
  assert.equal(trainingPartnerEmail(), "video-trader@inrp2p.demo");
  if (previous !== undefined) process.env.TRAINING_PARTNER_EMAIL = previous;
});

test("every training order respects its payment-rail amount band", () => {
  const orders = [...TRAINING_QUEUE_ORDERS, ...TRAINING_HISTORY_ORDERS];
  assert.equal(orders.length, 30);
  assert.equal(orders.every(trainingOrderFitsRail), true);
  assert.equal(orders.some((order) => order.rail === "UPI"), true);
  assert.equal(orders.some((order) => order.rail === "IMPS"), true);
  assert.equal(orders.some((order) => order.rail === "NEFT"), true);
  assert.equal(orders.some((order) => order.rail === "RTGS"), true);
});

test("demo operating figures remain deterministic and commercially plausible", () => {
  assert.equal(TRAINING_HISTORY_ORDERS.length, 24);
  assert.equal(TRAINING_HISTORY_ORDERS.reduce((sum, order) => sum + order.amount, 0), 1_995_947);
  assert.equal(TRAINING_HISTORY_ORDERS.filter((order) => order.dayAgo === 0).reduce((sum, order) => sum + order.amount, 0), 136_598);
  assert.equal(TRAINING_QUEUE_ORDERS.length, 6);
  assert.equal(TRAINING_QUEUE_ORDERS.reduce((sum, order) => sum + order.amount, 0), 568_399);
});
