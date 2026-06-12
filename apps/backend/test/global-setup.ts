import { execSync } from "node:child_process";

import pg from "pg";

import { baseDatabaseUrl, testDatabaseUrl, testDbName } from "./db-url.js";

// Provisions a dedicated, isolated test database (created if missing, then
// migrated and seeded) before the suite runs.
export default async function setup() {
  const admin = new pg.Client({ connectionString: baseDatabaseUrl });
  await admin.connect();
  const { rowCount } = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [testDbName],
  );
  if (!rowCount) {
    await admin.query(`CREATE DATABASE "${testDbName}"`);
  }
  await admin.end();

  const env = { ...process.env, DATABASE_URL: testDatabaseUrl };
  execSync("pnpm exec prisma migrate deploy", { env, stdio: "inherit" });
  execSync("pnpm exec tsx prisma/seed.ts", { env, stdio: "inherit" });
}
