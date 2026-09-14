import path from "path"
import { defineProject } from "vitest/config"

/**
 * The render net: components mounted in a real DOM, asserted through the DOM.
 *
 * WHY THIS EXISTS. Roughly seventy of the node-project test files assert by reading source text
 * and matching strings. That suite is genuinely useful — it is how a guard gets pinned to the
 * line of SQL that implements it — but it is blind to a whole class of defect, and that class is
 * the one that has cost real money here:
 *
 *   - payroll's body rows carried nine cells against a twelve-cell header, so every worker's
 *     NET PAYABLE rendered under the heading "Overtime". HTML does not complain about a short
 *     row; it packs the cells left. Source-matching saw a `<TableHead>Overtime</TableHead>` and a
 *     `formatCurrency(w.netPayable)` and had no way to know they had ended up in one column.
 *   - the monthly grid printed one month's rows under another month's heading.
 *   - a tooltip went on describing advances as deducted after recovery moved to its own column.
 *
 * None of those throw. All of them look right in the diff. They are only visible once something
 * renders the markup and reads it back.
 *
 * A second consequence, and the reason this was queued behind the decomposition work: source
 * assertions break when code MOVES. Extracting a render block renames nothing and changes no
 * behaviour, yet every test matching a literal inside it fails — which trains you to edit tests
 * during a refactor, which is exactly when you least want to be editing tests. Assertions that
 * go through the DOM survive the move, because the DOM is what the refactor promises to preserve.
 *
 * NO REACT PLUGIN, DELIBERATELY. tsconfig.json sets `"jsx": "react-jsx"`, Vite's esbuild honours
 * it for .tsx, and nothing here needs Fast Refresh. Adding @vitejs/plugin-react would pull Babel
 * into the test path to produce the same output.
 */
export default defineProject({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "tests/__mocks__/server-only.ts"),
    },
  },
  test: {
    name: "render",
    environment: "jsdom",
    // .test.tsx, so the node project's `tests/**/*.test.ts` can never pick these up.
    include: ["tests/render/**/*.test.tsx"],
    setupFiles: ["tests/render/setup.ts"],
    // Mounting a tree is slower than reading a file. These are still well under a second each,
    // but the default 5s is tight once a component waits on two fetches and a transition.
    testTimeout: 15_000,
  },
})
