import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Reuses the `@/*` alias from tsconfig.json so tests import exactly the way
    // application code does — no parallel alias table to keep in sync.
    // Native since Vite 7; the vite-tsconfig-paths plugin is no longer needed.
    tsconfigPaths: true,
  },
  test: {
    // These suites cover pure logic (routing rules, role maths, cookie
    // decoding). `node` is correct and much faster than spinning up jsdom;
    // add a jsdom project when component tests arrive in a later phase.
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/**/*.test.ts"],
      // Access-control logic is small, pure and security-relevant, so it is
      // held to a higher bar than the repo-wide average.
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
