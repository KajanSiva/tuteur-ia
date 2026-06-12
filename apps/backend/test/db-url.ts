import "dotenv/config";

export const baseDatabaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://tuteur:tuteur@localhost:5432/tuteur";

export const testDbName = "tuteur_test";

function withDatabase(url: string, db: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${db}`;
  return parsed.toString();
}

export const testDatabaseUrl = withDatabase(baseDatabaseUrl, testDbName);
