import assert from "node:assert/strict";
import test from "node:test";
import { legacyMigrationResolutionPlan } from "../scripts/database-production-plan.mjs";

const completeLegacySchema = {
  migrationTableReady: true,
  partnerReserveReady: true,
  directReserveReady: true,
  processingDeskReady: true,
};

test("a fresh database does not need legacy migration reconciliation", () => {
  assert.deepEqual(
    legacyMigrationResolutionPlan({ ...completeLegacySchema, migrationTableReady: false }, []),
    { resolve: [] },
  );
});

test("complete but untracked legacy schema is resolved before deploy", () => {
  assert.deepEqual(
    legacyMigrationResolutionPlan(completeLegacySchema, []),
    {
      resolve: [
        "20260719000100_partner_usdt_reserve",
        "20260719000200_direct_trc20_partner_reserve",
        "20260810000100_partner_processing_desk",
      ],
    },
  );
});

test("unapplied or partial legacy schema is left for Prisma to handle safely", () => {
  assert.deepEqual(
    legacyMigrationResolutionPlan(
      { ...completeLegacySchema, partnerReserveReady: false },
      ["20260719000200_direct_trc20_partner_reserve"],
    ),
    {
      resolve: ["20260810000100_partner_processing_desk"],
    },
  );
});
