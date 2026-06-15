import tseslint from "typescript-eslint";

// A targeted, type-aware guardrail — NOT a style linter. It enforces the few
// rules that catch real correctness/safety mistakes on the backend (the moat):
// unawaited promises, `any` leaking from untyped boundaries (LLM tool args,
// JSON), and pointless or unsafe casts. Object-literal casts are banned to push
// toward `satisfies`; plain `as` (e.g. value→unknown bridges) stays allowed.
// The frontend is out of scope here (its AI-SDK surfaces are loosely typed).
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "apps/backend/src/generated/**",
      "apps/frontend/**",
      "**/vitest.config.ts",
      "apps/backend/prisma/**",
      "apps/backend/prisma.config.ts",
    ],
  },
  {
    files: ["apps/backend/**/*.ts", "packages/shared/**/*.ts"],
    extends: [tseslint.configs.base],
    languageOptions: {
      parserOptions: {
        // Test files live in tsconfig.test.json (the default config excludes
        // them); list both so type-aware linting covers source and tests.
        project: [
          "apps/backend/tsconfig.json",
          "apps/backend/tsconfig.test.json",
          "packages/shared/tsconfig.json",
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "as", objectLiteralTypeAssertions: "never" },
      ],
    },
  },
);
