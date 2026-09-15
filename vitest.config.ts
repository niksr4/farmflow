import path from "path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // "server-only" is a Next.js guard that throws in non-server bundles.
      // Vitest runs in Node, so we stub it out with an empty module.
      "server-only": path.resolve(__dirname, "tests/__mocks__/server-only.ts"),
    },
  },
  test: {
    /**
     * One of two projects — see vitest.workspace.ts. This one is the suite as it has always been:
     * `environment: "node"`, 210 files, most of which assert by reading source text. The second
     * ("render") mounts components in jsdom and lives in tests/render/.
     *
     * The split is the point. A jsdom setup file loaded into these 210 would cost every one of
     * them a DOM they do not use, and `include` here deliberately stays `.test.ts` so a render
     * test can never be picked up by the environment that cannot run it.
     */
    name: "unit",
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html", "lcov"],
      reportsDirectory: "coverage",
      // Focus coverage on the pure business/domain logic we can meaningfully unit-test.
      // UI components, API route handlers, and DB/network wrappers are exercised by the
      // Playwright e2e suite instead, so measuring them here would only add misleading noise.
      include: ["lib/**/*.ts", "scripts/migrate-utils.mjs"],
      exclude: [
        "lib/**/*.d.ts",
        "lib/server/**", // server/DB/network wrappers — covered by e2e, not units
        "**/*.test.ts",
      ],
      // Floors set just below the current baseline so the build fails if coverage regresses.
      // Ratchet these upward as more pure logic gains tests.
      thresholds: {
        statements: 50,
        lines: 50,
        functions: 75,
        branches: 70,
      },
    },
  },
})
