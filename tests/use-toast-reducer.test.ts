import { describe, it, expect } from "vitest"
import { reducer } from "@/components/ui/use-toast"

const makeToast = (id: string, overrides: Partial<Record<string, unknown>> = {}) => ({
  id,
  open: true,
  title: `Toast ${id}`,
  ...overrides,
})

describe("use-toast reducer", () => {
  describe("ADD_TOAST", () => {
    it("prepends the new toast and enforces TOAST_LIMIT (1)", () => {
      const state = { toasts: [makeToast("a")] }
      const next = reducer(state, { type: "ADD_TOAST", toast: makeToast("b") as any })
      expect(next.toasts).toHaveLength(1)
      expect(next.toasts[0].id).toBe("b")
    })

    it("adds to an empty list", () => {
      const next = reducer({ toasts: [] }, { type: "ADD_TOAST", toast: makeToast("a") as any })
      expect(next.toasts.map((t) => t.id)).toEqual(["a"])
    })
  })

  describe("UPDATE_TOAST", () => {
    it("merges fields into the matching toast by id, leaving others untouched", () => {
      const state = { toasts: [makeToast("a", { title: "Old" })] }
      const next = reducer(state, { type: "UPDATE_TOAST", toast: { id: "a", title: "New" } as any })
      expect(next.toasts[0].title).toBe("New")
    })

    it("is a no-op when the id doesn't match any toast", () => {
      const state = { toasts: [makeToast("a")] }
      const next = reducer(state, { type: "UPDATE_TOAST", toast: { id: "missing", title: "New" } as any })
      expect(next.toasts).toEqual(state.toasts)
    })
  })

  describe("DISMISS_TOAST", () => {
    it("sets open:false on the matching toast only when toastId is given", () => {
      const state = { toasts: [makeToast("a"), makeToast("b")] }
      const next = reducer(state, { type: "DISMISS_TOAST", toastId: "a" })
      expect(next.toasts.find((t) => t.id === "a")?.open).toBe(false)
      expect(next.toasts.find((t) => t.id === "b")?.open).toBe(true)
    })

    it("sets open:false on every toast when toastId is undefined", () => {
      const state = { toasts: [makeToast("a"), makeToast("b")] }
      const next = reducer(state, { type: "DISMISS_TOAST", toastId: undefined })
      expect(next.toasts.every((t) => t.open === false)).toBe(true)
    })
  })

  describe("REMOVE_TOAST", () => {
    it("removes only the matching toast by id", () => {
      const state = { toasts: [makeToast("a"), makeToast("b")] }
      const next = reducer(state, { type: "REMOVE_TOAST", toastId: "a" })
      expect(next.toasts.map((t) => t.id)).toEqual(["b"])
    })

    it("clears every toast when toastId is undefined", () => {
      const state = { toasts: [makeToast("a"), makeToast("b")] }
      const next = reducer(state, { type: "REMOVE_TOAST", toastId: undefined })
      expect(next.toasts).toEqual([])
    })

    it("is a no-op when the id doesn't match any toast", () => {
      const state = { toasts: [makeToast("a")] }
      const next = reducer(state, { type: "REMOVE_TOAST", toastId: "missing" })
      expect(next.toasts).toEqual(state.toasts)
    })
  })
})
