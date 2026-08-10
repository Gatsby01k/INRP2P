import { db } from "../src/lib/db";
import { isTrainingScenario } from "../src/lib/training";
import { applyTrainingScenario } from "../src/lib/training-workspace";

async function main() {
  const requested = (process.env.TRAINING_SCENARIO ?? "HISTORY").trim().toUpperCase();
  if (!isTrainingScenario(requested)) {
    throw new Error("TRAINING_SCENARIO must be NEW, VERIFICATION, RESERVE, ACTIVE or HISTORY.");
  }

  const result = await applyTrainingScenario(requested, { label: "Training seed" });
  console.log(`Training workspace prepared: ${result.scenario} · ${result.partnerUserId}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Training seed failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
