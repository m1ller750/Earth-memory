/**
 * Applies pending migrations without seeding.
 * Usage: npm run db:migrate
 */
import { closeDb, getDb, getDbDriver } from "../src/lib/db/client";

async function main() {
  await getDb({ autoSeed: false });
  console.info(`Migrations applied (${await getDbDriver()}).`);
  await closeDb();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await closeDb();
  process.exit(1);
});
