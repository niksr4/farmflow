import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Every caller asks for the kind of place it actually means.
 *
 * scripts/128 split `locations` into blocks (where work happens, has acreage) and stores (where
 * stock sits). They are rows in one table, which is cheap and keeps 24 foreign keys working --
 * and it means one careless fetch offers someone the shed as a place they spent a day's labour,
 * or a coffee block as somewhere to keep urea.
 *
 * /api/locations defaults to blocks, because that is what every picker in the app has always
 * meant. This checks the exceptions are deliberate and stay that way -- the tenant shapes are
 * real and varied (Laxmi one estate one store, HoneyFarm three estates sharing one store,
 * Medappa two estates with a store each) so a wrong default is not caught by one tenant looking
 * fine.
 */

const ROOT = path.resolve(__dirname, "..")

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

const files = ["components", "app"].flatMap((d) => walk(path.join(ROOT, d))).map((f) => ({
  rel: path.relative(ROOT, f),
  body: readFileSync(f, "utf8"),
}))

/** Callers that legitimately need both kinds, and why. */
const BOTH_KINDS = new Map<string, string>([
  ["components/tenant-settings-page.tsx", "the settings page manages blocks and stores alike"],
  ["components/inventory-system.tsx", "the dashboard's master list feeds every tab; each narrows it itself"],
])

describe("blocks and stores are asked for by name", () => {
  it("finds the source files", () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it("only the callers that need both kinds ask for both", () => {
    const asking = files
      // The route defines the parameter; it is not a caller of it.
      .filter((f) => f.rel !== "app/api/locations/route.ts")
      .filter((f) => /kind=all/.test(f.body))
      .map((f) => f.rel)
      .sort()
    expect(asking).toEqual([...BOTH_KINDS.keys()].sort())
  })

  it("the inventory dialogs are fed stores, never the block list", () => {
    const shell = files.find((f) => f.rel === "components/inventory-system.tsx")
    expect(shell).toBeDefined()
    // Both the movement drawer and the item dialogs take storeLocations. If either is switched
    // back to estateFilteredLocations, stock becomes something you keep on a coffee block again.
    const storeFeeds = (shell!.body.match(/locations=\{storeLocations\}/g) || []).length
    expect(storeFeeds).toBe(2)
  })

  it("the block list the pickers use is filtered to blocks", () => {
    const shell = files.find((f) => f.rel === "components/inventory-system.tsx")!.body
    // estateFilteredLocations feeds processing, dispatch, labour, expenses and sales. It must be
    // built from blockLocations -- built from the raw list it would include the store.
    expect(shell).toMatch(/estateFilteredLocations = useMemo\(\s*\(\) =>[\s\S]{0,200}blockLocations/)
  })

  it("a store serves its own estate, or every estate when it names none", () => {
    const shell = files.find((f) => f.rel === "components/inventory-system.tsx")!.body
    // The rule itself now lives in lib/estate-shapes.ts and is exercised across every tenant
    // arrangement by tests/tenant-shapes.test.ts. What matters here is that the component still
    // defers to it rather than growing a second copy -- which is exactly how it drifted before.
    expect(shell).toMatch(/storeLocations = useMemo\(\s*\(\) => storesForEstate\(/)
    expect(shell).toContain('from "@/lib/estate-shapes"')
  })
})

describe("estate-general locations stay selectable for cost", () => {
  // scripts/133 split "general" out of "block" so acreage could exclude it. The cost dropdowns
  // must NOT follow: 99.4% of HoneyFarm's spend is filed against a general location, and
  // narrowing this filter to kind === "block" silently removes their most-used option.
  const shell = readFileSync("components/inventory-system.tsx", "utf8")

  it("builds the location dropdowns by excluding stores, not by demanding blocks", () => {
    const memo = shell.slice(shell.indexOf("const blockLocations"), shell.indexOf("const blockLocations") + 260)
    expect(memo).toContain('!== "store"')
    expect(memo).not.toContain('=== "block"')
  })
})
