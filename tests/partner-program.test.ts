import assert from "node:assert/strict";
import test from "node:test";
import {
  PARTNER_PROGRAM_LEVELS,
  partnerOrderCommission,
  partnerProgramLevel,
} from "../src/lib/partner-program";

test("partner program defaults safely to Starter", () => {
  assert.equal(partnerProgramLevel().code, "STARTER");
  assert.equal(partnerProgramLevel("unknown").code, "STARTER");
  assert.equal(partnerProgramLevel("pro").code, "PRO");
});

test("partner commission preview follows the selected level", () => {
  const amount = 100_000;
  assert.deepEqual(
    PARTNER_PROGRAM_LEVELS.map((level) => partnerOrderCommission(amount, level)),
    [1_000, 1_250, 1_500, 2_000],
  );
  assert.equal(partnerOrderCommission(8_750, partnerProgramLevel("VERIFIED")), 109.38);
});

test("each operating level requires a reserve equal to its monthly base", () => {
  assert.deepEqual(
    PARTNER_PROGRAM_LEVELS.map((level) => level.activationReserveUsdt),
    [400, 700, 1_000, 1_500],
  );
  for (const level of PARTNER_PROGRAM_LEVELS) {
    assert.equal(level.activationReserveUsdt, level.monthlyBaseUsdt);
  }
});
