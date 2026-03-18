import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("inventory movement draft defaults", () => {
  it("starts movement quantity blank instead of forcing zero into the form", () => {
    const utilsSource = readFileSync(resolve(process.cwd(), "components/inventory-system/utils.ts"), "utf8")

    expect(utilsSource).toContain('quantity: ""')
    expect(utilsSource).toContain('transaction_type: "deplete"')
  })
})
