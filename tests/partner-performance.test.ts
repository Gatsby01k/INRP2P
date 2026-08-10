import assert from "node:assert/strict";
import test from "node:test";
import { indiaPerformancePeriods, summarizePartnerPerformance } from "../src/lib/partner-performance";

test("performance periods use India calendar boundaries", () => {
  const periods = indiaPerformancePeriods(new Date("2026-08-10T20:00:00.000Z"));

  assert.equal(periods.todayStart.toISOString(), "2026-08-10T18:30:00.000Z");
  assert.equal(periods.sevenDaysStart.toISOString(), "2026-08-04T18:30:00.000Z");
  assert.equal(periods.monthStart.toISOString(), "2026-07-31T18:30:00.000Z");
  assert.equal(periods.historyStart.toISOString(), "2026-07-31T18:30:00.000Z");
});

test("performance totals include only completed timestamps inside each period", () => {
  const periods = indiaPerformancePeriods(new Date("2026-08-10T20:00:00.000Z"));
  const summary = summarizePartnerPerformance([
    { type: "PAY_IN", amountInr: 100_000, partnerFeeInr: 1_000, completedAt: new Date("2026-08-10T19:00:00.000Z") },
    { type: "PAY_OUT", amountInr: "50000", partnerFeeInr: 500, completedAt: new Date("2026-08-05T00:00:00.000Z") },
    { type: "PAY_IN", amountInr: 25_000, partnerFeeInr: 250, completedAt: new Date("2026-08-02T00:00:00.000Z") },
    { type: "PAY_OUT", amountInr: 999_999, partnerFeeInr: 9_999, completedAt: new Date("2026-08-11T00:00:00.000Z") },
    { type: "PAY_OUT", amountInr: 10_000, partnerFeeInr: 100, completedAt: null },
  ], periods);

  assert.deepEqual(summary.today, { orders: 1, volumeInr: 100_000, feeInr: 1_000 });
  assert.deepEqual(summary.sevenDays, { orders: 2, volumeInr: 150_000, feeInr: 1_500 });
  assert.deepEqual(summary.month, { orders: 3, volumeInr: 175_000, feeInr: 1_750 });
  assert.deepEqual(summary.payIn, { orders: 2, volumeInr: 125_000, feeInr: 1_250 });
  assert.deepEqual(summary.payOut, { orders: 1, volumeInr: 50_000, feeInr: 500 });
  assert.equal(summary.averageTicketInr, 175_000 / 3);
});

test("performance summary returns honest zero values before the first completed order", () => {
  const periods = indiaPerformancePeriods(new Date("2026-08-10T12:00:00.000Z"));
  const summary = summarizePartnerPerformance([], periods);

  assert.equal(summary.today.orders, 0);
  assert.equal(summary.sevenDays.feeInr, 0);
  assert.equal(summary.month.volumeInr, 0);
  assert.equal(summary.averageTicketInr, 0);
});
