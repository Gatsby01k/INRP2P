import { spawnSync } from "node:child_process";
import path from "node:path";
import { legacyMigrationResolutionPlan } from "./database-production-plan.mjs";

if (process.env.VERCEL_ENV !== "production") {
  console.log("Production database release: skipped outside Vercel Production.");
  process.exit(0);
}

if (process.env.VERCEL_GIT_COMMIT_REF !== "main") {
  throw new Error("Production database release is restricted to the main branch.");
}

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const hasDirectDatabaseUrl = Boolean(process.env.DATABASE_URL_UNPOOLED);
if (!hasDatabaseUrl && !hasDirectDatabaseUrl) {
  console.log("Prisma migration deploy skipped: this Vercel project has no complete migration connection pair.");
  process.exit(0);
}
if (!hasDatabaseUrl || !hasDirectDatabaseUrl) {
  throw new Error("Production database migration requires both DATABASE_URL and DATABASE_URL_UNPOOLED; refusing to deploy an application against an unmigrated schema.");
}

const executable = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.cmd" : "prisma",
);

function prisma(label, args, env) {
  console.log(`Production database migration: ${label}.`);
  const result = spawnSync(executable, args, { env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Production database migration failed for ${label}.`);
}

const { PrismaClient } = await import("@prisma/client");
async function schemaSnapshot(db) {
  const rows = await db.$queryRawUnsafe(`
    SELECT
      to_regclass('public."_prisma_migrations"') IS NOT NULL AS "migrationTableReady",
      (
        to_regtype('public."DepositStatus"') IS NOT NULL AND
        to_regclass('public."PartnerDeposit"') IS NOT NULL AND
        to_regclass('public."PartnerDeposit_reference_key"') IS NOT NULL AND
        to_regclass('public."PartnerDeposit_partnerId_createdAt_idx"') IS NOT NULL AND
        EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_schema = 'public'
            AND table_name = 'PartnerDeposit'
            AND constraint_name = 'PartnerDeposit_partnerId_fkey'
        )
      ) AS "partnerReserveReady",
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'PartnerDeposit'
          AND column_name = 'destinationAddress'
      ) AS "directReserveReady",
      (
        to_regtype('public."ProcessingOrderType"') IS NOT NULL AND
        to_regtype('public."ProcessingOrderStatus"') IS NOT NULL AND
        to_regtype('public."PaymentRailType"') IS NOT NULL AND
        to_regtype('public."PaymentRailStatus"') IS NOT NULL AND
        to_regtype('public."ProcessingSettlementStatus"') IS NOT NULL AND
        to_regclass('public."PartnerProcessingAccount"') IS NOT NULL AND
        to_regclass('public."PartnerPaymentRail"') IS NOT NULL AND
        to_regclass('public."ProcessingSettlement"') IS NOT NULL AND
        to_regclass('public."ProcessingOrder"') IS NOT NULL AND
        to_regclass('public."ProcessingOrderEvent"') IS NOT NULL
      ) AS "processingDeskReady"
  `);
  return rows[0];
}

async function completedMigrations(db, migrationTableReady) {
  if (!migrationTableReady) return [];
  const rows = await db.$queryRawUnsafe(`
    SELECT migration_name
    FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
  `);
  return rows.map((row) => row.migration_name);
}

async function reconcileLegacySchema(db, env, label) {
  const schema = await schemaSnapshot(db);
  const completed = await completedMigrations(db, schema.migrationTableReady);
  const plan = legacyMigrationResolutionPlan(schema, completed);

  for (const migration of plan.resolve) {
    prisma(
      `${label}: record verified legacy migration ${migration}`,
      ["migrate", "resolve", "--applied", migration],
      env,
    );
  }
}

const directDb = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_UNPOOLED });
try {
  await reconcileLegacySchema(directDb, process.env, "direct connection");
} finally {
  await directDb.$disconnect();
}

prisma("direct connection deploy", ["migrate", "deploy"], process.env);

const runtimeDb = new PrismaClient();
async function runtimeSchemaReady() {
  const rows = await runtimeDb.$queryRawUnsafe(`
    SELECT
      to_regclass('public."PartnerDeposit"') IS NOT NULL AS "tableReady",
      to_regclass('public."ProcessingOrder"') IS NOT NULL AS "processingOrderReady",
      to_regclass('public."PartnerProcessingAccount"') IS NOT NULL AS "processingAccountReady",
      to_regclass('public."PartnerPaymentRail"') IS NOT NULL AS "paymentRailReady",
      to_regclass('public."ProcessingSettlement"') IS NOT NULL AS "settlementReady",
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'PartnerProfile'
          AND column_name = 'programLevel'
      ) AS "programLevelReady",
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'PartnerDeposit'
          AND column_name = 'destinationAddress'
      ) AS "walletColumnReady"
  `);
  return rows[0]?.tableReady === true &&
    rows[0]?.walletColumnReady === true &&
    rows[0]?.processingOrderReady === true &&
    rows[0]?.processingAccountReady === true &&
    rows[0]?.paymentRailReady === true &&
    rows[0]?.settlementReady === true &&
    rows[0]?.programLevelReady === true;
}

try {
  if (!(await runtimeSchemaReady())) {
    console.warn("Runtime database is behind the direct migration target; applying migrations to DATABASE_URL.");
    const runtimeEnv = {
      ...process.env,
      DATABASE_URL_UNPOOLED: process.env.DATABASE_URL,
    };
    await reconcileLegacySchema(runtimeDb, runtimeEnv, "runtime connection");
    prisma("runtime connection deploy", ["migrate", "deploy"], runtimeEnv);
  }
  if (!(await runtimeSchemaReady())) {
    throw new Error("Production database migration verification failed: reserve or processing tables are missing from the runtime database.");
  }
} finally {
  await runtimeDb.$disconnect();
}

console.log("Production database release completed and verified against runtime.");
