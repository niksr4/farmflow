import { describe, it, expect } from "vitest"
import * as fromHooks from "@/hooks/use-toast"
import * as fromComponentsUi from "@/components/ui/use-toast"

// Regression test for a real bug found 2026-08-28: hooks/use-toast.ts used to be a byte-for-byte
// duplicate of components/ui/use-toast.ts, giving it its own module-level `memoryState`/
// `listeners` singleton. <Toaster/> (app/layout.tsx) only ever subscribes to
// components/ui/use-toast's store, so every one of the 18 files that imported `useToast`/`toast`
// from "@/hooks/use-toast" (sales-tab, dispatch-tab, admin-page, tenant-settings-page, and more)
// was calling toast() into a store nothing was listening to -- the call succeeded but no toast
// ever appeared. Fixed by making hooks/use-toast.ts re-export components/ui/use-toast.ts instead
// of duplicating it. This test asserts the two modules resolve to the exact same function
// references (not just structurally-equal copies), which is what a re-export guarantees and a
// duplicate file would not.
describe("hooks/use-toast re-exports the single components/ui/use-toast store", () => {
  it("toast is the identical function reference from both import paths", () => {
    expect(fromHooks.toast).toBe(fromComponentsUi.toast)
  })

  it("useToast is the identical function reference from both import paths", () => {
    expect(fromHooks.useToast).toBe(fromComponentsUi.useToast)
  })

  it("reducer is the identical function reference from both import paths", () => {
    expect(fromHooks.reducer).toBe(fromComponentsUi.reducer)
  })
})
