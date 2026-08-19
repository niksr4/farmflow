/**
 * Every shape an estate can be, and which storehouse each one reaches.
 *
 * Run: node scripts/dev/estate-store-shapes.mjs   (DATABASE_URL exported = production)
 *
 * The four real arrangements:
 *   1 estate,  1 store                      -- Laxmi
 *   n estates, 1 store shared across them   -- HoneyFarm (HF, MV, PG, one shed)
 *   n estates, 1 store each                 -- Medappa (Tirtha, Citrus Grove)
 *   n estates, some shared and some own     -- nobody yet, but it falls out for free
 *
 * A store with no estate serves everything; a store naming an estate serves that one. Blocks work
 * the identical way, so there is one rule rather than two. This walks each tenant and prints what
 * a user actually sees per selection.
 */
import { neon } from "@neondatabase/serverless"
const sql = neon(process.env.DATABASE_URL)

/** Mirrors storeLocations in inventory-system.tsx. If they drift, this is the one that is wrong. */
const storesFor = (stores, estate) =>
  estate ? stores.filter((s) => !s.estate || s.estate === estate) : stores

for (const t of await sql`SELECT id, name FROM tenants ORDER BY name`) {
  const locs = await sql`SELECT name, estate, kind FROM locations WHERE tenant_id=${t.id} ORDER BY kind, name`
  if (!locs.length) continue
  const stores = locs.filter((l) => l.kind === "store")
  const blocks = locs.filter((l) => l.kind !== "store")
  const estates = [...new Set(locs.map((l) => l.estate).filter(Boolean))]
  const shared = stores.filter((s) => !s.estate)

  const shape =
    stores.length === 0 ? "no store yet"
    : estates.length <= 1 ? "one estate, one store"
    : shared.length && stores.length === shared.length ? `${estates.length} estates sharing one store`
    : shared.length === 0 ? `${estates.length} estates, a store each`
    : `${estates.length} estates, ${shared.length} shared + ${stores.length - shared.length} own`

  console.log(`\n${t.name} — ${shape}`)
  console.log(`  ${estates.length || "no"} estate(s), ${blocks.length} block(s), ${stores.length} store(s)`)

  // The selector offers estates only above one.
  const selections = estates.length > 1 ? [null, ...estates] : [null]
  for (const sel of selections) {
    const reach = storesFor(stores, sel)
    const blocksSeen = sel ? blocks.filter((b) => !b.estate || b.estate === sel) : blocks
    console.log(
      `    ${(sel ?? "All estates").padEnd(16)} -> stores: ${reach.map((s) => s.name).join(", ") || "none"}` +
      `  |  blocks: ${blocksSeen.length}`,
    )
  }
  if (stores.length > 1) {
    console.log(`    note: ${stores.length} sheds, so stock of the same item is two piles, not one total`)
  }
}
console.log()
