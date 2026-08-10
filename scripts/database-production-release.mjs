import { spawnSync } from "node:child_process";
import path from "node:path";

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

function migrate(label, env) {
  console.log(`Production database migration: ${label}.`);
  const result = spawnSync(executable, ["migrate", "deploy"], { env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Production database migration failed for ${label}.`);
}

migrate("direct connection", process.env);

const { PrismaClient } = await import("@prisma/client");
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
    migrate("runtime connection", {
      ...process.env,
      DATABASE_URL_UNPOOLED: process.env.DATABASE_URL,
    });
  }
  if (!(await runtimeSchemaReady())) {
    throw new Error("Production database migration verification failed: reserve or processing tables are missing from the runtime database.");
  }
} finally {
  await runtimeDb.$disconnect();
}

console.log("Production database release completed and verified against runtime.");
