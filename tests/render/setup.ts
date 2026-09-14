import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

/**
 * What jsdom does not implement, and Radix assumes.
 *
 * These are not conveniences — each one is a hard crash without the shim, and the crash is always
 * inside a Radix primitive rather than in the code under test, which makes it read like a bug in
 * the component. Kept in one place so the next render test does not have to rediscover them.
 *
 * Nothing here fakes BEHAVIOUR. They are the smallest possible stand-ins for browser APIs that
 * report layout, which jsdom has none of. A test that needs to assert on layout is a test that
 * belongs in Playwright, not here.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

// Radix Select/Tooltip call all three while deciding where to put a popper.
Element.prototype.scrollIntoView ??= function scrollIntoView() {}
Element.prototype.hasPointerCapture ??= function hasPointerCapture() {
  return false
}
Element.prototype.setPointerCapture ??= function setPointerCapture() {}
Element.prototype.releasePointerCapture ??= function releasePointerCapture() {}

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia

/**
 * Blob URLs, for the export buttons.
 *
 * jsdom has no object-URL registry at all, so `URL.createObjectURL` is undefined and any export
 * handler throws on the line after it builds the file. Returning a fake handle lets the handler
 * run to completion, which is the part worth testing: that it built the right rows. Whether the
 * browser then downloaded them is not this suite's business.
 */
URL.createObjectURL ??= () => "blob:farmflow-test"
URL.revokeObjectURL ??= () => {}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
