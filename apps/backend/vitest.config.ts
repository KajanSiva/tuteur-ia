import { defineConfig } from "vitest/config";

import { testDatabaseUrl } from "./test/db-url";

export default defineConfig({
  test: {
    env: { DATABASE_URL: testDatabaseUrl },
    globalSetup: ["./test/global-setup.ts"],
    // Serialize tests: they share one database and clean up between cases.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: {
    // Let NodeNext ".js" specifiers in the source resolve to ".ts".
    extensionAlias: { ".js": [".ts", ".js"] },
  },
});
