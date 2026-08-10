export const LEGACY_SCHEMA_MIGRATIONS = [
  {
    name: "20260719000100_partner_usdt_reserve",
    readinessKey: "partnerReserveReady",
  },
  {
    name: "20260719000200_direct_trc20_partner_reserve",
    readinessKey: "directReserveReady",
  },
  {
    name: "20260810000100_partner_processing_desk",
    readinessKey: "processingDeskReady",
  },
];

export function legacyMigrationResolutionPlan(schema, completedMigrationNames) {
  if (!schema.migrationTableReady) return { resolve: [] };

  const completed = new Set(completedMigrationNames);
  const resolve = [];

  for (const migration of LEGACY_SCHEMA_MIGRATIONS) {
    if (completed.has(migration.name)) continue;
    if (schema[migration.readinessKey] === true) resolve.push(migration.name);
  }

  return { resolve };
}
