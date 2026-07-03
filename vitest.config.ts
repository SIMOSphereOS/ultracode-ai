import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Emit a JUnit report in CI so GitLab renders the test report and the
    // unit_tests/e2e_tests jobs actually have a junit.xml to upload (they
    // declare `reports: junit`). Locally we keep only the default reporter,
    // so no stray junit.xml is written on developer machines.
    reporters: process.env.CI ? ["default", "junit"] : ["default"],
    outputFile: { junit: "./junit.xml" },
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
