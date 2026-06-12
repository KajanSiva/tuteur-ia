import { defineConfig } from "vitest/config";

import { testDatabaseUrl } from "./test/db-url";

export default defineConfig({
  resolve: {
    // Let NodeNext ".js" specifiers in the source resolve to ".ts".
    extensionAlias: { ".js": [".ts", ".js"] },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.unit.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.unit.test.ts"],
          env: { DATABASE_URL: testDatabaseUrl },
          globalSetup: ["./test/global-setup.ts"],
          // Serialize files: they share one database and clean up between cases.
          fileParallelism: false,
        },
      },
    ],
  },
});
