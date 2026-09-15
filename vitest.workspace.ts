import { defineWorkspace } from "vitest/config"

/**
 * Two projects, one `pnpm test`.
 *
 *   unit    vitest.config.ts         node      tests/**\/*.test.ts    (the 210 that already existed)
 *   render  vitest.render.config.ts  jsdom     tests/render/**\/*.test.tsx
 *
 * Referencing the existing config by path rather than inlining it keeps coverage, thresholds and
 * the `server-only` stub exactly where they were — this file adds a project, it does not restate
 * one. Coverage stays a root-level concern in vitest.config.ts and covers both projects.
 */
export default defineWorkspace(["./vitest.config.ts", "./vitest.render.config.ts"])
