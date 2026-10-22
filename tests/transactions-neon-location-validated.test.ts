import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Foreign-key checks ignore row level security, so a location_id written without checking it
 * belongs to the caller's tenant is accepted if it points at ANOTHER tenant's location. The three
 * inventory-transaction write routes took location_id straight from the request body.
 */
const ROUTES = [
  "app/api/transactions-neon/route.ts",
  "app/api/transactions-neon/update/route.ts",
  "app/api/transactions-neon/batch/route.ts",
]

describe("transactions-neon write routes validate location_id against the tenant", () => {
  for (const route of ROUTES) {
    const source = readFileSync(resolve(__dirname, "..", route), "utf8")

    it(`${route} imports and calls validateLocationForTenant`, () => {
      expect(source).toMatch(/import \{ validateLocationForTenant \} from "@\/lib\/server\/location-utils"/)
      expect(source).toMatch(/await validateLocationForTenant\(/)
    })

    it(`${route} maps a location-access refusal to 403`, () => {
      expect(source).toMatch(/isLocationAccessError\(error\)/)
    })
  }
})
