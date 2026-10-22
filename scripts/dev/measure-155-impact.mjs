/**
 * READ-ONLY. What would migration 155 actually change in production?
 *
 * 155 replaces the body of `recompute_processing_totals`, which the live trigger on
 * `processing_records` points at, AND backfills sixteen columns on every existing row. So it moves
 * real tenants' historical figures by design -- which is exactly the thing that normally gets
 * refused here without a before/after diff.
 *
 * The migration's own header claims HoneyFarm's figures "are correct and always have been", on the
 * grounds that the old denominator encoded their convention. That is a FALSIFIABLE claim and it is
 * the whole safety argument, so this measures it instead of trusting it.
 *
 * The arithmetic: the old denominator was `green_today + float_today`; the new one, for a `both`
 * route, is `crop_today - ripe_today`. Those are equal only if `crop_today` is exactly
 * `ripe + green + float`. If any row's intake does not add up -- ordinary data-entry slop -- its
 * ratio MOVES. That is the number this script exists to find.
 *
 * Reads DATABASE_URL from the environment, else from .env.vercel.production. Never pass a
 * connection string on a command line.
 */
import { readFileSync } from "node:fs"
import { neon } from "@neondatabase/serverless"

const resolveUrl = () => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  for (const file of [".env.vercel.production", ".env.local"]) {
    try {
      const match = readFileSync(file, "utf8").match(/^DATABASE_URL=["']?([^"'\n]+)/m)
      if (match) return match[1]
    } catch {}
  }
  throw new Error("No DATABASE_URL. Export it, or keep it in .env.vercel.production.")
}

const sql = neon(resolveUrl())

const pct = (n) => (n === null || n === undefined ? "null" : Number(n).toFixed(2))

const main = async () => {
  // Which route each tenant resolves to, by exactly the rule the new function uses.
  const tenants = await sql`
    SELECT t.id,
           t.name,
           CASE
             WHEN lower(trim(COALESCE(t.ui_preferences -> 'n' ->> 'processingRoute', '')))
                  IN ('wet','natural','both')
               THEN lower(trim(t.ui_preferences -> 'n' ->> 'processingRoute'))
             ELSE 'both'
           END                                           AS route,
           (SELECT COUNT(*) FROM processing_records p WHERE p.tenant_id = t.id)::int AS rows
    FROM tenants t
    ORDER BY rows DESC, t.name
  `

  console.log("\nROUTE AND ROW COUNT PER TENANT")
  for (const t of tenants) {
    console.log(`  ${String(t.rows).padStart(4)}  ${t.route.padEnd(8)}  ${t.name}`)
  }

  // The comparison. `expected` is the new expression; `dry_cherry_percent` is what is stored now.
  const rows = await sql`
    SELECT t.name AS tenant,
           CASE
             WHEN lower(trim(COALESCE(t.ui_preferences -> 'n' ->> 'processingRoute', '')))
                  IN ('wet','natural','both')
               THEN lower(trim(t.ui_preferences -> 'n' ->> 'processingRoute'))
             ELSE 'both'
           END AS route,
           p.process_date::text AS day,
           p.crop_today, p.ripe_today, p.green_today, p.float_today, p.dry_cherry,
           p.dry_cherry_percent AS stored,
           CASE
             WHEN (CASE
                     WHEN lower(trim(COALESCE(t.ui_preferences -> 'n' ->> 'processingRoute', '')))
                          IN ('wet','natural','both')
                       THEN lower(trim(t.ui_preferences -> 'n' ->> 'processingRoute'))
                     ELSE 'both' END) = 'wet' THEN 0
             WHEN GREATEST(
                    COALESCE(p.crop_today, 0)
                      - CASE WHEN (CASE
                                     WHEN lower(trim(COALESCE(t.ui_preferences -> 'n' ->> 'processingRoute', '')))
                                          IN ('wet','natural','both')
                                       THEN lower(trim(t.ui_preferences -> 'n' ->> 'processingRoute'))
                                     ELSE 'both' END) = 'natural'
                             THEN 0 ELSE COALESCE(p.ripe_today, 0) END,
                    0) > 0
             THEN ROUND(
                    (COALESCE(p.dry_cherry, 0)
                      / GREATEST(
                          COALESCE(p.crop_today, 0)
                            - CASE WHEN (CASE
                                           WHEN lower(trim(COALESCE(t.ui_preferences -> 'n' ->> 'processingRoute', '')))
                                                IN ('wet','natural','both')
                                             THEN lower(trim(t.ui_preferences -> 'n' ->> 'processingRoute'))
                                           ELSE 'both' END) = 'natural'
                                   THEN 0 ELSE COALESCE(p.ripe_today, 0) END,
                          0)
                    ) * 100, 2)
             ELSE 0
           END AS expected
    FROM processing_records p
    JOIN tenants t ON t.id = p.tenant_id
    ORDER BY t.name, p.process_date
  `

  const moved = rows.filter(
    (r) => Math.abs(Number(r.expected ?? 0) - Number(r.stored ?? 0)) > 0.005,
  )

  console.log(`\nCOMPARED ${rows.length} processing rows across every tenant.`)
  console.log(`ROWS WHOSE dry_cherry_percent WOULD MOVE: ${moved.length}\n`)

  if (moved.length) {
    console.log("  tenant            day         route    stored -> new    crop/ripe/green/float")
    for (const r of moved.slice(0, 40)) {
      console.log(
        `  ${String(r.tenant).padEnd(17)} ${r.day}  ${String(r.route).padEnd(8)} ` +
          `${pct(r.stored).padStart(7)} -> ${pct(r.expected).padStart(7)}    ` +
          `${r.crop_today}/${r.ripe_today}/${r.green_today}/${r.float_today}`,
      )
    }
    if (moved.length > 40) console.log(`  ... and ${moved.length - 40} more`)
  }

  // The root cause test, stated separately so the reason is visible rather than inferred.
  const slop = await sql`
    SELECT t.name AS tenant, COUNT(*)::int AS n
    FROM processing_records p
    JOIN tenants t ON t.id = p.tenant_id
    WHERE ABS(COALESCE(p.crop_today,0)
              - (COALESCE(p.ripe_today,0) + COALESCE(p.green_today,0) + COALESCE(p.float_today,0))
          ) > 0.005
    GROUP BY t.name
    ORDER BY n DESC
  `
  console.log("\nROWS WHERE crop_today <> ripe + green + float (the only way a `both` route moves):")
  if (!slop.length) console.log("  none -- intake adds up on every row, in every tenant")
  for (const s of slop) console.log(`  ${String(s.n).padStart(4)}  ${s.tenant}`)

  console.log(
    moved.length === 0
      ? "\n✓ SAFE TO APPLY: no stored ratio changes for any tenant.\n"
      : `\n⚠ ${moved.length} row(s) WOULD CHANGE -- read them before applying.\n`,
  )
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
