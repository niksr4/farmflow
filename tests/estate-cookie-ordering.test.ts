import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(resolve(__dirname, "../components/inventory-system.tsx"), "utf8")

const writer = source.slice(
  source.indexOf("function writeEstateCookie"),
  source.indexOf("export default function InventorySystem"),
)

/**
 * The estate cookie must be written before the re-render that remounts the tabs.
 *
 * Fifteen tabs are keyed on `estateRemountKey`, so switching estate unmounts and remounts every one
 * of them, and each refetches on mount with the server reading this cookie. React runs effects
 * child-first, so a cookie written only in the parent's effect lands AFTER every remounted child
 * has already fired its request -- each one asking for the estate the user just left.
 *
 * That is a one-render-behind error, and it is invisible: what comes back is real, correctly
 * scoped data for the wrong estate. The muster only made it visible because its roll and its
 * save-bar count came from differently-scoped queries and disagreed on screen.
 *
 * `document.cookie` is synchronous, so writing it in the change handler before setState closes the
 * window entirely -- for all fifteen tabs, and for any tab added later, without threading a prop
 * through each one.
 */
describe("the estate cookie is written before the remount", () => {
  it("the change handler writes the cookie before it sets state", () => {
    const handler = source.slice(
      source.indexOf("const handleEstateChange"),
      source.indexOf("const handleEstateChange") + 400,
    )
    expect(handler).toContain("writeEstateCookie(estate)")
    expect(handler).toContain("setSelectedEstate(estate)")
    // Order is the fix. Reversed, this is the original bug.
    expect(handler.indexOf("writeEstateCookie")).toBeLessThan(handler.indexOf("setSelectedEstate"))
  })

  it("the selector calls that handler, not the raw setter", () => {
    // Wiring onEstateChange straight to setSelectedEstate is exactly how this regressed.
    expect(source).toContain("onEstateChange={handleEstateChange}")
    expect(source).not.toContain("onEstateChange={setSelectedEstate}")
  })

  it("keeps the effect as a backstop for paths that bypass the handler", () => {
    // First load, and any future code that sets the estate directly.
    expect(source).toMatch(/useEffect\(\(\) => \{\s*writeEstateCookie\(selectedEstate\)/)
  })

  it("writes the estate cookie in exactly one place", () => {
    // Two copies of a cookie-writing line is how one drifts out of step with the other.
    // Set and clear, both inside the writer.
    expect((writer.match(/\$\{SELECTED_ESTATE_COOKIE\}=/g) ?? []).length).toBe(2)

    // And nothing outside it assigns document.cookie for this one. The remaining mention in the
    // file is the init-time READ that parses it back, which is not a write.
    const outside = source.replace(writer, "")
    expect(outside).not.toMatch(/document\.cookie\s*=[^\n]*SELECTED_ESTATE_COOKIE/)
  })
})
