import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "shared",
          include: ["packages/shared/src/**/*.test.ts", "packages/shared/tests/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "core",
          include: ["packages/core/src/**/*.test.ts", "packages/core/tests/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "cli",
          include: [
            "packages/cli/src/**/*.test.ts",
            "packages/cli/src/**/*.test.tsx",
            "packages/cli/tests/**/*.test.ts",
            "packages/cli/tests/**/*.test.tsx",
          ],
          environment: "node",
        },
      },
      {
        test: {
          name: "e2e",
          include: ["tests/**/*.test.ts"],
          environment: "node",
          testTimeout: 120_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**"],
      exclude: ["**/*.test.*", "**/dist/**"],
      // CI quality gate: vitest exits non-zero when any threshold is not met,
      // so coverage regressions fail the build.
      thresholds: {
        lines: 85,
        statements: 85,
        branches: 80,
      },
    },
  },
});
